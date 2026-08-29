import { pairHost, type PairingPoll } from '@host/application/commands/pair-host.ts'
import { PAIR_EMOJI, WAITING_EMOJI, createOutput } from '@host/entrypoints/cli/output.ts'
import { createPairingResources } from '@host/infrastructure/bootstrap/pairing-resources.ts'
import type { HostConfig } from '@host/infrastructure/config/host-config.ts'
import { copyToClipboard } from '@host/infrastructure/node/clipboard.ts'
import { describeThisMachine } from '@host/infrastructure/node/machine.ts'
import { openUrl } from '@host/infrastructure/node/open-url.ts'
import { ENTER, onKey } from '@host/infrastructure/terminal/key-press.ts'
import { formatPairingCode } from '@porte/core/client'

/** Pair this machine with one Porte account. */
export async function runPairCommand(input: {
  readonly config: HostConfig
  readonly stderr: NodeJS.WritableStream
}): Promise<number> {
  const resources = createPairingResources(input.config)
  const output = createOutput(input.stderr)
  const { code, url, quiet, strong, ok } = output.emphasis
  const interactive = process.stdin.isTTY
  let stopWatching: (() => void) | undefined
  // The wait line appears once the prompt is answered; polls before that stay silent.
  let showingWait = false
  let lastPoll: PairingPoll | undefined
  const waiting = (poll: PairingPoll | undefined) =>
    quiet(
      poll === undefined
        ? `Waiting for approval — checking with Porte…  ${WAITING_EMOJI}`
        : `Waiting for approval — checking with Porte every ${String(poll.intervalSeconds)}s (${String(poll.attempt)} so far)  ${WAITING_EMOJI}`,
    )

  const paired = await pairHost({
    authorizer: resources.authorizer,
    credentials: resources.credentials,
    baseUrl: input.config.baseUrl,
    host: describeThisMachine(),
    onPoll: (poll) => {
      lastPoll = poll
      if (showingWait) output.status(waiting(poll))
    },
    onPrompt: (prompt) => {
      const shown = formatPairingCode(prompt.userCode)

      output.title('Pair this machine with Porte', PAIR_EMOJI)
      if (!interactive) {
        output.raw(`First copy your pairing code:  ${code(shown)}`)
        output.raw(`Then open ${url(prompt.verificationUri)} in your browser.`)
        output.blank()
        // No terminal to redraw, so one line says what the process is doing.
        output.raw(waiting(undefined))
        return
      }

      const codeLine = (hint: string) => `First copy your pairing code:  ${code(shown)}   ${hint}`
      const promptLine = `${strong('Press Enter')} to open ${url(
        prompt.verificationUri,
      )} in your browser...`

      output.raw(codeLine(quiet('(press c to copy)')))
      output.prompt(promptLine)
      stopWatching = onKey((key) => {
        if (key === ENTER) {
          stopWatching?.()
          output.blank()
          output.blank()
          showingWait = true
          output.status(waiting(lastPoll))
          void openUrl(prompt.verificationUri)
          return
        }
        if (key.toLowerCase() !== 'c') return
        void copyToClipboard(prompt.userCode).then((copied) => {
          const hint = copied ? `${ok('✓')} ${quiet('copied')}` : quiet('✗ no clipboard')
          output.rewrite(codeLine(hint), promptLine)
        })
      })
    },
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now: () => Date.now(),
  })

  stopWatching?.()
  if (paired.status === 'denied') {
    output.warned('Pairing was refused. Nothing was connected.')
    output.note(`Run ${code('porte pair')} again to retry`)
    return 1
  }
  if (paired.status === 'expired') {
    output.warned('The code expired before anyone answered it.')
    output.note(`Run ${code('porte pair')} for a new one`)
    return 1
  }

  const { account } = paired
  const machine = strong(describeThisMachine().name)
  output.done(
    account === null
      ? `Paired ${machine} with Porte`
      : `Paired ${machine} with ${strong(account)} on Porte`,
  )
  output.blank()
  output.raw(`  Run ${code('porte up')} to control this machine's Grok conversations from anywhere`)
  output.note('Expires in 7 days if it never connects')
  return 0
}
