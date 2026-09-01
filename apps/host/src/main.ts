#!/usr/bin/env node

// Must precede every schema-constructing import: zod compiles only schemas built after it.
import 'zod/compile'
import { setLogSink } from '@porte/core/client'

const major = Number(process.versions.node.split('.')[0])
if (Number.isNaN(major) || major < 22) {
  process.stderr.write('porte requires Node.js 22 or higher\n')
  process.exit(1)
}

// Keep logs on stderr so help and version output stay clean on stdout.
setLogSink((_level, line) => {
  process.stderr.write(`${line}\n`)
})

// A person running `porte up` reads the CLI's own lines; logs are for a bug
// report, so only warnings pass unless `--verbose` asks for all of them.
// Loggers fix their level when their module loads, so this runs before the
// CLI is imported. `LOG_LEVEL` still wins.
const verbose = process.argv.includes('--verbose') || process.argv.includes('-v')
process.env.LOG_LEVEL ??= verbose ? 'DEBUG' : 'WARN'

const { run } = await import('./entrypoints/cli/run-cli.ts')
const code = await run(process.argv.slice(2), {
  stdout: process.stdout,
  stderr: process.stderr,
  env: process.env,
})
process.exit(code)
