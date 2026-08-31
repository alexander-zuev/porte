# Grok plugin: `/remote-control`

> **Frozen. Do not edit.** This doc is deleted on ship.

## Goal

`/remote-control` in Grok pairs, connects, and disconnects this machine — deterministic text, zero LLM turns, zero manual installs. While ≥1 Grok session is open, the machine is reachable from useporte.dev.

## UX (fixed)

| Input                    | State       | Text                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------ | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/remote-control`        | not paired  | `Open this link on your phone to approve this machine (code ABCD-EFGH):` then the link alone on its own line — copyable in one gesture — then `It connects on its own once you approve.` The link shows at once; a detached watcher waits for the tap and then enables. Run again while unanswered → `Still waiting for approval. Open this link on your phone (code ABCD-EFGH):` + the link line. An expired code starts over with a fresh link. |
| `/remote-control`        | paired, off | `Remote control on. Run this machine's Grok sessions from your phone: https://useporte.dev` — or, when no daemon confirms within 10 s, `Turning remote control on. Run /remote-control status in a moment.`                                                                                                                                                                                                                                       |
| `/remote-control`        | on          | `Remote control off.`                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `/remote-control status` | any         | `Remote control on · useporte.dev` / `Remote control off · paired as "<host>"` / `Remote control off · not paired`                                                                                                                                                                                                                                                                                                                                |
| `/remote-control unpair` | paired      | `This machine is removed from your Porte account. Run /remote-control to pair again.`                                                                                                                                                                                                                                                                                                                                                             |

Status line (opt-in): `/rc on · access your Grok sessions from anywhere · useporte.dev` (green) / `/rc off` (gray).

## Design — three surfaces, one job each

| Surface                                                | Job                                                                                                                                                                                                                                                      | Verified                                                        |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| **Skill** (default path)                               | Typing `/remote-control` has the model run `npx -y @porte/cli@0.2.2 rc <verb>` and print stdout verbatim. Clean transcript; costs a model turn (~20–30 s) and tokens.                                                                                    | Live TUI: pairing + connect end-to-end.                         |
| **`UserPromptSubmit` hook** (opt-in: `rc enable-hook`) | Matches `/remote-control`, runs the verb, returns `{"decision":"block","reason":<text>}`. Instant and deterministic, but Grok frames the answer as ⚠ "Prompt blocked" — confusing enough that it is off by default until xAI ships a "handled" decision. | Live TUI: intercepted in 0.3–2.6 s, exact text, link clickable. |
| **`.mcp.json`** → `npx -y @porte/cli@0.2.2 mcp`        | The daemon and the installer. Grok spawns it eagerly at every session start and kills it at session end; npx fetches the package on first run. Exposes no tools.                                                                                         | Headless run: process spawned with zero tool calls.             |

Rules that fell out of the spike:

- **The daemon owns the hook files, on request.** Plugin-shipped hooks do not load (verified: `has_hooks=true`, hook engine registers 0), so `rc enable-hook` writes `~/.grok/hooks/porte.json` — global hooks are always trusted — and each daemon start syncs the files to the `hook` setting (removes them when off). Takes effect in the next session; hooks load at session start.
- **Hook matches slash form only.** A blocked non-slash prompt lands in Grok's queue with an Edit/Resend/Discard pane (verified). Plain text is never touched.
- **Auto-connect.** On/off persists in `~/.porte`. Daemon start + saved state on + machine paired → connect silently. Open a terminal, type `grok`, machine is live.
- **One connected daemon per machine.** Each Grok session spawns its own process (leader mode is off by default); a pid lock in `~/.porte` elects one, the rest idle. Last session closing takes the machine offline.
- **Hook name is `porte`.** Grok's fixed framing then reads `Prompt blocked by global/porte: Remote control on. …` — the least-bad rendering we control.
- **Status line ships as a documented one-liner** (`[ui.status_line]` + script reading daemon state). Only user config can add it; a plugin cannot. Verified rendering live.

## Implementation

### Decisions

1. **Files coordinate; no socket, no RPC.** The rc invocation and the daemons share four files under `~/.porte`. Intent and fact stay separate: `remote-control.json` (intent: `{ enabled, hook }`), `rc-state.json` (fact: written only by the lock holder), `rc-pairing.json` (the in-flight grant), `host.lock` (election, atomic `wx` create + dead-pid steal). A socket protocol buys nothing here — every transition tolerates 1 s of latency.
2. **`porte mcp` uses `@modelcontextprotocol/sdk`** (catalog dependency): stdio transport, zero tools, transport close → shutdown. The handshake must succeed — the spike showed Grok retries a server that fails it.
3. **The hook script is a bash prefilter; the CLI does the work.** The script matches `/remote-control` anywhere in the raw payload and exits silently otherwise — no process spawn on ordinary prompts. The match is loose on purpose: the CLI parses the prompt properly and stays silent for a payload that merely mentions the command, so a false positive costs one npx spawn and nothing else. On match it pipes the payload to `npx -y @porte/cli@0.2.2 rc hook`, which runs the verb and prints the block JSON.
4. **Lock takeover.** An idle daemon polls the lock every 5 s; when the holder dies (its Grok session closed) and `enabled` is true, the next daemon acquires and reconnects. This is what keeps "reachable while ≥1 session is open" true, not just "while the first session is open".

### Contracts

```ts
// application/ports/machine-lock.ts — one connected daemon per machine
interface MachineLock {
  acquire(): Promise<{ type: 'held' } | { type: 'held-elsewhere'; pid: number }>
  release(): Promise<void>
}

// application/ports/remote-control-store.ts
interface RcSettings { read(): Promise<{ enabled: boolean }>; write(s: { enabled: boolean }): Promise<void> }
/** Written only by the lock holder; readers treat a dead writer pid as 'off'. */
interface RcState {
  read(): Promise<{ status: 'on'; url: string; pid: number } | { status: 'off' }>
  write(state: { status: 'on'; url: string; pid: number } | { status: 'off' }): Promise<void>
}

// application/commands/remote-control.ts — runs in the `rc` process, coordinates via the stores
type RcResult =
  | { type: 'connected'; url: string }        // waited for rc-state 'on', max 10 s
  | { type: 'connecting'; url: string }       // enabled written, no holder confirmed yet
  | { type: 'disconnected' }
  | { type: 'pairing-started' | 'pairing-pending'; verificationUriComplete: string; userCode: string }
toggle(deps: RcDeps): Promise<RcResult>       // unpaired → issue code, hand it to the detached watcher, return the link at once
status(deps: RcDeps): Promise<{ type: 'on'; url: string } | { type: 'off'; hostName: string } | { type: 'not-paired' }>
unpair(deps: RcDeps): Promise<{ type: 'unpaired' } | { type: 'not-paired' }>  // disable, revoke, delete credential
```

`DeviceCodeGrant` and `PairingPrompt` gain `verificationUriComplete` (core already parses `verification_uri_complete`; `DeviceAuthorizationClient` drops it today). The pair prompt shows that link.

### Call stacks

```txt
/remote-control (session ≥ 2)
  Grok UserPromptSubmit → ~/.porte/hook/porte-hook.sh (bash prefilter)
  → npx -y @porte/cli@0.2.2 rc hook  (payload on stdin)
  → parse verb from .prompt → remote-control.toggle/status/unpair
  → RcSettings.write / RcState.read / pairHost
  → stdout {"decision":"block","reason":<UX-table line>} → Grok paints it

daemon (every Grok session start)
  Grok spawns `npx -y @porte/cli@0.2.2 mcp` (.mcp.json)
  → install hook idempotently (~/.grok/hooks/porte.json + ~/.porte/hook/porte-hook.sh, content compared)
  → serve MCP stdio; loop every 5 s:
      lock free + enabled + paired → acquire → createHostRuntime → runtime.run → RcState 'on'
      disabled while holding      → abort runtime → release → RcState 'off'
  → stdin EOF (session end) → abort runtime, release lock, RcState 'off'

failure
  hook absent/timed out → Grok fails open → skill runs the same `rc` verb through the model (slower, still correct)
  approval never comes → the watcher dies with the grant's expiry; the next /remote-control issues a fresh code
  rc toggle with no live daemon (all sessions closing) → 'connecting' line; next session start connects
  first-ever session → npx cold start can pass Grok's 30 s MCP startup timeout → that session runs daemonless; the cache is warm afterwards
  rc hook past its 30 s hook timeout → fail-open, the skill re-runs the verb: a toggle that already wrote `enabled` flips back — rare, the daemon keeps the npx cache warm
```

### Files

| Add                                                                                                               | Owns                                                       |
| ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `plugins/grok/plugin.json`, `.mcp.json`, `skills/remote-control/SKILL.md`; `.grok-plugin/marketplace.json` (root) | the plugin (static, unbuilt)                               |
| `apps/host/src/entrypoints/mcp/run-mcp-command.ts`                                                                | MCP SDK server (stdio, zero tools) + daemon loop above     |
| `apps/host/src/entrypoints/cli/rc-command.ts`                                                                     | `rc hook\|toggle\|status\|unpair` → result → UX-table text |
| `apps/host/src/application/commands/remote-control.ts`                                                            | toggle/status/unpair logic                                 |
| `apps/host/src/application/ports/machine-lock.ts`, `ports/remote-control-store.ts`                                | contracts above                                            |
| `apps/host/src/infrastructure/persistence/machine-lock.ts`, `remote-control-store.ts`                             | pid lock + atomic JSON files in `~/.porte`                 |
| `apps/host/src/infrastructure/grok/hook-installer.ts`                                                             | embedded hook script + json, idempotent write              |

| Change                                                                                                                               | What                            |
| ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------- |
| `entrypoints/cli/parse-command.ts`, `run-cli.ts`                                                                                     | `mcp` + `rc` verbs, help        |
| `application/ports/device-authorizer.ts`, `infrastructure/porte/device-authorization-client.ts`, `application/commands/pair-host.ts` | pass `verificationUriComplete`  |
| root `README.md`                                                                                                                     | plugin install as the Grok path |

Unchanged: `porte pair`, `porte up`, `porte unpair`, web, relay, everything under `application/handlers`.

### Test plan (red-green slices)

1. `remote-control.test.ts`: toggle walks not-paired → pairing-started → pairing-pending → fresh code after expiry with fake authorizer/stores; toggle while on disables; unpair revokes and deletes.
2. `machine-lock.test.ts`: second acquire returns `held-elsewhere`; dead-pid lock is stealable; release is idempotent.
3. `hook-installer.test.ts`: fresh install writes both files; unchanged content writes nothing; changed script is replaced.
4. `rc-command.test.ts`: payload → verb parsing (`/remote-control`, `status`, `unpair`, junk suffix); each result renders the exact UX-table line; block JSON is valid.
5. `run-mcp-command.test.ts`: SDK client handshakes against the server over an in-memory transport; transport close releases the lock and aborts the runtime (fake runtime).
6. `cli.test.ts` (change): `mcp` and `rc` parse; help text lists them.

## Feature request to xAI

`xai-org/grok-build` is public with issues disabled; the channel is `/feedback` inside Grok. Send:

> Plugins can't deliver a deterministic slash command. Two asks: (1) a `"handled"` decision for `UserPromptSubmit` hooks — paint the hook's text as normal output, skip the model turn, without the ⚠ "Prompt blocked" framing and queue pause; (2) load plugin-shipped `hooks/hooks.json` — today discovery reports `has_hooks=true` but the hook engine registers 0 hooks, so plugins must side-write into `~/.grok/hooks/`. Use case: a `/remote-control` command (Claude Code parity) that must not cost an LLM turn.

Until then the blocked framing is the accepted cost.

## Ship to the marketplace

`@porte/cli` 0.2.2 is the pinned runtime for this plugin release.

The plugin is static config, not code: no build, no package.json, not in `apps/` or `packages/`. Grok requires the index at the repo root:

```
.grok-plugin/marketplace.json      # index Grok reads: { name, plugins: [{ name: "porte", source: "./plugins/grok" }] }
plugins/grok/
  plugin.json                      # name, version, description
  .mcp.json                        # porte: npx -y @porte/cli@0.2.2 mcp
  skills/remote-control/SKILL.md
```

The hook file content is embedded in the CLI (the daemon writes `~/.grok/hooks/porte.json`), so the plugin ships no hooks directory.

1. Validate: `grok plugin validate plugins/grok`; tag: `grok plugin tag --push`.
2. User install (the only documented flow, via the official xAI marketplace):
   ```
   grok plugin install porte --trust
   ```
   Until the official listing merges, `grok plugin marketplace add alexander-zuev/porte` first. Uninstall removes the skill and the MCP entry but not the opt-in global hook — `npx -y @porte/cli@0.2.2 rc disable-hook` first, then `grok plugin uninstall porte`.
3. Official listing — PR to `xai-org/plugin-marketplace` (verified process from their CONTRIBUTING.md): one entry in `.grok-plugin/marketplace.json` with our repo URL + pinned 40-char commit `sha`, `homepage`, brand-scoped `keywords`/`domains` (`porte`, `useporte.dev`), license stated; run `scripts/generate-plugin-index.py` and `scripts/validate-catalog.py` before opening. Subdirectory plugins are supported: `source.path` on a url source points into the repo (mongodb ships with `"path": "plugins/mongodb"`; `validate-catalog.py` checks the field). Our entry uses `"path": "plugins/grok"` — no dedicated plugin repo needed.

## Proof

1. Unit: `toggle()` walks idle → pairing → connected → idle with fake authorizer, runtime, lock; second lock holder gets `held-elsewhere`; `unpair()` clears credentials; daemon start with saved on-state connects without a command.
2. Live: install per §Ship, session 1 `/remote-control` pairs via fallback, session 2 `/remote-control` toggles in <1 s with hook text; two sessions → second stays idle; last session close → phone shows machine offline.

Pairing never waits inside the hook: a hook paints exactly one text at exit, so the link could not be shown before a wait — the two-phase flow (link at once, detached watcher, auto-connect on approval) is the only shape that works, and it is the better UX.
