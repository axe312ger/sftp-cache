const { resolve, join, dirname } = require('path')

const { mkdirp, utimes } = require('fs-extra')
const { NodeSSH } = require('node-ssh')
const { default: PQueue } = require('p-queue')

const diff = require('./diff')
const { getRemoteFiles, cacheFile, TimeoutError } = require('./sftp')
const { getLocalFiles } = require('./filesystem')

// Array of files to map of files by relative path in cache
function buildFileMap(list) {
  return list.reduce((map, file) => ({ ...map, [file.path]: file }), {})
}

async function syncDir({
  queue,
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

  const { filesToDownload, filesToUpload } = await diff({
    ssh,
    localMap,
    remoteMap,
    localDir: localCacheDir,
    remoteDir: remoteCacheDir
  })

  if (syncDirection === 'cache') {
    console.log(`Caching ${filesToUpload.length} files to ${connection.host}`)

    await Promise.all(
      filesToUpload.map((path) =>
        queue.add(async () => {
          console.log(`Start caching ${path}`)
          const stats = localMap[path].stats
          let tries = 0
          let cached = false

          while (!cached) {
            tries++

            try {
              await cacheFile({
                ssh,
                sftp,
                path,
                stats,
                localCacheDir,
                remoteCacheDir
              })
              cached = true
            } catch (err) {
              if (err instanceof TimeoutError) {
                console.log(err.message)
              } else {
                console.error(err)
              }
              if (tries === 5) {
                try {
                  const remotePath = join(remoteCacheDir, path)
                  await ssh.exec('rm', [remotePath])
                } catch (err) {
                  console.log('Unable to remove unfinished file fragment')
                }
                throw new Error(`Unable to cache ${path} in 5 attempts.`)
              }
              console.log(`Retry #${tries + 1}: Start caching ${path}`)
            }
          }
        })
      )
    )
  }

  if (syncDirection === 'download') {
    console.log(
      `Downloading ${filesToDownload.length} files from ${connection.host}`
    )
    await Promise.all(
      filesToDownload.map((path) =>
        queue.add(async () => {
          console.log(`Downloading ${path}`)
          const localPath = join(localCacheDir, path)
          const remotePath = join(remoteCacheDir, path)
          await mkdirp(dirname(localPath))
          await ssh.getFile(localPath, remotePath)
          const { mtime } = remoteMap[path].stats
          await utimes(localPath, mtime, mtime)
        })
      )
    )
  }
}

module.exports = async function sftpCache({
  connection,
  localDir,
  remoteDir,
  dirsToCache,
  syncDirection,
  concurrency = 5
}) {
  if (!syncDirection) {
    throw new Error(
      'No sync direction passed (download|cache). You can either download the files to this machine or refill the cache on remote.'
    )
  }

  const queue = new PQueue({ concurrency })

  console.log(`Connecting via ssh to ${connection.host}`)
  const ssh = new NodeSSH()
  await ssh.connect(connection)
  const sftp = await ssh.requestSFTP()

  for (let dirToCache of dirsToCache) {
    console.log(`Processing ${dirToCache}`)
    await syncDir({
      queue,
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
  ssh.dispose()
  console.log('Finished')
}
