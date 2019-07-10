# SFTP-CACHE

[![npm](https://img.shields.io/npm/v/sftp-cache.svg?label=npm@latest)](https://www.npmjs.com/package/sftp-cache)
[![npm](https://img.shields.io/npm/v/sftp-cache/canary.svg)](https://www.npmjs.com/package/sftp-cache)
[![npm](https://img.shields.io/npm/dm/sftp-cache.svg)](https://www.npmjs.com/package/sftp-cache)

[![Maintainability](https://api.codeclimate.com/v1/badges/fc81fa5e535561c0a6ff/maintainability)](https://codeclimate.com/github/axe312ger/sftp-cache/maintainability)
[![Contributor Covenant](https://img.shields.io/badge/Contributor%20Covenant-v1.4%20adopted-ff69b4.svg)](CODE_OF_CONDUCT.md)

Use a directory on any ssh/sftp enabled server as a cache directory.

The main goal is to allow caching of heavy project assets like videos to avoid unnecessary reconversions while deploying.

## Features

* Download from cache directory and refill it again
* Compare file by missing on other end, modification date, file size and md5 hash
* Keeps file modification date
* Client: Windows, Linux, OSX
* Server: Any host supporting sftp. MD5 hash comparision also needs `md5` or `md5sum` installed on the server.

## Installation

```sh
npm i sftp-cache@canary
```

## Usage

```js
const { join } = require('path')

const sftpCache = require('sftp-cache')

;(async () => {
  try {
    await sftpCache({
      connection: {
        // All options: https://github.com/mscdex/ssh2#client-methods
        host: 'your.host.io',
        username: 'your-sft-user',
        password: '5up3r53cr37Pa$$w0rd'
        // Please do not store your credentials in your code. You can use environment variables & https://www.npmjs.com/package/dotenv
      },
      localDir: join(__dirname, 'assets'),
      remoteDir: '/home/your-sftp-user/sftp-cache-storage/assets',
      dirsToCache: [
        // Make sure paths are relative to localDir
        join('public', 'assets', 'videos'),
        join('node_modules', '.cache')
      ],
      // Tell it what to do:
      // cache: Uploads changed files from local to remote
      // download: Download changed files from remote to local
      syncDirection: 'cache'
    })
    console.log('success!')
  } catch (err) {
    console.log('failed!')
    console.error(err)
    process.exit(1)
  }
})()
```
