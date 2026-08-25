/** End of text, which the terminal sends for Ctrl+C in raw mode. */
const CTRL_C = '\u0003'

/** What the Return key sends in raw mode. */
export const ENTER = '\r'

/** Watch terminal key presses and return a function that stops the watch. */
export function onKey(handler: (key: string) => void): () => void {
  const input = process.stdin
  if (!input.isTTY) return () => undefined

  input.setRawMode(true)
  input.resume()
  input.setEncoding('utf8')
  input.on('data', listener)

  return stop

  function listener(chunk: string): void {
    if (chunk === CTRL_C) {
      stop()
      process.kill(process.pid, 'SIGINT')
      return
    }
    handler(chunk)
  }

  function stop(): void {
    input.off('data', listener)
    input.setRawMode(false)
    input.pause()
  }
}
