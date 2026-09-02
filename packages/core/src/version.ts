/**
 * The newest released CLI. Written by `pnpm release:cli`, never by hand; the
 * publish workflow refuses a release where any version fact disagrees.
 */
export const LATEST_CLI_VERSION = '0.2.7'

/** The header a host sends with its control upgrade, naming its own build. */
export const HOST_CLI_VERSION_HEADER = 'x-porte-cli-version'

/** Dotted-numeric compare; the version format is ours, so no library. */
export function isVersionBefore(version: string, than: string): boolean {
  const have = version.split('.').map(Number)
  const want = than.split('.').map(Number)
  for (let index = 0; index < want.length; index++) {
    const a = have[index] ?? 0
    const b = want[index] ?? 0
    if (a !== b) return a < b
  }
  return false
}

/**
 * Whether a machine's CLI is behind the newest release. A host that never
 * said its version predates version reporting, so it is outdated by definition.
 */
export function isCliOutdated(cliVersion: string | undefined): boolean {
  if (cliVersion === undefined) return true
  return isVersionBefore(cliVersion, LATEST_CLI_VERSION)
}
