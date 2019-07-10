const { relative, join } = require('path')

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

module.exports = {
  sftpMkdirP,
  sftpReadDir,
  getRemoteFiles
}
