const { resolve } = require('path')

const diff = require('./diff')

const localDir = resolve(__dirname, '..', '__tests__', 'fixtures')
const remoteDir = '/home/cache/some/dir/'

test('local and remote are in sync', async () => {
  const localMap = {
    'dir-to-cache/file-in-root-dir.empty': {
      name: 'file-in-root-dir.empty',
      path: 'dir-to-cache/file-in-root-dir.empty',
      stats: {
        mtime: 1590433826,
        size: 0
      }
    }
  }
  const remoteMap = {
    'dir-to-cache/file-in-root-dir.empty': {
      name: 'file-in-root-dir.empty',
      path: 'dir-to-cache/file-in-root-dir.empty',
      stats: {
        mtime: 1590433826,
        size: 0
      }
    }
  }

  const ssh = {}

  const result = await diff({ ssh, localMap, remoteMap, localDir, remoteDir })

  expect(result.filesToDownload).toHaveLength(0)
  expect(result.filesToUpload).toHaveLength(0)
})
test('local has extra file', async () => {
  const localMap = {
    'dir-to-cache/file-in-root-dir.empty': {
      name: 'file-in-root-dir.empty',
      path: 'dir-to-cache/file-in-root-dir.empty',
      stats: {
        mtime: 1590433826,
        size: 0
      }
    }
  }
  const remoteMap = {}

  const ssh = {}

  const result = await diff({ ssh, localMap, remoteMap, localDir, remoteDir })

  expect(result.filesToDownload).toHaveLength(0)
  expect(result.filesToUpload).toHaveLength(1)
  expect(result).toMatchSnapshot()
})
test('remote has extra file', async () => {
  const localMap = {}
  const remoteMap = {
    'dir-to-cache/file-in-root-dir.empty': {
      name: 'file-in-root-dir.empty',
      path: 'dir-to-cache/file-in-root-dir.empty',
      stats: {
        mtime: 1590433826,
        size: 0
      }
    }
  }

  const ssh = {}

  const result = await diff({ ssh, localMap, remoteMap, localDir, remoteDir })

  expect(result.filesToDownload).toHaveLength(1)
  expect(result.filesToUpload).toHaveLength(0)
  expect(result).toMatchSnapshot()
})
test('file differs in size', async () => {
  const localMap = {
    'dir-to-cache/file-in-root-dir.md': {
      name: 'file-in-root-dir.md',
      path: 'dir-to-cache/file-in-root-dir.md',
      stats: {
        mtime: 1590433826,
        size: 4321
      }
    }
  }
  const remoteMap = {
    'dir-to-cache/file-in-root-dir.md': {
      name: 'file-in-root-dir.md',
      path: 'dir-to-cache/file-in-root-dir.md',
      stats: {
        mtime: 1590433826,
        size: 1234
      }
    }
  }

  const ssh = {}

  const result = await diff({ ssh, localMap, remoteMap, localDir, remoteDir })

  expect(result.filesToDownload).toHaveLength(1)
  expect(result.filesToUpload).toHaveLength(1)
  expect(result).toMatchSnapshot()
})

test('local has newer file', async () => {
  const localMap = {
    'dir-to-cache/example-file-name.md': {
      name: 'example-file-name.md',
      path: 'dir-to-cache/example-file-name.md',
      stats: {
        mtime: 2390433826,
        size: 123
      }
    }
  }
  const remoteMap = {
    'dir-to-cache/example-file-name.md': {
      name: 'example-file-name.md',
      path: 'dir-to-cache/example-file-name.md',
      stats: {
        mtime: 1590433826,
        size: 123
      }
    }
  }

  const ssh = {
    exec: async (command, paths) => {
      const path = paths[0]

      if (path.indexOf('dir-to-cache/example-file-name.md') !== -1) {
        return 'md5 thiswontmatch'
      }
      throw new Error('oops')
    }
  }

  const result = await diff({ ssh, localMap, remoteMap, localDir, remoteDir })

  expect(result).toMatchSnapshot()
})

test('remote has newer file', async () => {
  const localMap = {
    'dir-to-cache/example-file-name.md': {
      name: 'example-file-name.md',
      path: 'dir-to-cache/example-file-name.md',
      stats: {
        mtime: 1590433826,
        size: 123
      }
    }
  }
  const remoteMap = {
    'dir-to-cache/example-file-name.md': {
      name: 'example-file-name.md',
      path: 'dir-to-cache/example-file-name.md',
      stats: {
        mtime: 2390433826,
        size: 123
      }
    }
  }

  const ssh = {
    exec: async (command, paths) => {
      const path = paths[0]

      if (path.indexOf('dir-to-cache/example-file-name.md') !== -1) {
        return 'md5 thiswontmatch'
      }
      throw new Error('oops')
    }
  }

  const result = await diff({ ssh, localMap, remoteMap, localDir, remoteDir })

  expect(result).toMatchSnapshot()
})

test('complex variant', async () => {
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

  const ssh = {
    exec: async (command, paths) => {
      const path = paths[0]

      if (path.indexOf('dir-to-cache/subdir/file-with-content.md') !== -1) {
        return 'md5 b56c5f4c8a1fc60732c4374705765f08'
      }
      throw new Error('oops')
    }
  }

  const result = await diff({ ssh, localMap, remoteMap, localDir, remoteDir })

  expect(result).toMatchSnapshot()
})
