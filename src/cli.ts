#! /usr/bin/env node
import fs from "fs"
import Yargs from "yargs"
import path from "path"
import chokidar from "chokidar"
import { checkDir } from "./checks/checkDir"
import { writeIndex } from "./writes/writeIndex"
import { isIndexFile } from "./checks/checkIndexFile"
import { INDEXEXTENSIONS, FILETYPE, NAMESPACETYPE } from "./types"

const builder = (yargs: Yargs.Argv<{}>) => {
  return yargs
    .positional("folder", {
      describe: "folder",
      default: "src"
    })
    .option("extension", {
      alias: "ext",
      describe: "the extension of the barrel file, default tsx",
      default: "tsx"
    })
    .option("namespace", {
      alias: "n",
      describe:
        "when writing barrel, place all of each file in its own namespace, or only default exports, or no namespace (default)",
      choices: ["none", "all", "defaultOnly"],
      default: "none"
    })
  // (, {
  //   alias: 'n',
  //   describe: `whether to namespace exports e.g. export { default as Input } from './input', default no`,
  //   default: false
  // });
}
type HType = {
  [argName: string]: unknown
  _: string[]
  $0: string
}
const handler = (/* argv: HType */) => {
  // console.log('handler', argv);
}
async function run() {
  const temp: HType = Yargs
    // list of
    .command("watch [folder]", "start watching a folder and building barrels", builder, handler)
    .demandCommand()
    .help().argv
  // ;({ temp })
  // { _: [ 'watch' ],
  // folder: 'testfolder',
  // '$0': '/usr/local/bin/barrelbot' }
  const srcfolder = temp.folder as string
  if (!fs.existsSync(srcfolder)) {
    return console.error(`path '${srcfolder}' does not exist, terminating...`)
  }
  const NAMESPACE = temp.namespace as NAMESPACETYPE
  const EXTENSION = temp.extension as FILETYPE
  if (!INDEXEXTENSIONS.includes(EXTENSION)) {
    console.error(`invalid --extension option detected. Pick from `, INDEXEXTENSIONS)
    return "early termination"
  }
  const configs = {
    NAMESPACE,
    EXTENSION
  }
  // Something to use when events are received.
  const log = console.log.bind(console)
  let isLoading = true
  let watchedDirs: string[] = []
  chokidar
    .watch(srcfolder, {
      ignored: /(^|[\/\\])\../,
      persistent: true
    })
    .on("add", _path => {
      if (isLoading) {
        // should not do anything
      } else {
        log(`File ${_path} has been added`)
        if (isIndexFile(_path)) {
          // noop
        } else {
          // rerun writeIndex
          const dirname = path.dirname(_path)
          writeIndex(dirname, configs)
        }
      }
    })
    .on("unlink", _path => {
      if (isLoading) {
        throw new Error(`unexpected unlink event while loading, please investigate ${_path}`)
      } else {
        log(`File ${_path} has been removed`)
        if (isIndexFile(_path)) {
          // noop
        } else {
          // rerun writeIndex
          const dirname = path.dirname(_path)
          const { indexFilePath, allFilesExceptIndex, hasIndexFile } = checkDir(dirname, EXTENSION)
          if (allFilesExceptIndex.length) {
            writeIndex(dirname, configs)
          } else {
            // there is no longer any linkable file, lets delete index file as well if exists
            if (hasIndexFile) {
              console.log("TODO: DELETE INDEX FILE: " + indexFilePath)
            }
          }
        }
      }
    })
    .on("addDir", _path => {
      if (isLoading) {
        log(`Adding dir ${_path}...`)
        watchedDirs.push(_path)
        // const { indexFile_path, allFilesExceptIndex } =
        checkDir(_path, EXTENSION)
        // console.log({ indexFile_path, allFilesExceptIndex });
      } else {
        watchedDirs.push(_path)
        log(`Directory ${_path} has been added`)
      }
    })
    .on("unlinkDir", _path => {
      if (isLoading) {
        throw new Error(`unexpected unlinkDir event while loading, please investigate ${_path}`)
      } else {
        watchedDirs = watchedDirs.filter(x => x !== _path)
        log(`Directory ${_path} has been removed`)
      }
    })
    .on("error", error => log(`Watcher error: ${error}`))
    .on("ready", async () => {
      log(`Scanned and validated ${srcfolder}. Checking and writing barrels...`)
      isLoading = false
      await Promise.all(watchedDirs.map(dir => writeIndex(dir, configs)))
      log(`Watching for changes...`)
    })
  // // unused
  // .on('all', (event, _path) => {
  //   console.log(event, _path);
  // }))
  // .on('change', _path => log(`File ${_path} has been changed`))
  // .on('raw', (event, _path, details) => {
  //   log('Raw event info:', event, _path, details);
  // });
}

module.exports = { run }
