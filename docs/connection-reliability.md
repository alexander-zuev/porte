# Connection reliability (plan)

Host ⇄ relay ⇄ browser. Five changes, each with the fact that makes it necessary. Status: proposal.

## 1. Restart `seq` on every socket open

**Change.** The Host resets its notification counter in `onUp`, which the transport runs on every open. Files: `websocket-notifications.ts`, `control-connection.ts`, `conversation-connection.ts`.

**Why.** The relay keys its `seq` expectation by connection id, so a new socket expects 1. The Host's counter is created once per connection object and continues at N+1 after a reconnect. The relay parks every frame, closes with 1008 at 256, and the Host treats 1008 as terminal. Result: after any reconnect no event reaches the browser until the daemon restarts the Host. The web integration test hides this with a manual `seq = 0`.

## 2. Fast retries on both sides

**Change.** One shared PartySocket option set, passed by the Host transport and by both `useAgent` calls: first retry 200 ms, growth ×2, cap 5 s, `minUptime` 2 s. The handshake timeout stays at 4 s.

**Why.** Nobody sets these options today, so PartySocket defaults apply: first retry 3 s, growth ×1.3, cap 10 s, and a drop inside 5 s of open keeps the delay growing. A one-second blip costs 3–10 s. The new sequence is 0.2, 0.4, 0.8, 1.6, 3.2, 5 s.

## 3. Detect a dead link and reconnect at once

**Change.** Host: ping every 15 s, `terminate()` when no pong arrives in 10 s. Browser: one hook calls `agent.reconnect()` on `online` and on the page becoming visible while the socket is not open.

**Why.** The Host pings but never checks for a pong, so after sleep or a Wi‑Fi swap the socket stays `OPEN` until TCP gives up, minutes later. The browser shows the machine online and every command times out at 60 s. `reconnect()` resets the retry count, so a wake-up reconnect skips the delay. Neither PartySocket nor the Agents client listens to `online` or visibility.

## 4. Tell the person why the Host cannot connect

**Why.** The daemon catches every Host error with an empty `catch`, writes `off`, and retries on the next poll. A revoked pairing loops every 5 s forever. The person sees `/rc off` and has no way to learn that `/remote-control` fixes it. The retry loop itself is cheap; the missing reason is the fault.

**How the Host reports failure today.** The transport rejects `stopped` with one typed error that carries `classification`. `porte up` prints it and exits. The daemon drops it. The relay and browser never learn a reason: they see a closed socket and show the red dot. Logs go to stderr, which Grok does not show, so the state file is the only channel that reaches the person.

**What can reach the daemon, and what to do with it.**

| Failure                                     | Meaning                                      | Daemon action                                            | Person sees                   |
| ------------------------------------------- | -------------------------------------------- | -------------------------------------------------------- | ----------------------------- |
| Handshake 401 or 403                        | Credential expired or pairing revoked        | Stop. Wait for the credential or settings file to change | `error`: pair again           |
| Handshake other 4xx                         | Relay refused: route gone, protocol mismatch | Stop. Wait for change                                    | `error`: update Porte         |
| `AcpStartError`                             | Grok binary could not start                  | Stop. Wait for change                                    | `error`: Grok could not start |
| `WebSocketProtocolClose` (1002–1009)        | Protocol fault: bug or version skew          | Restart after 30 s, log warn                             | `reconnecting`                |
| `WebSocketHandlerError`, `JsonRpcSendError` | Host bug while handling a frame              | Restart next poll, log error                             | `reconnecting`                |
| Handshake 5xx, 429, 408, close 1006         | Network or relay outage                      | Never reaches the daemon: PartySocket retries            | `reconnecting`                |

"Stop" means: no retry until `remote-control.json` or the credential changes, which is what `/remote-control` and re-pairing write. A new Grok session starts a new daemon, so every session retries once.

**State file.** `rc-state.json` gains one variant: `{ status: 'error', pid, failure }` where `failure` is `{ type: 'unauthorized', http }`, `{ type: 'refused', http }`, or `{ type: 'agent-start' }`. A dead `pid` reads as `off`, same as `on`. Text is derived by each reader from `type`; the file carries no prose.

**Readers.** The status line is the only channel the person sees in Grok, so it carries the reason and the fix, red, by matching `failure.type`: `/rc error · pairing revoked · /remote-control to pair again`, `/rc error · Grok could not start · fix Grok, then /remote-control`, `/rc error · Porte refused (HTTP n) · update Porte`. `/remote-control status` prints the same line. `/remote-control` (toggle) on an `error` state answers at once instead of waiting 5 s for `on`; on `unauthorized` it clears the dead credential and starts pairing, because that is the only fix and the only command the person knows.

**Where the code goes.** One pure `classifyHostFailure(cause)` in `entrypoints/mcp/`, matched by `instanceof` on the typed errors, never on message text. `tryConnect` calls it, writes the state, and logs once. `porte up` is unchanged.

**Proof.** Daemon integration test: a runtime that rejects with 403 writes `error`, is not recreated across three polls, and is recreated after the settings read changes. A runtime that rejects with a handler error is recreated on the next poll. `status()` and `toggle()` unit tests for the `error` state.

## 5. Three states on the status line

**Change.** The daemon writes `reconnecting` on each reconnecting status and `on` on each connect, through the existing ordered write queue. `statusline.sh` prints yellow `/rc reconnecting`, red `/rc error · <reason> · run /remote-control`, green `/rc on`, grey `/rc off`. `/remote-control status` reports the same states.

**Why.** `rc-state.json` is written `on` at first connect and `off` at exit only. A Host that has been retrying for a minute still shows green, so the person sends prompts from the phone into a link that is down.

## Proof

Host unit tests for the `seq` reset, retry delays, pong deadline, and daemon state writes. Web integration reconnect tests pass without the manual `seq = 0`. Manual: Wi‑Fi off and on, laptop sleep for 2 minutes, revoke the pairing from the browser.

## Later, not now

Attach failures answer with the real error instead of `HostOfflineError`. Open the control socket before Grok spawns, so the first connect is one handshake.
