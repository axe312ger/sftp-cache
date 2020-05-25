const { resolve } = require('path')

const { getRemoteFiles } = require('./sftp')

test('parses remote directory', async () => {
  const remoteCacheDir = '/home/cache/some/dir/'
  const dir = resolve(remoteCacheDir, 'dir-to-cache')

  const sftp = {
    readdir: (dirToRead, cb) => {
      if (dirToRead === dir) {
        return cb(false, [
          {
            filename: 'example-file-name.md',
            longname: 'file',
            attrs: { size: '123', mtime: '456' }
          },
          {
            filename: 'subdir',
            longname: 'directory',
            attrs: {}
          }
        ])
      }
      if (dirToRead === resolve(dir, 'subdir')) {
        return cb(false, [
          {
            filename: 'file-with-content.md',
            longname: 'file',
            attrs: { size: '123', mtime: '456' }
          }
        ])
      }

      return cb(new Error('oops'))
    }
  }

  const tree = await getRemoteFiles({ sftp, dir, remoteCacheDir })

  expect(tree).toMatchSnapshot()
})
