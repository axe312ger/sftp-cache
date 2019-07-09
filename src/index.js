const { relative, resolve, join, dirname } = require('path')

const fg = require('fast-glob')
const { mkdirp, utimes } = require('fs-extra')
const { difference, intersection, uniq } = require('lodash')
const NodeSsh = require('node-ssh')

async function sftpMkdirP({ sftp, dir }) {
  const dirs = dir.split('/')
  for (let depth = 0; depth <= dirs.length; depth++) {
    try {
      await new Promise((resolve, reject) => {
        const dirToCreate = join(dirs.slice(0, depth).join('/'))
        sftp.mkdir(dirToCreate, function(err) {
          if (err) {
            reject(err)
          }
          resolve()
        })
      })
    } catch (err) {
      if (err.code !== 4) {
        throw err
      }
    }
  }
}

async function sftpReadDir({ sftp, dir }) {
  try {
    const files = await new Promise((resolve, reject) => {
      sftp.readdir(dir, function(err, list) {
        if (err) {
          reject(err)
        }
        resolve(list)
      })
    })
    return files
  } catch (err) {
    if (err.code === 2) {
      console.log(`Directory ${dir} does not exist. Creating it.`)

      await sftpMkdirP({ sftp, dir })
      return []
    }

    throw err
  }
}

// Array of files to map of files by relative path in cache
function buildFileMap(list) {
  return list.reduce((map, file) => ({ ...map, [file.path]: file }), {})
}

// Recursively walk folder on local machine and gather files with stats
async function getLocalFiles(dir, localDir) {
  const tree = await fg([join(dir, '**', '*')], { stats: true })
  return tree.map(({ name, path, stats: { size, atime, mtime, ctime } }) => ({
    name,
    path: relative(localDir, path),
    stats: {
      size,
      mtime: Math.floor(new Date(mtime).getTime() / 1000)
    }
  }))
}

// Recursively walk folder on remote and gather files with stats
async function getRemoteFiles(sftp, dir, remoteDir) {
  console.log(`Looking for remote files at ${dir}...`)
  const files = await sftpReadDir({ sftp, dir })

  let list = []

  for (let file of files) {
    const {
      filename,
      longname,
      attrs: { size, mtime }
    } = file
    const path = join(dir, filename)
    if (longname[0] !== 'd') {
      list.push({
        name: filename,
        path: relative(remoteDir, join(dir, filename)),
        stats: {
          size,
          mtime
        }
      })
      continue
    }

    const subDirList = await getRemoteFiles(sftp, path, remoteDir)

    list = [...list, ...subDirList]
  }

  return list
}

module.exports = async function sftpCache({
  connection,
  localDir,
  remoteDir,
  dirsToCache,
  syncDirection
}) {
  if (!syncDirection) {
    throw new Error(
      'No sync direction passed (download|cache). You can either download the files to this machine or refill the cache on remote.'
    )
  }
  const ssh = new NodeSsh()
  await ssh.connect(connection)
  const sftp = await ssh.requestSFTP()

  // @todo support multiple dirs
  const cacheDirName = dirsToCache[0].replace(/\//g, '--')
  const localCacheDir = resolve(localDir, dirsToCache[0])
  const remoteCacheDir = resolve(remoteDir, cacheDirName)

  const localFiles = await getLocalFiles(localCacheDir, localCacheDir)
  const remoteFiles = await getRemoteFiles(sftp, remoteCacheDir, remoteCacheDir)

  const localMap = buildFileMap(localFiles)
  const remoteMap = buildFileMap(remoteFiles)

  /**
   * find files missing local
   * find files missing remote
   * find files newer local
   * find files newer remote
   * find files size different
   */

  const missingLocal = difference(Object.keys(remoteMap), Object.keys(localMap))

  const missingRemote = difference(
    Object.keys(localMap),
    Object.keys(remoteMap)
  )

  const existing = intersection(Object.keys(localMap), Object.keys(remoteMap))

  const newerLocal = existing
    .map((path) => {
      const localFile = localMap[path]
      const remoteFile = remoteMap[path]

      if (localFile.stats.mtime > remoteFile.stats.mtime) {
        return path
      }
    })
    .filter(Boolean)

  const newerRemote = existing
    .map((path) => {
      const localFile = localMap[path]
      const remoteFile = remoteMap[path]

      if (remoteFile.stats.mtime > localFile.stats.mtime) {
        return path
      }
    })
    .filter(Boolean)

  const sizeDifferent = existing
    .map((path) => {
      const localFile = localMap[path]
      const remoteFile = remoteMap[path]

      if (remoteFile.stats.size !== localFile.stats.size) {
        return path
      }
    })
    .filter(Boolean)

  console.log({
    missingLocal: missingLocal.map((path) => path),
    missingRemote: missingRemote.map((path) => path),
    newerLocal: newerLocal.map((path) => path),
    newerRemote: newerRemote.map((path) => path),
    sizeDifferent: sizeDifferent.map((path) => path)
  })

  if (syncDirection === 'cache') {
    const filesToCache = uniq([
      ...missingRemote,
      ...newerLocal,
      ...sizeDifferent
    ]).sort()
    console.log(`Caching ${filesToCache.length} files to ${connection.host}`)

    for (let path of filesToCache) {
      console.log(
        `Caching ${path}\n${join(remoteCacheDir, path)} -> ${join(
          localCacheDir,
          path
        )}`
      )
      const localPath = join(localCacheDir, path)
      const remotePath = join(remoteCacheDir, path)
      await ssh.putFile(localPath, remotePath)
      const { mtime } = localMap[path].stats
      await new Promise((resolve, reject) => {
        sftp.setstat(
          remotePath,
          {
            mtime,
            atime: mtime
          },
          (err) => {
            if (err) {
              return reject(err)
            }
            resolve()
          }
        )
      })
    }
  }

  if (syncDirection === 'download') {
    const filesToDownload = uniq([
      ...missingLocal,
      ...newerRemote,
      ...sizeDifferent
    ]).sort()
    console.log(
      `Downloading ${filesToDownload.length} files from ${connection.host}`
    )
    for (let path of filesToDownload) {
      console.log(
        `Downloading ${path}\n${join(remoteCacheDir, path)} -> ${join(
          localCacheDir,
          path
        )}`
      )
      const localPath = join(localCacheDir, path)
      const remotePath = join(remoteCacheDir, path)
      await mkdirp(dirname(localPath))
      await ssh.getFile(localPath, remotePath)
      const { mtime } = remoteMap[path].stats
      await utimes(localPath, mtime, mtime)
    }
  }

  console.log('Finished')
}
