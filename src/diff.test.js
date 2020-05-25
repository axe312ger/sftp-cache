const { resolve } = require('path')

const diff = require('./diff')

test('parses local directory', async () => {
  const localMap = {
    'dir-to-cache/file-in-root-dir.empty': {
      name: 'file-in-root-dir.empty',
      path: 'dir-to-cache/file-in-root-dir.empty',
      stats: {
        mtime: 1590433826,
        size: 0
      }
    },
    'dir-to-cache/subdir/file-with-content.md': {
      name: 'file-with-content.md',
      path: 'dir-to-cache/subdir/file-with-content.md',
      stats: {
        mtime: 1590433917,
        size: 2307
      }
    }
  }
  const remoteMap = {
    'dir-to-cache/example-file-name.md': {
      name: 'example-file-name.md',
      path: 'dir-to-cache/example-file-name.md',
      stats: {
        mtime: '456',
        size: '123'
      }
    },
    'dir-to-cache/subdir/file-with-content.md': {
      name: 'file-with-content.md',
      path: 'dir-to-cache/subdir/file-with-content.md',
      stats: {
        mtime: '456',
        size: '123'
      }
    }
  }
  const result = diff({ localMap, remoteMap })

  console.log(result)

  expect(diff).toMatchSnapshot()
})
