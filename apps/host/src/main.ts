#!/usr/bin/env node

import { run } from './cli/run-cli.ts'

const major = Number(process.versions.node.split('.')[0])
if (Number.isNaN(major) || major < 22) {
  process.stderr.write('porte requires Node.js 22 or higher\n')
  process.exit(1)
}

const code = await run(process.argv.slice(2), {
  stdout: process.stdout,
  stderr: process.stderr,
  env: process.env,
})
process.exit(code)
