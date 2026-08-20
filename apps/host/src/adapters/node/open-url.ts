import { spawn } from 'node:child_process'

/** The browser launcher for this platform, or null where we know of none. */
function openCommand(): readonly [string, readonly string[]] | null {
  if (process.platform === 'darwin') return ['open', []]
  if (process.platform === 'win32') return ['cmd', ['/c', 'start', '']]
  if (process.platform === 'linux') return ['xdg-open', []]
  return null
}

/**
 * Hand a URL to the default browser.
 *
 * Detached and with its streams ignored, so the browser never holds the CLI
 * open and never writes over the prompt still on screen. Returns false when no
 * launcher exists, which leaves the printed URL as the way through.
 */
export async function openUrl(url: string): Promise<boolean> {
  const command = openCommand()
  if (command === null) return false

  const [bin, args] = command
  return new Promise((resolve) => {
    const child = spawn(bin, [...args, url], { detached: true, stdio: 'ignore' })
    child.on('error', () => {
      resolve(false)
    })
    child.unref()
    resolve(true)
  })
}
