#!/usr/bin/env node

import { setLogSink } from '@porte/core/client'

import { run } from './cli/run-cli.ts'

const major = Number(process.versions.node.split('.')[0])
if (Number.isNaN(major) || major < 22) {
  process.stderr.write('porte requires Node.js 22 or higher\n')
  process.exit(1)
}

// Stdout is the machine-readable stream here, so `porte list | jq` keeps
// working only if every log goes the other way.
setLogSink((_level, line) => {
  process.stderr.write(`${line}\n`)
})

// An installed binary has no NODE_ENV, which the shared logger reads as
// development and answers with debug output. A person running `porte up` wants
// what went wrong; LOG_LEVEL still says otherwise.
process.env.LOG_LEVEL ??= 'WARN'

const code = await run(process.argv.slice(2), {
  stdout: process.stdout,
  stderr: process.stderr,
  env: process.env,
})
process.exit(code)
