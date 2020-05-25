const { resolve } = require('path')
const { difference, intersection, uniq } = require('lodash')

const { getLocalMd5 } = require('./filesystem')
const { getRemoteMd5 } = require('./sftp')

async function diff({ ssh, localMap, remoteMap, localDir, remoteDir }) {
  /**
   * find files missing local
   * find files missing remote
   * find files newer local
   * find files newer remote
   * find files size different
   */

  const missingLocal = difference(Object.keys(remoteMap), Object.keys(localMap))

  const missingRemote = difference(
    Object.keys(localMap),
    Object.keys(remoteMap)
  )

  const existing = intersection(Object.keys(localMap), Object.keys(remoteMap))

  const newerLocal = existing
    .map((path) => {
      const localFile = localMap[path]
      const remoteFile = remoteMap[path]

      if (localFile.stats.mtime > remoteFile.stats.mtime) {
        return path
      }
    })
    .filter(Boolean)

  const newerRemote = existing
    .map((path) => {
      const localFile = localMap[path]
      const remoteFile = remoteMap[path]

      if (remoteFile.stats.mtime > localFile.stats.mtime) {
        return path
      }
    })
    .filter(Boolean)

  const sizeDifferent = existing
    .map((path) => {
      const localFile = localMap[path]
      const remoteFile = remoteMap[path]

      if (remoteFile.stats.size !== localFile.stats.size) {
        return path
      }
    })
    .filter(Boolean)

  const md5Different = []

  for (const path of uniq([...newerLocal, ...newerRemote])) {
    const localFile = resolve(localDir, path)
    const remoteFile = resolve(remoteDir, path)

    const localMd5 = await getLocalMd5(localFile)
    const remoteMd5 = await getRemoteMd5({ ssh, path: remoteFile })

    if (localMd5 !== remoteMd5) {
      md5Different.push(path)
    }
  }

  const filesToDownload = uniq([
    ...missingLocal,
    ...sizeDifferent,
    ...md5Different
  ]).sort()

  const filesToUpload = uniq([
    ...missingRemote,
    ...sizeDifferent,
    ...md5Different
  ]).sort()

  return {
    filesToDownload,
    filesToUpload
  }
}

module.exports = diff
