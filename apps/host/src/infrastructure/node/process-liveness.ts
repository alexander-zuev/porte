/** A signal-0 probe: succeeds while the process exists, whoever owns it. */
export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    // EPERM means it exists but is not ours; only ESRCH means gone.
    return error instanceof Error && 'code' in error && error.code === 'EPERM'
  }
}
