import type { CliError } from '@host/entrypoints/cli/cli-error.ts'
import { exitCodeFor, formatError } from '@host/entrypoints/cli/cli-error.ts'
import { createOutput } from '@host/entrypoints/cli/output.ts'
import { VERSION } from '@host/entrypoints/cli/version.ts'

/** Write one expected CLI error and return its process exit code. */
export function reportCliError(stderr: NodeJS.WritableStream, error: CliError): number {
  const output = createOutput(stderr)
  const body = formatError(error)
  if (error._tag === 'UsageError') output.raw(body)
  else output.failed(body)
  return exitCodeFor(error)
}

/** Write one unexpected CLI defect and return exit code 1. */
export function reportUnexpectedCliError(stderr: NodeJS.WritableStream, cause: unknown): number {
  const detail = cause instanceof Error ? (cause.stack ?? cause.message) : String(cause)
  stderr.write(`porte v${VERSION} — unexpected error\n${detail}\n`)
  stderr.write('Report: https://github.com/alexander-zuev/porte/issues/new\n')
  return 1
}
