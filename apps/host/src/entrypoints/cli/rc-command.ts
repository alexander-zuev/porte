import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

import {
  setHook,
  setStatusLine,
  status,
  switchRemoteControl,
  unpair,
  type RcStatusResult,
  type RcSwitchResult,
  type RcUnpairResult,
  type RemoteControlDeps,
} from '@host/application/commands/remote-control.ts'
import type { HostFailure } from '@host/application/ports/remote-control-store.ts'
import { parsePromptVerb, type PromptVerb, type RcVerb } from '@host/entrypoints/cli/rc-verb.ts'
import { runWatchPairing } from '@host/entrypoints/cli/watch-pairing.ts'
import { createRemoteControlDeps } from '@host/infrastructure/bootstrap/remote-control-resources.ts'
import type { HostConfig } from '@host/infrastructure/config/host-config.ts'
import {
  disableLeaderMode,
  installStatusLineConfig,
  removeStatusLineConfig,
  syncGrokConfig,
  type GrokConfigSync,
  type InstallGrokHookInput,
} from '@host/infrastructure/grok/hook-installer.ts'
import { readAllText } from '@host/infrastructure/node/read-stream.ts'
import { UPDATE_AVAILABLE_FILE, updateNoticeLine } from '@host/infrastructure/update-notice.ts'
import { z } from 'zod'

/** The exact line for each on/off outcome. The hook prints it verbatim. */
export function renderSwitchResult(result: RcSwitchResult): string {
  switch (result.type) {
    case 'not-paired':
      return 'This machine is not paired. Run /remote-control to pair.'
    case 'pairing-started':
      // The link stands alone on its own line so it can be copied in one gesture.
      return `Open this link on your phone to approve this machine (code ${result.userCode}):\n\n${result.verificationUriComplete}\n\nIt connects on its own once you approve.`
    case 'pairing-pending':
      return `Still waiting for approval. Open this link on your phone (code ${result.userCode}):\n\n${result.verificationUriComplete}`
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
    case 'connecting':
      return 'Remote control connecting…'
    case 'error':
      return `Remote control error · ${failureLine(result.failure)}`
  }
}

/** The reason and its fix, one line; the status line prints the same words. */
export function failureLine(failure: HostFailure): string {
  switch (failure.type) {
    case 'unauthorized':
      return 'pairing revoked · /remote-control to pair again'
    case 'agent-start':
      return 'Grok could not start · fix Grok, then /remote-control'
    case 'refused':
      return `Porte refused (HTTP ${String(failure.http)}) · update Porte`
    case 'protocol':
      return 'Porte closed the connection · update Porte'
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
  'Unknown option. Use /remote-control [on|off], /remote-control status, /remote-control status-line [on|off], or /remote-control unpair.'

/** The exact line for each status-line outcome. */
export function renderStatusLineResult(on: boolean, sync: GrokConfigSync['statusLine']): string {
  if (!on) return 'Status row off. Restart Grok to hide it.'
  if (sync === 'unwritable') return 'Status row on, but ~/.grok/config.toml could not be written.'
  return 'Status row on. Restart Grok to see the /rc row.'
}

/**
 * One extra line after toggle or status when the row is not showing yet, so the
 * person (or the agent reading for them) knows the one step that fixes it.
 */
export function statusLineNote(sync: GrokConfigSync['statusLine']): string {
  switch (sync) {
    case 'added':
      return '\nRestart Grok once to see the /rc status row.'
    case 'theirs':
      return '\nGrok already has a status line of its own. /remote-control status-line replaces it with the /rc row.'
    case 'unwritable':
      return '\nCould not write the /rc status row to ~/.grok/config.toml.'
    case 'current':
    case 'off':
      return ''
  }
}

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

  if (input.verb.kind === 'watch-pairing') {
    await runWatchPairing(deps, input.stdin)
    return 0
  }

  if (input.verb.kind === 'hook') {
    const text = await hookText(deps, input.stdin, grokPaths(input.config))
    if (text !== null) input.stdout.write(blockDecision(text))
    return 0
  }

  if (input.verb.kind === 'enable-hook' || input.verb.kind === 'disable-hook') {
    const on = input.verb.kind === 'enable-hook'
    await setHook(deps, on)
    await syncGrokConfig(await deps.settings.read(), grokPaths(input.config))
    input.stdout.write(
      on
        ? 'Instant /remote-control is on for new Grok sessions. Grok frames a hook answer as "Prompt blocked" — that is its wording, not an error.\n'
        : 'Instant /remote-control is off. The command runs through the model again.\n',
    )
    return 0
  }

  const line = await verbLine(deps, input.verb, grokPaths(input.config))
  input.stdout.write(`${line}${await updateSuffix(input.config.dataDirectory)}\n`)
  return 0
}

function grokPaths(config: HostConfig): InstallGrokHookInput {
  return { grokHome: join(homedir(), '.grok'), porteHome: config.dataDirectory }
}

/** One extra line when the daemon has marked a newer release; silence otherwise. */
async function updateSuffix(dataDirectory: string): Promise<string> {
  const latest = await readFile(join(dataDirectory, UPDATE_AVAILABLE_FILE), 'utf8').catch(() => '')
  return latest === '' ? '' : `\n${updateNoticeLine(latest.trim())}`
}

/** The text to paint for one hook payload, or null when the prompt is not ours. */
async function hookText(
  deps: RemoteControlDeps,
  stdin: NodeJS.ReadableStream,
  paths: InstallGrokHookInput,
): Promise<string | null> {
  const payload = HookPayloadSchema.safeParse(JSON.parse(await readAllText(stdin)))
  if (!payload.success) return null
  const verb = parsePromptVerb(payload.data.prompt)
  if (verb === null) return null
  if (verb === 'unknown') return UNKNOWN_OPTION
  return verbLine(deps, verb, paths)
}

async function verbLine(
  deps: RemoteControlDeps,
  verb: PromptVerb,
  paths: InstallGrokHookInput,
): Promise<string> {
  switch (verb.kind) {
    case 'remote': {
      const line = renderSwitchResult(await switchRemoteControl(deps, verb.to))
      return line + statusLineNote(await syncChoices(deps, paths))
    }
    case 'status': {
      const line = renderStatusResult(await status(deps))
      return line + statusLineNote(await syncChoices(deps, paths))
    }
    case 'status-line': {
      const on = await setStatusLine(deps, verb.to)
      // The explicit verb is the one place a status line that is not ours gives way.
      const sync = on
        ? await installStatusLineConfig(paths.grokHome, paths.porteHome, { foreign: 'replace' })
            .then((result): GrokConfigSync['statusLine'] => result)
            .catch((): GrokConfigSync['statusLine'] => 'unwritable')
        : await removeStatusLineConfig(paths.grokHome)
            .then((): GrokConfigSync['statusLine'] => 'off')
            .catch((): GrokConfigSync['statusLine'] => 'unwritable')
      return renderStatusLineResult(on, sync)
    }
    case 'unpair': {
      const result = await unpair(deps)
      // Porte leaves Grok as it found it: no shared session process and no status line of ours.
      if (result.type === 'unpaired') {
        await disableLeaderMode(paths.grokHome).catch(() => null)
        await removeStatusLineConfig(paths.grokHome).catch(() => null)
      }
      return renderUnpairResult(result)
    }
  }
}

/** Every `/remote-control` is an install or update moment: bring Grok's files in line. */
async function syncChoices(
  deps: RemoteControlDeps,
  paths: InstallGrokHookInput,
): Promise<GrokConfigSync['statusLine']> {
  const sync = await syncGrokConfig(await deps.settings.read(), paths)
  return sync.statusLine
}
