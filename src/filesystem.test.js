const { resolve } = require('path')

const { getLocalFiles } = require('./filesystem')

test('parses local directory', async () => {
  const root = resolve(__dirname, '..', '__tests__', 'fixtures')
  const dir = resolve(root, 'dir-to-cache')
  const tree = await getLocalFiles(dir, root)

  expect(tree).toMatchSnapshot()
})
