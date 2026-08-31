import { homedir } from 'node:os'
import { join } from 'node:path'

import {
  setHook,
  status,
  toggle,
  unpair,
  type RcStatusResult,
  type RcToggleResult,
  type RcUnpairResult,
  type RemoteControlDeps,
} from '@host/application/commands/remote-control.ts'
import { runWatchPairing } from '@host/entrypoints/cli/watch-pairing.ts'
import { createRemoteControlDeps } from '@host/infrastructure/bootstrap/remote-control-resources.ts'
import type { HostConfig } from '@host/infrastructure/config/host-config.ts'
import { installGrokHook, removeGrokHook } from '@host/infrastructure/grok/hook-installer.ts'
import { readAllText } from '@host/infrastructure/node/read-stream.ts'
import { z } from 'zod'

/** The rc verbs a person or the hook can run. */
export type RcVerb =
  | 'hook'
  | 'toggle'
  | 'status'
  | 'unpair'
  | 'enable-hook'
  | 'disable-hook'
  | 'watch-pairing'

/** What one prompt asks for, or null when the prompt is not the command. */
export function parseRcVerb(prompt: string): 'toggle' | 'status' | 'unpair' | 'unknown' | null {
  if (!prompt.startsWith('/remote-control')) return null
  const rest = prompt.slice('/remote-control'.length).trim()
  if (rest === '') return 'toggle'
  if (rest === 'status') return 'status'
  if (rest === 'unpair') return 'unpair'
  return 'unknown'
}

/** The exact line for each toggle outcome. The hook prints it verbatim. */
export function renderToggleResult(result: RcToggleResult): string {
  switch (result.type) {
    case 'pairing-started':
      return `Open ${result.verificationUriComplete} on your phone to approve this machine (code ${result.userCode}). It connects on its own once you approve.`
    case 'pairing-pending':
      return `Still waiting for approval. Open ${result.verificationUriComplete} on your phone (code ${result.userCode}).`
    case 'connected':
      return `Remote control on. Run this machine's Grok sessions from your phone: ${result.url}`
    case 'connecting':
      return 'Turning remote control on. Run /remote-control status in a moment.'
    case 'disconnected':
      return 'Remote control off.'
  }
}

/** The exact line for each status outcome. */
export function renderStatusResult(result: RcStatusResult): string {
  switch (result.type) {
    case 'on':
      return `Remote control on · ${result.url}`
    case 'off':
      return `Remote control off · paired as "${result.hostName}"`
    case 'not-paired':
      return 'Remote control off · not paired'
  }
}

/** The exact line for each unpair outcome. */
export function renderUnpairResult(result: RcUnpairResult): string {
  switch (result.type) {
    case 'unpaired':
      return 'This machine is removed from your Porte account. Run /remote-control to pair again.'
    case 'not-paired':
      return 'This machine is not paired.'
  }
}

/** The stdout a UserPromptSubmit hook must print to paint `reason` and skip the turn. */
export function blockDecision(reason: string): string {
  return JSON.stringify({ decision: 'block', reason })
}

const UNKNOWN_OPTION =
  'Unknown option. Use /remote-control, /remote-control status, or /remote-control unpair.'

/** Grok's hook payload; every field except the prompt is irrelevant here. */
const HookPayloadSchema = z.object({ prompt: z.string() })

export type RunRcCommandInput = {
  readonly config: HostConfig
  readonly verb: RcVerb
  readonly stdin: NodeJS.ReadableStream
  readonly stdout: NodeJS.WritableStream
}

/**
 * Run one rc verb.
 *
 * `hook` reads Grok's payload from stdin and answers with a block decision;
 * the plain verbs print their line for a terminal or the skill fallback;
 * `watch-pairing` is the detached poller and prints nothing.
 */
export async function runRcCommand(input: RunRcCommandInput): Promise<number> {
  const deps = createRemoteControlDeps(input.config)

  if (input.verb === 'watch-pairing') {
    await runWatchPairing(deps, input.stdin)
    return 0
  }

  if (input.verb === 'hook') {
    const text = await hookText(deps, input.stdin)
    if (text !== null) input.stdout.write(blockDecision(text))
    return 0
  }

  if (input.verb === 'enable-hook' || input.verb === 'disable-hook') {
    const on = input.verb === 'enable-hook'
    await setHook(deps, on)
    const paths = { grokHome: join(homedir(), '.grok'), porteHome: input.config.dataDirectory }
    await (on ? installGrokHook(paths) : removeGrokHook(paths))
    input.stdout.write(
      on
        ? 'Instant /remote-control is on for new Grok sessions. Grok frames a hook answer as "Prompt blocked" — that is its wording, not an error.\n'
        : 'Instant /remote-control is off. The command runs through the model again.\n',
    )
    return 0
  }

  const line = await verbLine(deps, input.verb)
  input.stdout.write(`${line}\n`)
  return 0
}

/** The text to paint for one hook payload, or null when the prompt is not ours. */
async function hookText(
  deps: RemoteControlDeps,
  stdin: NodeJS.ReadableStream,
): Promise<string | null> {
  const payload = HookPayloadSchema.safeParse(JSON.parse(await readAllText(stdin)))
  if (!payload.success) return null
  const verb = parseRcVerb(payload.data.prompt)
  if (verb === null) return null
  if (verb === 'unknown') return UNKNOWN_OPTION
  return verbLine(deps, verb)
}

async function verbLine(
  deps: RemoteControlDeps,
  verb: 'toggle' | 'status' | 'unpair',
): Promise<string> {
  switch (verb) {
    case 'toggle':
      return renderToggleResult(await toggle(deps))
    case 'status':
      return renderStatusResult(await status(deps))
    case 'unpair':
      return renderUnpairResult(await unpair(deps))
  }
}
