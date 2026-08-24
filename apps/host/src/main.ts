#!/usr/bin/env node

import { setLogSink } from '@porte/core/client'

import { run } from './entrypoints/cli/run-cli.ts'

const major = Number(process.versions.node.split('.')[0])
if (Number.isNaN(major) || major < 22) {
  process.stderr.write('porte requires Node.js 22 or higher\n')
  process.exit(1)
}

// Keep logs on stderr so help and version output stay clean on stdout.
setLogSink((_level, line) => {
  process.stderr.write(`${line}\n`)
})

// An installed binary has no NODE_ENV, which the shared logger reads as
// development and answers with debug output. A person running `porte up` wants
// what went wrong; LOG_LEVEL still says otherwise.
process.env.LOG_LEVEL ??= 'INFO'

const code = await run(process.argv.slice(2), {
  stdout: process.stdout,
  stderr: process.stderr,
  env: process.env,
})
process.exit(code)
