# LRAS — v1 spec

Reference: [OpenAI Codex Remote](https://openai.com/index/work-with-codex-from-anywhere/). Same job: steer local agent work from a phone. Different product: Grok Build, our daemon, our relay, our PWA.

## Goal

Control **local** Grok Build sessions from a phone, without attaching to an open TUI.

Anyone can create an account, pair their own machine, and use only their own sessions.

Outcomes:

1. A user signs in and sees only their paired hosts and sessions.
2. List sessions that already exist on that host.
3. Resume one and send the next prompt from the phone.
4. Start a new session in a known repo from the phone.
5. Approve or deny tool calls from the phone.

## Success

1. From a phone on cellular, resume a session by ID and see streamed text and tool calls.
2. A new session created on the phone appears under that repo in `~/.grok/sessions`.
3. A tool call that needs approval blocks until the phone answers. Deny stops that call.
4. An open TUI on the same machine is left alone. Remote work uses a new `grok agent` process.
5. The laptop does not accept inbound public connections.

## Scope

**In**

- Multi-user accounts. Each user owns their hosts and sessions.
- One host per user in v1. More hosts per user later.
- Daemon on the host.
- Cloudflare Worker + one Durable Object per host as the relay.
- Authed PWA (installable on iOS/Android).
- Session list, transcript, prompt, approvals.
- New session in a repo the daemon already knows.

**Out**

- Attach to a live TUI process.
- Concurrent TUI + remote on the same session ID (Grok treats same-ID concurrency as best-effort).
- Multiple hosts, SSH hosts, cloud sandboxes.
- Computer Use, file browser, or a full terminal.
- Push notifications (v1.1).
- Wake-on-LAN / keep-awake policy (host must stay awake).

## Target design

```
Phone PWA  --WSS (auth)-->  Worker  -->  Durable Object (host id)
                                           ^
                                           | outbound WSS
                                      Host daemon
                                           |
                                      grok agent stdio  (ACP)
                                           |
                                      ~/.grok/sessions/<cwd>/<id>
                                      repo on disk
```

### Grok execution modes

All `grok agent` modes stream ACP `session/update` events. The transport and process owner differ.

| Mode                  | Intended use                                           | LRAS decision                                                                                                |
| --------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `grok -p`             | Run one prompt for scripts, bots, or CI, then exit.    | Reject for remote control. The process exits. No live stream or `session/cancel`.                            |
| `grok agent stdio`    | Run an ACP agent over child-process stdin and stdout.  | Use in v1. The daemon starts Grok, streams ACP messages, and needs no local port or tunnel.                  |
| `grok agent serve`    | Run a persistent ACP server on a local WebSocket port. | Reject for v1. Remote access needs a laptop port or a shipped tunnel.                                        |
| `grok agent headless` | Connect outward to the Grok WebSocket relay.           | Reject. The implementation permits first-party xAI sessions and sends the xAI bearer token to the relay URL. |

### Daemon

One process per machine. Not launched inside a repo.

- Discovers sessions from `~/.grok/sessions/<encoded-cwd>/<id>/` (`summary.json`: id, cwd, title, timestamps). Conversations live in `$GROK_HOME`, not in the project tree.
- Discovers repos from those session groups. User can pin extra repo paths in daemon config.
- When a session must run, spawn stock `grok` **with that session’s cwd**.
  - Existing thread: ACP `session/load` with that session ID and cwd.
  - New thread (after slice 1): ACP `session/new` with the chosen cwd.
- Command: `grok --no-auto-update agent stdio`. Users update Grok separately.
- Do not pass `--always-approve`. Do not override `--sandbox`. Inherit `~/.grok/config.toml` and `GROK_SANDBOX`.
- That Grok loads the same `AGENTS.md`, rules, hooks, MCP, and `auth.json` as `grok --resume` in that folder.
- Forwards prompts as `session/prompt`. Streams `session/update`.
- Slice 3+: opens an **outbound** WebSocket to the Worker. Reconnects on drop.

This process is the **daemon**. It is not an app server. Grok is the agent (`stdio` / `serve` / `headless`). The daemon is the parent. It lists disk sessions and spawns `stdio`. It does not listen.

Do not fork grok-build. Do not ship a Grok plugin as the host. Do not bind `grok agent serve`. Do not use `grok agent headless --grok-ws-url` (that client is grok.com’s relay).

`grok -p --resume` is a one-shot fallback. ACP `stdio` is the v1 path: stay up for one turn, stream, cancel. Probe (Grok 1.0.4): `session/load` works. File edits are not gated on `session/request_permission`.

### Relay (Worker + Durable Object)

- Worker: Better Auth session check, static PWA, WebSocket upgrade.
- One Durable Object per host (`getByName(hostId)`). SQLite class.
- Accept sockets with the **Hibernation WebSocket API** (`ctx.acceptWebSocket`). Idle connections must not pin the isolate in memory.
- Roles on the socket: `daemon` or `phone`. Fan-in: phone messages → daemon. Fan-out: daemon events → all phone sockets for that host.
- Persist pairing and host online state in DO SQL. Use `serializeAttachment` for per-socket role after hibernation.
- Pairing: daemon shows a one-time code. Signed-in PWA claims it. DO stores the host binding.

### PWA

- Sign in. See the host. See sessions (title, cwd, updated).
- Open a session: replay stored transcript, then live stream.
- Compose a prompt. See tool calls. Approve or deny.
- “New session” picks a known repo cwd.
- Installable. Mobile-first. No desktop chrome in v1.

### Auth and trust

Two logins. They are not the same.

- **App account:** Better Auth on the PWA. Isolation: a user sees only their hosts and sessions.
- **Grok identity:** the host’s `~/.grok/auth.json` (grok.com / `XAI_API_KEY`). Spend stays on the host.
- **Pairing:** daemon shows a one-time code. Signed-in PWA claims it. Daemon keeps a device token. Rotate on re-pair.
- Worker rejects unauthenticated upgrades.
- Relay never sees the host filesystem. It forwards envelopes.

## Error paths

| Condition                 | Response                                                                                                                      |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Host offline / asleep     | PWA shows offline. Queue nothing in v1.                                                                                       |
| Daemon reconnects         | DO marks host online. Phone resumes stream.                                                                                   |
| ACP process dies mid-turn | Surface error. Session files stay on disk. Next prompt respawns the agent.                                                    |
| Same session open in TUI  | Do not attach. Warn if `updates.jsonl` is being written by another process. Operator picks another session or closes the TUI. |
| Pairing code expired      | Issue a new code. Old code fails closed.                                                                                      |
| Auth cookie missing       | 401. No socket.                                                                                                               |

One log point per failure: Worker logs auth and upgrade failures. Daemon logs ACP and outbound socket failures. PWA shows the user-facing string only.

## Decisions

1. **Sibling agent, not TUI attach.** Session identity is the on-disk session ID. Process identity is new each remote run.
2. **ACP over stdio is the host API.** Session store is `$GROK_HOME/sessions`, grouped by cwd.
3. **Daemon is machine-scoped.** It starts `grok` with the session cwd. It is not a per-repo CLI.
4. **No fork, no plugin host.** Call the user’s installed `grok` binary.
5. **Do not loosen Grok safety.** No `--always-approve`. Inherit sandbox and permission rules.
6. **Outbound-only host.** Cloudflare is the meeting point. No inbound port on the laptop. No `cloudflared`.
7. **One DO per host.** Not one global DO. Not one DO per session in v1.
8. **Hibernation WebSockets.** Required on the DO. Do not use `server.accept()`.
9. **Multi-user, one host per user in v1.** App accounts are first-class. Extra hosts per user wait.
10. **Apache-2.0.**
11. **Name is daemon.** Not app server. Grok is the agent. The daemon is the parent.
12. **stdio only.** `serve` needs a laptop port or a tunnel. `headless --grok-ws-url` is grok.com’s client.
13. **Phone approval is not a slice 1 stop.** Stock ACP does not gate file edits. Shell deny over ACP works. Inherit the host mode (`auto` / `ask`).

## Build slices

The host is a daemon. Slice 3+ is `lras up`: print a pair code and stay running. Slice 1 is a foreground CLI that becomes that process.

ACP `session/load` already passed on Grok 1.0.4. Slice 1 builds the daemon on that result. Do not wait for the Codex probe.

Defer until after slice 4: brand polish, multi-host, push, any-agent adapters.

| Slice | Build                                                                                                                          | Done when                                                             |
| ----- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| 1     | `apps/daemon` — list disk sessions; `resume` via `grok agent stdio`. No Worker. No PWA.                                        | See **Slice 1** below.                                                |
| 2     | Worker + one Durable Object per host. Hibernation WebSockets. Roles `daemon` and `phone`. Shared envelopes in `packages/core`. | A fake daemon (`websocat`) lists sessions through the Durable Object. |
| 3     | Daemon opens outbound WSS to the Worker. Pairing code. Reconnect on drop.                                                      | Host shows online. Session list arrives over the socket.              |
| 4     | PWA on `apps/web`. Better Auth is already there.                                                                               | Phone: sign in, list, open, prompt.                                   |

## Slice 1

Local CLI only. Prove the host can list sessions and continue one.

```
operator  →  apps/daemon  →  grok --no-auto-update agent stdio
                          →  ~/.grok/sessions/<cwd>/<id>
```

### Success

1. `lras list` prints `id`, title, cwd, and updated time for real sessions on this machine.
2. `lras resume <id> --prompt "…"` loads that id, sends the prompt, and streams the reply.
3. A prompt that asks for a file write leaves that file in the session cwd.
4. After the command, that `grok` process is gone.

### In

- Package `apps/daemon`. Binary name `lras`.
- `lras list` — read `$GROK_HOME/sessions` (`summary.json`). Do not start Grok.
- `lras resume <id> --prompt <text>` — spawn Grok in that session’s cwd. ACP: `initialize` → `authenticate` (`cached_token`) → `session/load` → `session/prompt`. Print `session/update` on stdout. Kill the child on exit.
- `@lras/core` owns `SessionSummary`: `{ id, cwd, title, updatedAt }`.
- Raw JSON-RPC on stdio. No ACP SDK.

### Out

- Worker, Durable Object, pairing, outbound WSS, PWA.
- `session/new`.
- Approve / deny on stdin or on a phone.
- `--always-approve`, sandbox overrides, `grok agent serve`, `grok agent headless`.
- Long-lived Grok after the command. Idle policy waits.

### Layout

```
apps/daemon/src/
  main.ts           # argv: list | resume
  list-sessions.ts  # GROK_HOME/sessions → SessionSummary[]
  acp-stdio.ts      # spawn, JSON-RPC lines
  resume.ts         # load + prompt + stream

packages/core/src/
  session.ts        # SessionSummary
```

## Open questions

1. After slice 1: keep Grok up while a phone has that session open, or spawn per prompt. Slice 1 is spawn per command.
2. How we detect “TUI is writing this session” without races. First cut: warn only. Not required to pass slice 1.
3. Whether the PWA replays `updates.jsonl` via the daemon or a thin HTTP snapshot. Prefer one snapshot on open, then live ACP events.

## Completion proof

A second account on a phone on a different network can:

1. Sign in and see only that account’s paired Mac as online. It cannot see another user’s hosts.
2. Open yesterday’s session in a repo on that Mac and send a prompt that produces a file edit there.
3. Approve one tool call and deny another.
4. Start a new session in the same repo and find it in `grok sessions list` on that Mac.

The TUI, if left open on a different session, is unchanged.
