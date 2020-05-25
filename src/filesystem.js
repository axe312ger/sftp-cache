const { relative, join } = require('path')
const { platform } = require('os')

const execa = require('execa')
const fg = require('fast-glob')

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

    // const os = platform()
    // let md5Command = 'md5sum'
    // let md5Params = [path]

    // if (os === 'darwin') {
    //   md5Command = 'md5'
    //   md5Params = ['-q', path]
    // }

    // if (os === 'win32') {
    //   md5Command = 'CertUtil'
    //   md5Params = ['-hashfile', path, 'MD5']
    // }

    // const { stdout } = await execa(md5Command, md5Params)
    // const md5 = stdout.match(/[a-f0-9]{32}/)[0]

    list.push({
      name,
      path: relative(localDir, path),
      stats: {
        size,
        mtime: Math.floor(new Date(mtime).getTime() / 1000)
        // md5
      }
    })
  }

  return list
}

module.exports = {
  getLocalFiles
}
