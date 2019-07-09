const { sep, relative, resolve, join } = require('path')

const fg = require('fast-glob')
// const { readdir, mkdirp } = require('fs-extra')
const { difference, intersection, uniq } = require('lodash')
const NodeSsh = require('node-ssh')

async function sftpReadDir({ sftp, dir, createDir = false }) {
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
    if (err.code === 2 && createDir) {
      console.log(`Directory ${dir} does not exist. Creating it.`)

      const dirs = dir.split(sep)

      for (let depth = 0; depth <= dirs.length; depth++) {
        try {
          await new Promise((resolve, reject) => {
            const dirToCreate = join(dirs.slice(0, depth).join(sep))
            console.log({ dirToCreate })
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

      return []
    }

    throw err
  }
}

function buildFileMap(list) {
  return list.reduce((map, file) => ({ ...map, [file.path]: file }), {})
}

async function getLocalFiles(dir, localDir) {
  const tree = await fg([join(dir, '**', '*')], { stats: true })
  return tree.map(({ name, path, stats: { size, atime, mtime, ctime } }) => ({
    name,
    path: relative(localDir, path),
    stats: {
      size,
      mtime: new Date(mtime)
    }
  }))
}
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
          mtime: new Date(mtime * 1000)
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
  try {
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
    const localCacheDir = relative(localDir, dirsToCache[0])
    const remoteCacheDir = resolve(remoteDir, cacheDirName)

    const localFiles = await getLocalFiles(localCacheDir, localCacheDir)
    const remoteFiles = await getRemoteFiles(
      sftp,
      remoteCacheDir,
      remoteCacheDir
    )

    const localMap = buildFileMap(localFiles)
    const remoteMap = buildFileMap(remoteFiles)

    console.log({ localMap, remoteMap })

    /**
     * find files missing local
     * find files missing remote
     * find files newer local
     * find files newer remote
     * find files size different
     */

    const missingLocal = difference(
      Object.keys(remoteMap),
      Object.keys(localMap)
    )

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

    // console.log({
    //   missingLocal,
    //   missingRemote,
    //   newerLocal,
    //   newerRemote,
    //   sizeDifferend: sizeDifferent
    // })

    if (syncDirection === 'cache') {
      const filesToCache = uniq([
        ...missingRemote,
        ...newerLocal,
        ...sizeDifferent
      ]).sort()
      console.log(
        { filesToCache },
        `Caching ${filesToCache.length} files to ${connection.host}`
      )
      for (let path of filesToCache) {
        // @todo mkdirp!
        console.log(localMap[path].path, join(remoteCacheDir, path))
        console.log(`Caching ${path}`)
        await ssh.putFile(join(localCacheDir, path), join(remoteCacheDir, path))
      }
    }

    if (syncDirection === 'download') {
      const filesToDownload = uniq([
        ...missingLocal,
        ...newerRemote,
        ...sizeDifferent
      ]).sort()
      console.log(
        { filesToDownload },
        `Downloading ${filesToDownload.length} files from ${connection.host}`
      )
      for (let path of filesToDownload) {
        // @todo mkdirp!
        console.log(`Downloading ${path}`)
        await ssh.getFile(join(remoteCacheDir, path), join(localCacheDir, path))
      }
    }

    console.log('Finished')
  } catch (err) {
    console.log('Sync failed!!!!')
    console.error(err)
  }
}
