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

/** Remove the prompt hook, so `/remote-control` runs through the skill again. */
export async function removeGrokHook(input: InstallGrokHookInput): Promise<void> {
  await rm(join(input.grokHome, 'hooks', 'porte.json'), { force: true })
  await rm(join(input.porteHome, 'hook', 'porte-hook.sh'), { force: true })
}

/**
 * Write the status-line script the person can opt into from `config.toml`.
 *
 * Only the person's own Grok config may set `[ui.status_line]` — Grok refuses
 * it from every other layer — so the daemon delivers the script and the README
 * carries the four config lines.
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
if [[ "$state" == *'"status":"on"'* ]] && [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
  printf '\\033[32m/rc on\\033[0m · access your Grok sessions from anywhere · useporte.dev'
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
