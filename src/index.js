const { relative, resolve, join, dirname } = require('path')

const execa = require('execa')
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
  const files = await fg([join(dir, '**', '*')], { stats: true })

  const list = []
  for (const file of files) {
    const {
      name,
      path,
      stats: { size, mtime }
    } = file

    const { stdout } = await execa('md5', ['-q', path])
    const md5 = stdout.trim()

    list.push({
      name,
      path: relative(localDir, path),
      stats: {
        size,
        mtime: Math.floor(new Date(mtime).getTime() / 1000),
        md5
      }
    })
  }

  return list
}

// Recursively walk folder on remote and gather files with stats
async function getRemoteFiles({ ssh, sftp, dir, remoteCacheDir }) {
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
      const md5sum = await ssh.exec('md5sum', [join(dir, filename)])

      const md5 = md5sum.split(' ')[0].trim()

      list.push({
        name: filename,
        path: relative(remoteCacheDir, join(dir, filename)),
        stats: {
          size,
          mtime,
          md5
        }
      })
      continue
    }

    const subDirList = await getRemoteFiles({
      ssh,
      sftp,
      dir: path,
      remoteCacheDir
    })

    list = [...list, ...subDirList]
  }

  return list
}

async function syncDir({
  connection,
  ssh,
  sftp,
  localDir,
  remoteDir,
  dirToCache,
  syncDirection
}) {
  const cacheDirName = dirToCache.replace(/\//g, '--')
  const localCacheDir = resolve(localDir, dirToCache)
  const remoteCacheDir = resolve(remoteDir, cacheDirName)

  const localFiles = await getLocalFiles(localCacheDir, localCacheDir)
  const remoteFiles = await getRemoteFiles({
    ssh,
    sftp,
    dir: remoteCacheDir,
    remoteCacheDir
  })

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

  const md5Different = existing
    .map((path) => {
      const localFile = localMap[path]
      const remoteFile = remoteMap[path]

      if (remoteFile.stats.md5 !== localFile.stats.md5) {
        console.log(remoteFile.stats.md5, '!==', localFile.stats.md5)
        return path
      }
    })
    .filter(Boolean)

  console.log({
    missingLocal: missingLocal.map((path) => path),
    missingRemote: missingRemote.map((path) => path),
    newerLocal: newerLocal.map((path) => path),
    newerRemote: newerRemote.map((path) => path),
    sizeDifferent: sizeDifferent.map((path) => path),
    md5Different: md5Different.map((path) => path)
  })

  if (syncDirection === 'cache') {
    const filesToCache = uniq([
      ...missingRemote,
      //  ...newerLocal,
      //  ...sizeDifferent,
      ...md5Different
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
      //  ...newerRemote,
      //  ...sizeDifferent
      ...md5Different
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
  console.log(`Connecting via ssh to ${connection.host}`)
  const ssh = new NodeSsh()
  await ssh.connect(connection)
  const sftp = await ssh.requestSFTP()

  for (let dirToCache of dirsToCache) {
    console.log(`Processing ${dirToCache}`)
    await syncDir({
      connection,
      ssh,
      sftp,
      localDir,
      remoteDir,
      dirToCache,
      syncDirection
    })
  }

  console.log(`Closing ssh connection to ${connection.host}`)
  ssh.end()
  console.log('Finished')
}
