/** End of text, which the terminal sends for Ctrl+C once raw mode is on. */
const CTRL_C = '\u0003'

/** What the Return key sends in raw mode. */
export const ENTER = '\r'

/**
 * Watch keypresses while a prompt sits on screen, and return how to stop.
 *
 * Raw mode is what makes a bare keypress readable, and it also stops the
 * terminal from raising SIGINT, so Ctrl+C is re-sent by hand below. Returns a
 * no-op when stdin is not a terminal, which is what a piped or CI run gets.
 */
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
