const { difference, intersection, uniq } = require('lodash')

function diff({ localMap, remoteMap }) {
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

  const md5Different = sizeDifferent
    .map((path) => {
      const localFile = localMap[path]
      const remoteFile = remoteMap[path]

      // @todo actually call md5 check here
      return path

      if (remoteFile.stats.md5 !== localFile.stats.md5) {
        console.log(remoteFile.stats.md5, '!==', localFile.stats.md5)
        return path
      }
    })
    .filter(Boolean)

  console.log({
    missingLocal: missingLocal.map((path) => path),
    missingRemote: missingRemote.map((path) => path),
    newerLocal: newerLocal.map((path) => path),
    newerRemote: newerRemote.map((path) => path),
    sizeDifferent: sizeDifferent.map((path) => path),
    md5Different: md5Different.map((path) => path)
  })

  const filesToDownload = uniq([...missingLocal, ...md5Different]).sort()

  const filesToUpload = uniq([...missingRemote, ...md5Different]).sort()

  return {
    filesToDownload,
    filesToUpload
  }
}

module.exports = diff
