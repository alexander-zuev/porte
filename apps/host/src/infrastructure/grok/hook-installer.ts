import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { version } from '../../../package.json'

/** Where the two hook files went, and whether anything was written. */
export type HookInstallResult = { readonly changed: boolean }

export type InstallGrokHookInput = {
  /** The Grok home, `~/.grok` outside tests. */
  readonly grokHome: string
  /** The Porte data directory, `~/.porte` outside tests. */
  readonly porteHome: string
}

/**
 * Install the `/remote-control` prompt hook into Grok's global hooks.
 *
 * The daemon calls this on every start because Grok does not load
 * plugin-shipped hooks; global hooks are always trusted. Idempotent: current
 * files are left untouched so their mtimes stay honest.
 */
export async function installGrokHook(input: InstallGrokHookInput): Promise<HookInstallResult> {
  const scriptPath = join(input.porteHome, 'hook', 'porte-hook.sh')
  const configPath = join(input.grokHome, 'hooks', 'porte.json')
  const script = hookScript()
  const config = `${JSON.stringify(hookConfig(scriptPath), null, 2)}\n`

  const scriptChanged = await writeIfChanged(scriptPath, script)
  if (scriptChanged) await chmod(scriptPath, 0o755)
  const configChanged = await writeIfChanged(configPath, config)
  return { changed: scriptChanged || configChanged }
}

const CLI_SECTION = '[cli]'
/** The `[cli]` table header, with or without a trailing comment. */
const CLI_SECTION_LINE = /^\s*\[cli\]\s*(#.*)?$/
const USE_LEADER_LINE = 'use_leader = true'
const USE_LEADER_KEY = /^\s*use_leader\s*=/

/**
 * Turn on Grok's shared session process in `~/.grok/config.toml`.
 *
 * With `[cli] use_leader = true` every `grok` process on the machine, the TUI
 * and this Host's agent alike, is a client of one backend, so a session is one
 * live thing wherever it is typed. Grok reads the key at start, so the person
 * restarts Grok once. A line edit, not a TOML rewrite: the rest of the file,
 * comments included, stays byte for byte.
 */
export async function enableLeaderMode(grokHome: string): Promise<boolean> {
  const path = join(grokHome, 'config.toml')
  const current = await readFile(path, 'utf8').catch(() => '')
  const next = withUseLeader(current)
  if (next === current) return false
  await mkdir(grokHome, { recursive: true })
  await writeFile(path, next)
  return true
}

const STATUS_LINE_SECTION = '[ui.status_line]'
const STATUS_LINE_SECTION_LINE = /^\s*\[ui\.status_line\]\s*(#.*)?$/
const TABLE_HEADER_LINE = /^\s*\[/
/** Ours when the command is our script; any other command is the person's own status line. */
const OUR_COMMAND_LINE = /^\s*command\s*=.*porte.*statusline\.sh/
/** Two seconds: one `cat` and one `kill -0`, and the line follows the daemon within a poll. */
const STATUS_LINE_REFRESH_S = 2

/**
 * Point Grok's status line at our script in `~/.grok/config.toml`.
 *
 * Grok has one status line. Absent: ours is appended. Ours already: its lines are
 * rewritten, so an older interval is brought current. Someone else's: untouched,
 * because their status line is theirs. Same line-edit discipline as `use_leader`.
 */
export async function installStatusLineConfig(
  grokHome: string,
  porteHome: string,
): Promise<boolean> {
  const path = join(grokHome, 'config.toml')
  const current = await readFile(path, 'utf8').catch(() => '')
  const next = withStatusLine(current, statusLineConfigLines(porteHome))
  if (next === current) return false
  await mkdir(grokHome, { recursive: true })
  await writeFile(path, next)
  return true
}

/** Drop our status line on unpair; a status line that is not ours stays. */
export async function removeStatusLineConfig(grokHome: string): Promise<boolean> {
  const path = join(grokHome, 'config.toml')
  const current = await readFile(path, 'utf8').catch(() => undefined)
  if (current === undefined) return false
  const lines = current.split('\n')
  const section = statusLineSection(lines)
  if (section === null || !section.ours) return false
  lines.splice(section.start, section.end - section.start)
  const next = lines.join('\n')
  await writeFile(path, next)
  return true
}

function statusLineConfigLines(porteHome: string): readonly string[] {
  return [
    'type = "command"',
    `command = "${join(porteHome, 'statusline.sh')}"`,
    `refresh_interval = ${String(STATUS_LINE_REFRESH_S)}`,
  ]
}

function withStatusLine(config: string, ours: readonly string[]): string {
  const lines = config.split('\n')
  const section = statusLineSection(lines)
  if (section === null) {
    const body = config.endsWith('\n') || config.length === 0 ? config : `${config}\n`
    const separator = body.length === 0 ? '' : '\n'
    return `${body}${separator}${STATUS_LINE_SECTION}\n${ours.join('\n')}\n`
  }
  if (!section.ours) return config
  lines.splice(section.start + 1, section.end - section.start - 1, ...ours)
  return lines.join('\n')
}

/** Header index, the index after the last body line, and whether the command is ours. */
function statusLineSection(
  lines: readonly string[],
): { start: number; end: number; ours: boolean } | null {
  const start = lines.findIndex((line) => STATUS_LINE_SECTION_LINE.test(line))
  if (start === -1) return null
  let end = start + 1
  while (end < lines.length && !TABLE_HEADER_LINE.test(lines[end] ?? '')) end += 1
  // A trailing blank line belongs to the gap before the next table, not to this section.
  while (end > start + 1 && (lines[end - 1] ?? '').trim() === '') end -= 1
  const ours = lines.slice(start + 1, end).some((line) => OUR_COMMAND_LINE.test(line))
  return { start, end, ours }
}

/** Drop the `use_leader` line again on unpair, so Grok runs as it did before Porte. */
export async function disableLeaderMode(grokHome: string): Promise<boolean> {
  const path = join(grokHome, 'config.toml')
  const current = await readFile(path, 'utf8').catch(() => undefined)
  if (current === undefined) return false
  const next = current
    .split('\n')
    .filter((line) => !USE_LEADER_KEY.test(line))
    .join('\n')
  if (next === current) return false
  await writeFile(path, next)
  return true
}

function withUseLeader(config: string): string {
  const lines = config.split('\n')
  const existing = lines.findIndex((line) => USE_LEADER_KEY.test(line))
  if (existing !== -1) {
    if (lines[existing]?.trim() === USE_LEADER_LINE) return config
    lines[existing] = USE_LEADER_LINE
    return lines.join('\n')
  }
  const section = lines.findIndex((line) => CLI_SECTION_LINE.test(line))
  if (section !== -1) {
    lines.splice(section + 1, 0, USE_LEADER_LINE)
    return lines.join('\n')
  }
  const body = config.endsWith('\n') || config.length === 0 ? config : `${config}\n`
  return `${body}${body.length === 0 ? '' : '\n'}${CLI_SECTION}\n${USE_LEADER_LINE}\n`
}

/** Remove the prompt hook, so `/remote-control` runs through the skill again. */
export async function removeGrokHook(input: InstallGrokHookInput): Promise<void> {
  await rm(join(input.grokHome, 'hooks', 'porte.json'), { force: true })
  await rm(join(input.porteHome, 'hook', 'porte-hook.sh'), { force: true })
}

/**
 * Write the status-line script that `installStatusLineConfig` points Grok at.
 *
 * Grok honours `[ui.status_line]` only from the person's own config file, not
 * from a plugin's, so the daemon writes both the script and the config lines.
 */
export async function installStatusLineScript(porteHome: string): Promise<boolean> {
  const path = join(porteHome, 'statusline.sh')
  const changed = await writeIfChanged(path, statusLineScript(porteHome))
  if (changed) await chmod(path, 0o755)
  return changed
}

function statusLineScript(porteHome: string): string {
  return `#!/bin/bash
# Porte status row for Grok: green while this machine is reachable from the phone.
state=$(cat "${porteHome}/rc-state.json" 2>/dev/null)
# The writer pid must be alive: a crashed daemon leaves a stale "on" behind.
pid=$(printf '%s' "$state" | sed -n 's/.*"pid":\\([0-9][0-9]*\\).*/\\1/p')
alive=0
if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then alive=1; fi
if [[ "$state" == *'"status":"on"'* ]] && [ "$alive" = 1 ]; then
  printf '\\033[32m/rc on\\033[0m · access your Grok sessions from anywhere · useporte.dev'
elif [[ "$state" == *'"status":"connecting"'* ]] && [ "$alive" = 1 ]; then
  printf '\\033[33m/rc connecting…\\033[0m'
elif [[ "$state" == *'"status":"error"'* ]] && [ "$alive" = 1 ]; then
  # The same words as \`/remote-control status\`; this line is the only one the person sees.
  if [[ "$state" == *'"type":"unauthorized"'* ]]; then
    reason='pairing revoked · /remote-control to pair again'
  elif [[ "$state" == *'"type":"agent-start"'* ]]; then
    reason='Grok could not start · fix Grok, then /remote-control'
  elif [[ "$state" == *'"type":"refused"'* ]]; then
    http=$(printf '%s' "$state" | sed -n 's/.*"http":\\([0-9][0-9]*\\).*/\\1/p')
    reason="Porte refused (HTTP $http) · update Porte"
  else
    reason='Porte closed the connection · update Porte'
  fi
  printf '\\033[31m/rc error\\033[0m · %s' "$reason"
else
  printf '\\033[90m/rc off\\033[0m'
fi
# Written by the daemon when the relay knows a newer release; removed once current.
if [ -s "${porteHome}/update-available" ]; then
  printf ' · \\033[33mNew version available - update\\033[0m'
fi
`
}

/**
 * The prompt hook: a bash prefilter, so ordinary prompts cost one grep.
 *
 * Only a payload whose prompt starts with /remote-control reaches the CLI. The
 * CLI parses properly, runs the verb, and prints the block decision.
 */
function hookScript(): string {
  return `#!/bin/bash
# Installed by porte. Intercepts /remote-control before it costs a model turn.
# Loose match on purpose: the CLI parses properly and stays silent for a prompt
# that merely mentions the command, so a false positive still proceeds normally.
input=$(cat)
case "$input" in
  *'/remote-control'*)
    printf '%s' "$input" | exec npx -y @porte/cli@${version} rc hook
    ;;
esac
exit 0
`
}

/** The shape of one Grok hooks file, as `~/.grok/docs/user-guide/10-hooks.md` defines it. */
type GrokHookConfig = {
  readonly hooks: {
    readonly UserPromptSubmit: ReadonlyArray<{
      readonly hooks: ReadonlyArray<{
        readonly type: 'command'
        readonly command: string
        readonly timeout: number
      }>
    }>
  }
}

function hookConfig(scriptPath: string): GrokHookConfig {
  return {
    hooks: {
      UserPromptSubmit: [{ hooks: [{ type: 'command', command: scriptPath, timeout: 30 }] }],
    },
  }
}

/** Write only when absent or different, reporting which happened. */
async function writeIfChanged(path: string, content: string): Promise<boolean> {
  try {
    if ((await readFile(path, 'utf8')) === content) return false
  } catch {
    // Absent counts as changed.
  }
  await mkdir(join(path, '..'), { recursive: true })
  await writeFile(path, content)
  return true
}
