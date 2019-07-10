const { relative, join } = require('path')

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

module.exports = {
  getLocalFiles
}
