# LRAS — v1 spec

Steer local Grok Build sessions from a phone. Do not attach to an open TUI.

Anyone can create an account, pair their machine, and use only their own sessions.

## Success

1. From a phone on cellular, resume a session by ID and see streamed text and tool calls.
2. A new session created on the phone appears under that repo in `~/.grok/sessions`.
3. An open TUI on the same machine is left alone. Remote work uses a new `grok` process.
4. The laptop does not accept inbound public connections.
5. Opening a session never shows duplicate messages or tool calls.
6. After the user stops a session, no command or file edit completes later.

Phone approval is not required in slice 1. LRAS always keeps the user’s Grok permission policy.

## Scope

**In:** multi-user accounts; one host per user; host daemon; Worker + one Durable Object per host; authed PWA; list, resume, prompt; new session in a known repo.

**Out:** attach to a live TUI; same session ID in TUI and remote (best-effort); multiple hosts; SSH; cloud sandboxes; Computer Use; file browser; full terminal; push; wake-on-LAN.

## Design

```
Phone PWA  --WSS (auth)-->  Worker  -->  Durable Object (host id)
                                           ^
                                           | outbound WSS
                                      Host daemon
                                           |
                                      grok agent stdio
                                           |
                                      ~/.grok/sessions + repo
```

**Daemon.** One process per machine. Lists `$GROK_HOME/sessions`. Spawns stock `grok --no-auto-update agent stdio` in that session’s cwd. `session/load` to resume. `session/prompt` to send. Not an app server. Does not listen.

### Grok modes

| Mode                  | LRAS decision    | Reason                                                                                         |
| --------------------- | ---------------- | ---------------------------------------------------------------------------------------------- |
| `grok -p`             | Do not use.      | It runs one prompt for scripts and then exits.                                                 |
| `grok agent stdio`    | Use in v1.       | The daemon owns the process. No local port or tunnel is required.                              |
| `grok agent serve`    | Evaluate for v2. | It accepts WebSocket connections, so remote access needs a reachable Mac endpoint or a tunnel. |
| `grok agent headless` | Do not use.      | It is the client for the xAI relay and sends xAI identity headers to that relay.               |

Use `grok --no-auto-update agent stdio`. Do not pass `--always-approve`. Inherit the sandbox and permission mode.

**Event stream.** Complete `session/load` replay before forwarding live events. Use `_meta.eventId` as the event identity within a session. Ignore a repeated `eventId` before storage or forwarding. Do not deduplicate by `toolCallId`; one tool call has multiple valid updates.

**Cancellation.** Send `session/cancel` for the active turn. Grok can return `cancelled` or `end_turn`. Success means no tool process or delayed side effect remains. If ACP cancellation does not stop execution, terminate the Grok child process and its process group.

**Permissions.** Do not pass `--permission-mode`, `--always-approve`, or a sandbox override. Forward each `session/request_permission` that Grok emits. Grok remains the source of each allow, ask, or deny decision.

**Relay.** Worker checks Better Auth. One Durable Object per host. Hibernation WebSockets. Roles `daemon` and `phone`.

**Auth.** App account (PWA) is not Grok login. Spend stays on the host. Pair with a one-time code.

## Decisions

1. Sibling agent, not TUI attach. Session id is on disk. Process is new each remote run.
2. Daemon is machine-scoped. Call the installed `grok` binary.
3. Outbound-only host. Cloudflare is the meeting point. No `cloudflared`.
4. One Durable Object per host. Not per session.
5. Apache-2.0.

## Slices

| Slice | Build                                                      | Done when                                  |
| ----- | ---------------------------------------------------------- | ------------------------------------------ |
| 1     | `apps/daemon`: `list` and `resume`. No Worker. No PWA.     | See below.                                 |
| 2     | Worker + Durable Object. Shared envelopes in `@lras/core`. | Fake daemon lists sessions through the DO. |
| 3     | Daemon dials the Worker. Pairing. Reconnect.               | Host online. Session list on the socket.   |
| 4     | PWA. Better Auth is already there.                         | Phone: sign in, list, open, prompt.        |

## Slice 1

Local CLI. Prove list + resume.

Follow [Node.js CLI Apps Best Practices](https://github.com/lirantal/nodejs-cli-apps-best-practices) for the CLI. Code is the source of truth for how. The spec only requires the important ones: POSIX flags, `--help` / `--version`, stdout vs stderr, structured JSON, tagged errors + exit codes, no prompts in CI, `bin` + shebang, small dependency set.

**Done when:** `pnpm --filter @lras/daemon build` emits `dist/main.js`. `lras list` and `lras resume` run from that binary. Unit tests cover the store and CLI. An e2e test talks to installed Grok.

## Open questions

1. After slice 1: keep Grok up while a phone has that session open, or spawn per prompt.
2. How we warn if a TUI is writing the same session.
3. PWA open: snapshot `updates.jsonl`, then live ACP events.

## Completion proof

A second account on a phone on another network can sign in, see only its paired Mac, resume yesterday’s session, send a prompt that writes a file, and start a new session that appears in `grok sessions list`. A TUI on a different session is unchanged.
