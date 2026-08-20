import { spawn } from 'node:child_process'

/** The clipboard tool for this platform, or null where we know of none. */
function clipboardCommand(): readonly [string, readonly string[]] | null {
  if (process.platform === 'darwin') return ['pbcopy', []]
  if (process.platform === 'win32') return ['clip', []]
  if (process.platform === 'linux') return ['xclip', ['-selection', 'clipboard']]
  return null
}

/**
 * Put text on the system clipboard.
 *
 * Returns false when no clipboard tool is reachable, which includes a Linux box
 * without xclip installed. Copying is a convenience, so a missing tool must
 * leave the command it decorates working exactly as before.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  const command = clipboardCommand()
  if (command === null) return false

  const [bin, args] = command
  return new Promise((resolve) => {
    const child = spawn(bin, [...args])
    child.on('error', () => {
      resolve(false)
    })
    child.on('close', (code) => {
      resolve(code === 0)
    })
    child.stdin.end(text)
  })
}
