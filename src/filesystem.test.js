const { resolve } = require('path')
const fg = require('fast-glob')

const { getLocalFiles } = require('./filesystem')

jest.mock('fast-glob')

test('parses local directory', async () => {
  fg.mockImplementation(() => [
    {
      name: 'example-file-name.md',
      path: '/tmp/dir-to-cache/example-file-name.md',
      stats: { size: 4312, mtime: 1234 }
    },
    {
      name: 'file-in-root-dir.empty',
      path: '/tmp/dir-to-cache/file-in-root-dir.empty',
      stats: { size: 4312, mtime: 1234 }
    },
    {
      name: 'file-with-content.md',
      path: '/tmp/dir-to-cache/subdir/file-with-content.md',
      stats: { size: 4312, mtime: 1234 }
    }
  ])
  const root = resolve('/tmp')
  const dir = resolve(root, 'dir-to-cache')
  const tree = await getLocalFiles(dir, root)

  expect(tree).toMatchSnapshot()
})
