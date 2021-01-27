const { relative, join } = require('path')

async function sftpMkdirP({ sftp, dir }) {
  const dirs = dir.split('/')
  for (let depth = 0; depth <= dirs.length; depth++) {
    try {
      await new Promise((resolve, reject) => {
        const dirToCreate = join(dirs.slice(0, depth).join('/'))
        sftp.mkdir(dirToCreate, function (err) {
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
      sftp.readdir(dir, function (err, list) {
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

// Recursively walk folder on remote and gather files with stats
async function getRemoteFiles({
  // ssh,
  sftp,
  dir,
  remoteCacheDir
}) {
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
        path: relative(remoteCacheDir, join(dir, filename)),
        stats: {
          size,
          mtime
        }
      })
      continue
    }

    const subDirList = await getRemoteFiles({
      sftp,
      dir: path,
      remoteCacheDir
    })

    list = [...list, ...subDirList]
  }

  return list
}

async function getRemoteMd5({ ssh, path }) {
  const md5sum = await ssh.exec('md5sum', [path])

  const md5 = md5sum.split(' ')[0].trim()

  return md5
}

class TimeoutError extends Error {
  constructor(timeout, path, ...params) {
    const seconds = timeout / 1000

    super(
      `Network issue: Aborting upload of ${path} after ${seconds.toFixed(
        2
      )} seconds`,
      ...params
    )

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, TimeoutError)
    }

    this.name = 'TimeoutError'
    this.path = path
  }
}

async function cacheFile({
  ssh,
  sftp,
  path,
  stats,
  localCacheDir,
  remoteCacheDir
}) {
  const { mtime, size } = stats

  const localPath = join(localCacheDir, path)
  const remotePath = join(remoteCacheDir, path)

  // 10 seconds plus theoretical upload time with a 5mbit connection
  const timeout = Math.ceil(
    10 * 1000 + ((size * 8) / (5 * Math.pow(10, 6))) * 1000
  )
  let uploaded = false

  const cacheFile = async (localPath, remotePath) => {
    await ssh.putFile(localPath, remotePath, null, {
      // @todo add code that aborts stalled uploads, should add extra performance on laggy connections
      // step: (total_transferred, chunk, total) => {
      //     console.log(path, 'uploaded', total_transferred, 'of', total);
      // }
    })
    uploaded = true
  }

  await Promise.race([
    cacheFile(localPath, remotePath),
    new Promise((resolve, reject) =>
      setTimeout(
        () => !uploaded && reject(new TimeoutError(timeout, path)),
        timeout
      )
    )
  ])

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
  console.log(`Cached ${path}`)
}

module.exports = {
  sftpMkdirP,
  sftpReadDir,
  getRemoteFiles,
  getRemoteMd5,
  cacheFile,
  TimeoutError
}
