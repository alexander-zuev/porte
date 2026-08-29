# Grok plugin: `/remote-control`

## Goal

One Grok command connects this machine to Porte. Unpaired → pair, then connect. Paired → connect. Connected → disconnect. No terminal, no code to copy.

## How it works

- The plugin ships `.mcp.json` → Grok starts `npx -y @porte/cli@latest mcp` with each session and kills it at session end. That process is the daemon.
- The skill `/remote-control` calls the tool `porte__remote_control` and prints its text. The tool owns all logic; the model owns none.
- `porte mcp` is a second thin entrypoint beside `cli/`. It reuses `pairHost` and `createHostRuntime` unchanged.

## Contracts (new)

```ts
// application/commands/remote-control.ts — one per process, no arguments
type RemoteControlState =
  | { type: 'idle' }
  | { type: 'pairing'; verificationUri: string }               // pairHost running; approval → connect
  | { type: 'connected'; runtime: HostRuntime; relayUrl: string; stop: AbortController }

type RemoteControlResult =
  | { type: 'pair'; verificationUri: string }                  // "Open <link> to approve"
  | { type: 'pairing-pending'; verificationUri: string }
  | { type: 'pairing-failed'; reason: 'denied' | 'expired' }   // back to idle
  | { type: 'connected'; url: string }                         // waited for first RelayStatus 'connected', max 10 s
  | { type: 'connecting'; url: string }                        // still retrying; call again
  | { type: 'disconnected' }
  | { type: 'held-elsewhere'; pid: number }                    // another Grok session holds the lock

toggle(): Promise<RemoteControlResult>

// application/ports/host-lock.ts — one connected daemon per machine
interface HostLock { acquire(): Promise<{ type: 'held' } | { type: 'held-elsewhere'; pid: number }>; release(): Promise<void> }
```

`DeviceCodeGrant` and `PairingPrompt` gain `verificationUriComplete` (core already parses `verification_uri_complete`; the client drops it today). The tool shows that link.

## Files

| Add                                                                                       | Owns                                                              |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `plugins/grok/.mcp.json`, `plugin.json`, `skills/remote-control/SKILL.md`                 | the plugin                                                        |
| `.grok-plugin/marketplace.json` (repo root)                                               | `grok plugin marketplace add alexander-zuev/porte`                |
| `apps/host/src/application/commands/remote-control.ts`                                    | state machine above                                               |
| `apps/host/src/application/ports/host-lock.ts`, `infrastructure/persistence/host-lock.ts` | pid lock in `~/.porte/host.lock`                                  |
| `apps/host/src/entrypoints/mcp/run-mcp-command.ts`                                        | `@modelcontextprotocol/sdk` stdio server, one tool, result → text |
| `tests/unit/remote-control.test.ts`, `tests/unit/host-lock.test.ts`                       | proof                                                             |

| Change                                                                                                                               | What                                      |
| ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------- |
| `entrypoints/cli/parse-command.ts`, `run-cli.ts`                                                                                     | `mcp` verb + help                         |
| `application/ports/device-authorizer.ts`, `infrastructure/porte/device-authorization-client.ts`, `application/commands/pair-host.ts` | pass `verificationUriComplete`            |
| `apps/host/package.json`, `pnpm-workspace.yaml`                                                                                      | add `@modelcontextprotocol/sdk` (catalog) |
| `apps/host/README.md`                                                                                                                | plugin install as the first option        |

Unchanged: `porte pair`, `porte up`, `porte unpair`, web, relay.

## Out of scope

Unpair from Grok, QR code, status line, xAI marketplace PR, first npm publish (manual prerequisite: `npx @porte/cli` must resolve).

## Proof

1. Unit: `toggle()` walks idle → pairing → connected → idle with a fake authorizer, runtime, and lock; second lock holder gets `held-elsewhere`.
2. Live: `grok plugin install ./plugins/grok --trust`; new session; `/remote-control` ×3 = link, connected URL, disconnected. Phone shows the online/offline toasts. Second Grok session: `held-elsewhere`.

## Open question

Grok "leader" mode may share one MCP process across sessions. Live step 2 answers it; the lock is correct either way.
