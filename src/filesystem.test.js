const { resolve } = require('path')

const { getLocalFiles } = require('./filesystem')

test('parses local directory', async () => {
  const root = resolve(__dirname, '..', '__tests__', 'fixtures')
  const dir = resolve(root, 'example-file-tree')
  const tree = await getLocalFiles(dir, root)

  expect(tree).toMatchSnapshot()
})
