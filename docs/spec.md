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

**Grok modes.** Use `grok --no-auto-update agent stdio`. Do not pass `--always-approve`. Inherit sandbox and permission mode.

- `grok -p` — Do not use. One prompt for scripts, then the process exits.
- `grok agent stdio` — Use in v1. The daemon owns the process. No local port or tunnel.
- `grok agent serve` — Not v1. It listens on a WebSocket. Remote access needs a reachable Mac or a tunnel. Revisit in v2.
- `grok agent headless` — Do not use. Client for the xAI relay. It sends xAI identity headers to that relay.

**List.** Every non-subagent session on the host. The PWA groups rows by `cwd` (repo).

**Event stream.** Complete `session/load` replay before forwarding live events. Deduplicate by `_meta.eventId` in a session. Do not deduplicate by `toolCallId`. Do not render `available_commands_update` as chat. That event is Grok’s `/` catalog.

**Cancel.** Send `session/cancel`. If the child keeps working, kill the process group.

**Permissions.** Do not pass `--permission-mode`, `--always-approve`, or a sandbox override. Forward each `session/request_permission` to the phone. Until that path exists, return `cancelled`. Never select `allow_once` without a user answer.

**Files.** Advertise ACP client file read and write capabilities as `false`. Do not implement `fs/read_text_file` or `fs/write_text_file`. Grok accesses local files through its own tools and permission policy.

**Relay.** The Worker checks credentials. One Durable Object coordinates each host. Transport roles are `daemon` and `client`.

v1 uses WSS without end-to-end encryption. The Worker can process session payloads but does not persist or log them.

**Auth.** App account is not Grok login. Spend stays on the host. Pair with a one-time code.

**Worker.** `apps/web` serves the PWA and the LRAS API. WebSocket upgrades use the Worker fetch entrypoint.

The Worker authenticates each connection. The Host Durable Object routes messages. The daemon alone calls Grok.

## Protocol invariants

The Zod schemas in `packages/core/src` are the protocol source. The daemon, Worker, test client, and PWA import them.

### Identifier ownership

The Worker creates `hostId` during pairing. The Durable Object creates `connectionId` for each client socket.

The client creates `requestId` and `turnId`. It reuses each value when it retries the same logical action.

The daemon creates `permissionId` and `messageId`. Grok creates `sessionId`, `eventId`, and `toolCallId`.

The daemon validates `cwd` as an allowed absolute path. The Worker treats host paths as opaque strings.

### HTTP API

| Method | Path                  | Auth                           | Request              | Success data                               |
| ------ | --------------------- | ------------------------------ | -------------------- | ------------------------------------------ |
| `*`    | `/api/auth/$`         | Better Auth                    | Better Auth contract | Better Auth contract                       |
| `POST` | `/api/pairings`       | Rate limited                   | `{}`                 | `{ hostId, daemonToken, code, expiresAt }` |
| `POST` | `/api/pairings/claim` | Account session                | `{ code }`           | `{ hostId }`                               |
| `GET`  | `/api/host/ws`        | Account cookie or daemon token | WebSocket upgrade    | `101`                                      |

The pairing response returns `daemonToken` once. The daemon stores it locally. The server stores only its hash.

The WebSocket URL has no `hostId`, role, or credential query parameter. The Worker derives `hostId` and role from verified credentials.

Slice 2 uses fixed development credentials. Slice 3 implements pairing and account authorization.

### Public WebSocket envelope

The client sends requests. The Worker returns one result or error for each request and sends events independently.

The receiver ignores unknown object fields. It rejects an unknown version, message type, or request method.

A client ignores an unknown event. Protocol changes keep old methods and fields during a compatibility window.

Each result or error uses the request `requestId`. A retry of one mutation reuses the same `requestId`.

### Client methods

`session.open` forwards replay events before its result. The result means replay is complete and the session is ready.

`turn.start` returns after Grok accepts the turn. `turn.finished` is the authoritative final outcome.

The daemon accepts one active turn per session. A repeated `turnId` never sends the prompt twice.

`session.create` accepts only a `cwd` from the current session catalog. A repeated request never creates a second session.

### Client events

The daemon projects ACP into `SessionUpdate`. It does not forward raw ACP messages.

The daemon creates `messageId`. All chunks for one user or agent message use the same value.

The daemon derives replay `messageId` values from stable ACP transcript facts. A replay returns the same values after reconnect.

The projection excludes `available_commands_update`, raw tool data, plugin metadata, token counts, and local debug fields.

The receiver deduplicates `session.update` by `sessionId` and `eventId`. It preserves arrival order for unique events.

The relay does not persist or log prompts, transcript events, tool output, diffs, or permission details.

### Protocol errors

Messages contain safe text only. Logs record the error code, request ID, host ID, and operation name.

An invalid text frame returns `INVALID_REQUEST` when `requestId` is usable. Invalid binary frames close the socket.

### Daemon WebSocket contract

The Durable Object adds a route wrapper before it sends a client request to the daemon.

The wrapper lets routing survive Durable Object hibernation. The Durable Object removes the wrapper before client delivery.

Replay events target one connection. Live session events target clients that opened that session.

The daemon sends `sessions.changed` after connection and after session changes. The Durable Object stores that catalog.

### Host Durable Object

The Worker routes verified `hostId` values with `HOST.getByName(hostId)`. The Durable Object does not authenticate public credentials.

The Durable Object uses Hibernation WebSockets. Each socket attachment stores its role, `connectionId`, and open `sessionId`.

The Durable Object derives online status from an open daemon socket. It does not persist an `online` boolean.

SQLite stores only the last `SessionCatalog`. D1 stores account ownership, daemon token hashes, and pairing records.

One host has one daemon socket and many client sockets. A new authenticated daemon socket replaces the old socket.

The Durable Object uses socket tags and attachments for routing. It does not depend on an in-memory pending-request map.

## Decisions

1. Sibling agent, not TUI attach. Session id is on disk. Process is new each remote run.
2. Daemon is machine-scoped. Call the installed `grok` binary.
3. Outbound-only host. Cloudflare is the meeting point. No `cloudflared`.
4. One Durable Object per host. Not per session.
5. Apache-2.0.

## Slices

| Slice | Build                                                                                           | Done when                                                          |
| ----- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| 1     | `apps/host`: `list` and `resume`. No Worker. No PWA.                                            | **Done.** Binary + unit tests + e2e vs installed Grok.             |
| 2     | Real daemon, Worker, Host Durable Object, and programmatic client. Use development credentials. | The client controls a real Grok session through the Worker.        |
| 3     | Account authorization, pairing, and daemon credential storage.                                  | A signed-in user can pair one host and cannot access another host. |
| 4     | PWA over the Slice 2 WebSocket contract.                                                        | A phone can list, create, open, prompt, approve, deny, and cancel. |

CLI flags, errors, and ACP shapes live in `apps/host`. Do not copy them here.

## Slice 2

Slice 2 delivers the complete remote backend without account or PWA work.

```text
Programmatic client -> Worker -> Host Durable Object -> lras up -> grok agent stdio
```

### In scope

1. Add `lras up`. It keeps one outbound WebSocket connected and reconnects with bounded backoff.
2. Add the Worker WebSocket entrypoint and one Host Durable Object per development host.
3. Add the published Zod schemas to `@lras/core`. Parse every message at each process boundary.
4. Add a programmatic client for every client method and event in the published contract.
5. Run the full flow against the installed Grok binary and the built daemon artifact.

### Out of scope

- Better Auth authorization for LRAS messages.
- Pairing and permanent daemon credentials.
- PWA routes, components, and visual design.
- Multiple hosts per account.
- Transcript storage in Cloudflare.

### Required daemon work

1. Replace automatic `allow_once` with the published permission request and answer flow.
2. Advertise ACP client file capabilities as `false`. Remove the direct client file handlers.
3. Add deadlines, `session/cancel`, one active turn per session, and process-group cleanup.
4. Project and deduplicate ACP events. Exclude the command catalog and local metadata.
5. Keep Grok processes under `lras up` instead of one CLI request lifetime.

### Completion proof

One automated test starts the built daemon, Worker runtime, Durable Object, test client, and installed Grok.

The test proves these results:

1. The host becomes online, and the client receives the real session catalog.
2. The client creates a session, opens it, sends a prompt, and receives replay and live events.
3. A permission allow performs the command. A permission deny performs no command.
4. Cancellation stops the turn and leaves no later file or command side effect.
5. Disconnect and reconnect do not duplicate a prompt, event, session, or Grok process.

## Open questions

1. Keep Grok up while the phone has that session open, or spawn per prompt.
2. How we warn if a TUI is writing the same session.

## Completion proof

A second account on a phone on another network can sign in, see only its paired Mac, resume yesterday’s session, send a prompt that writes a file, and start a new session that appears in `grok sessions list`. A TUI on a different session is unchanged.
