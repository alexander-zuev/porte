# Grok Anywhere — v1 spec

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

### Daemon

One process per machine. Not launched inside a repo.

- Discovers sessions from `~/.grok/sessions/<encoded-cwd>/<id>/` (`summary.json`: id, cwd, title, timestamps). Conversations live in `$GROK_HOME`, not in the project tree.
- Discovers repos from those session groups. User can pin extra repo paths in daemon config.
- When the phone opens a session, spawn stock `grok` **with that session’s cwd**.
  - Existing thread: ACP `session/load` with that session ID and cwd.
  - New thread: ACP `session/new` with the chosen cwd.
- Do not pass `--always-approve`. Use the host’s ask/auto mode so tool calls wait on the phone.
- Do not override `--sandbox`. Inherit `~/.grok/config.toml` and `GROK_SANDBOX`.
- That Grok loads the same `AGENTS.md`, rules, hooks, MCP, and `auth.json` as `grok --resume` in that folder.
- Streams ACP `session/update` events to the relay.
- Forwards phone prompts as `session/prompt`.
- Surfaces permission requests to the phone. Returns allow or deny.
- Opens **outbound** WebSocket to the Worker. Reconnects on drop.

Do not fork grok-build. Do not ship a Grok plugin as the host. Do not bind `grok agent serve` on a public address. Do not use Grok’s hosted `--grok-ws-url` relay.

Headless `grok -p --resume --output-format streaming-json` is a fallback for one-shot prompts. ACP is the v1 path because approvals are bidirectional. Verified: resume of a disk session works with no TUI (`grok -p --resume <id>`).

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
6. **Outbound-only host.** Cloudflare is the meeting point. No inbound port on the laptop.
7. **One DO per host.** Not one global DO. Not one DO per session in v1.
8. **Hibernation WebSockets.** Required on the DO. Do not use `server.accept()`.
9. **Multi-user, one host per user in v1.** App accounts are first-class. Extra hosts per user wait.
10. **Apache-2.0.**

## Open questions

1. Long-lived ACP process per session vs spawn-per-prompt. Prefer long-lived while the phone has that session open.
2. How we detect “TUI is writing this session” without races. First cut: warn only.
3. Whether the PWA replays `updates.jsonl` via the daemon or a thin HTTP snapshot. Prefer one snapshot on open, then live ACP events.

## Completion proof

A second account on a phone on a different network can:

1. Sign in and see only that account’s paired Mac as online. It cannot see another user’s hosts.
2. Open yesterday’s session in a repo on that Mac and send a prompt that produces a file edit there.
3. Approve one tool call and deny another.
4. Start a new session in the same repo and find it in `grok sessions list` on that Mac.

The TUI, if left open on a different session, is unchanged.
