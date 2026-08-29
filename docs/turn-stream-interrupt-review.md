# Turn, stream, interrupt: first-principles review

Scope: send a message → see the stream → reload → see the stream; interrupt a turn. Chain: browser → `ConversationAgent` → Host. Written from the code on 2026-08-28, not from the older docs.

## TL;DR (after reading and spikes, 2026-08-28)

The chain works on the happy path: send → stream → reload mid-stream → the stream resumes; Stop cancels on the Mac. Five things break it, all confirmed with real Grok (§10):

1. **Deltas arrive out of order (F11).** The Agents SDK forwards sub-agent WebSocket frames after an `await`, so ~1% of frames swap with a neighbour. Every answer reads "7 seven6 six". Fix: `seq` on `conversation.event`, in-order apply on the relay, upstream report.
2. **One answer, three ids (F1).** Live `turnId`, snapshot `turnId:reasoning:1`, post-restart `…:turn:N:reasoning:1`. Fix: `turnId` on `ConversationItem`; assistant `id = turnId` in both paths.
3. **Two writers, no rule (F2).** The `onStart` snapshot fires on every wake and rewrites rows mid-turn. Fix: stream writes the running turn; snapshot writes finished turns; Host wins after `turn.finished`.
4. **Stop is an abort, then the relay breaks (F3, F6, F13).** `chatRecovery` re-sends `turn.start` 8 s after Stop, and after that wake every Host request fails as "offline" while the Mac keeps answering. Fix: Stop = `cancelTurn` command, `chatRecovery = false`, root-cause the post-wake `HostOfflineError`.
5. **The user's own message vanishes until a snapshot (F12).** Cause not yet isolated; resolve in the chunk 2 integration test.

Plan: five chunks (§6), each ships alone. Chunk 1 now also carries the `seq` fix because nothing else is verifiable while text is scrambled.

## 1. The facts

| Party               | Owns                                                                 | Lifetime                        |
| ------------------- | -------------------------------------------------------------------- | ------------------------------- |
| Host + Grok         | The turn. The transcript. Pending permissions.                       | Until the Mac stops             |
| `ConversationAgent` | A projection: `ConversationRelayState` + AIChat rows + stream buffer | Evictable at any time           |
| Browser             | A view of the projection                                             | One tab, one socket, reconnects |

A turn lives on the Host. It outlives a browser tab, a DO isolate, and a Host socket blip. Nothing on the relay or in the browser can be the truth about whether a turn runs.

`AIChatAgent` models a turn as one request-scoped LLM call: start a stream, read it, persist the assistant message, done. Abort means "cancel the reader". Recovery means "call the LLM again with `continuation: true`". None of that matches a remote turn that keeps running.

## 2. Principles

1. **One owner per fact.** Turn state and transcript: Host. The relay stores a projection. It never becomes a second truth.
2. **The stream is a view of events, not a lifecycle.** The AIChat request must not decide whether a turn runs.
3. **Stable ids.** The same message has the same id whether it arrived live or by snapshot.
4. **One writer at a time.** During a turn only the stream writes that turn's message. The snapshot writes finished turns. After a turn ends, the Host snapshot wins.
5. **Interrupt is a command, not an abort.** Stop = `turn.cancel` to the Host. The stream ends when the Host sends `turn.finished`.
6. **Recovery is snapshot + subscribe.** Never replay transport.

## 3. The chain as built

### Send → stream

1. Browser `chat.sendMessage` → WS `chat-request` with the **whole** message array (`conversation-chat.tsx:49`).
2. `AIChatAgent` persists that array with `_deleteStaleRows: true`, then calls `onChatMessage` (`ai-chat/dist/index.js:277`).
3. `onChatMessage` mints `turnId`, opens a `TransformStream`, sends `turn.start`, returns the readable (`conversation-agent.ts:185-218`).
4. Host `StartTurn`: `beginTurn` raises `turn.started` + user `message.*`; outbox drains **before** the JSON-RPC result is written, so events precede the result (`message-bus.ts:60`, `start-turn.ts`). Prompt runs in background; `FinishTurn` ends it.
5. Each `conversation.event` → `acceptEvent`: reduce relay state, publish activity, project to chunks if `turnId` matches, write to the stream (`conversation-agent.ts:289-310`).
6. `_reply` reads chunks, stores them in the resumable buffer, broadcasts to every viewer, and persists the assistant message at `finish` with `id = turnId` (from the `start` chunk).

### Reload

1. Loader reads `/get-messages` over HTTP (`conversation-queries.ts:39`). `useAgentChat` gets them as initial messages.
2. Socket reconnects. `AIChatAgent.onConnect`: active stream → `cf_agent_stream_resuming` → client acks → server replays buffered chunks. `isServerStreaming` becomes true.
3. Viewer connect also triggers `requestHostAttachInBackground` → `conversation.attach` (no-op if the Host socket exists).

### Interrupt

1. `chat.stop()` → `chat-request-cancel` → `_abortRegistry.cancel` → our abort listener: drop `activeStream`, close the writer, `turn.cancel` in background (`conversation-agent.ts:209-215`).
2. `_reply` breaks its loop, persists the partial, reports `aborted`. Client status → `ready`.
3. Host: `cancelTurn` resolves pending permissions, sends ACP `session/cancel`. Turn stays `running` until Grok answers `cancelled` → `FinishTurn` → `turn.finished`.
4. Every event between the abort and `turn.finished` is dropped on the relay (`activeStream` is gone). `runningTurnId` clears only at `turn.finished`.

### Snapshot

`conversation.get` runs on `onStart` (every DO wake) and on every Host socket `onConnect`. It rewrites relay state and **all** AIChat rows with `_deleteStaleRows: true` (`conversation-agent.ts:273-281`).

## 4. Findings

Ranked by user impact. Each line states the consequence.

### F1. Two ids for one assistant message

- Live: `{ type: 'start', messageId: event.turnId }` (`conversation-event-projector.ts:47`).
- Snapshot: `itemId(items[0])` = `${turnId}:assistant:0`, a reasoning id, or a `toolCallId` (`conversation-state-messages.ts:48,102`).

Consequence: after any snapshot the transcript holds two copies of the last answer, or the answer flips id and React remounts it. `_deleteStaleRows` cannot remove the live row because the snapshot's ids are unknown to the server, so both stay.

### F2. Snapshot rewrites rows while a turn streams

`applySnapshot` runs on every Host reconnect and every DO wake with no check on `activeStream`. `_reply` holds its own in-memory message and persists it at the end, on top of whatever the snapshot wrote.

Consequence: a Host socket blip mid-turn produces a duplicate partial. A DO wake mid-idle costs a full transcript fetch and rewrite for nothing.

### F3. Stop does not wait for the Host

The relay sends `turn.cancel` and forgets it. The UI goes to `ready` at once. `runningTurnId` stays set until Grok acknowledges. `canSubmit` ignores `runningTurnId` (`conversation-chat.tsx:52`).

Consequence: send right after Stop → `turn.start` → `ConversationBusyError` → the user sees "A turn is already running." Grok's last words after cancel never reach the relay projection, so the AIChat partial is shorter than the Host transcript.

### F4. `turn.cancel` is not idempotent on the Host

`Conversation.cancelTurn` calls `requireTurn`, which throws `TurnNotFoundError` when the turn already ended (`conversation.ts:206-209,266-268`). `relay-communication.md:553` says close and cancel are idempotent.

Consequence: Stop that races the natural end logs `turn_cancel_failed` at error level for a non-fault.

### F5. No bound on cancel

After `session/cancel` the Host waits up to `PROMPT_TIMEOUT_MS` (30 min) for Grok to settle (`acp-coding-agent.ts:48`).

Consequence: a hung agent leaves the conversation `running` for 30 minutes; the user cannot send.

### F6. Recovery after DO eviction is the wrong tool

`chatRecovery = true` makes `AIChatAgent` schedule `continueLastTurn` → `onChatMessage({ continuation: true })`. Our code then **re-sends `turn.start`** with the user message (`conversation-agent.ts:216,317`). Idempotent on the Host, but wrong in intent. Events that arrived while the DO was down are gone; `onStart`'s snapshot and the recovery continuation race for the same rows.

Consequence: recovery sometimes works, sometimes duplicates, and nobody can reason about it.

### F7. Host socket close mid-turn leaves the stream open forever

`onClose` clears the JSON-RPC peer but not `activeStream` (`conversation-agent.ts:165-169`). `chatStreamStallTimeoutMs` is `0` (off).

Consequence: if the Mac goes away mid-turn the browser shows a spinner with no end. If the Mac returns, the Host sends new events; the relay projects them into the old stream, but the gap is lost.

### F14. Every event rewrites and broadcasts a 98 KB state

`acceptEvent` calls `setState` for every event, deltas included. `reduceConversationRelayState` clones the state even when nothing changes, and the SDK's `setState` has no equality check: it writes SQLite and broadcasts the whole state to every viewer on each call (`agents/dist/index.js:1096`). The state is 98 KB, of which `commands` is 99.5 KB (229 Grok commands) (`cf_agents_state` in the facet).

Consequence: one 750-delta turn writes and sends about 74 MB per viewer. On mobile that is the whole experience.

### F8. Ids flip after a Host restart (accepted for now)

Grok stores no ids. After `session/load` the Host derives `turnId = ${conversationId}:turn:${promptIndex}` and `${turnId}:user`. Live turns use the relay's uuidv7 `turnId` and the browser's message id.

Consequence: the first snapshot after a Host restart rewrites every id once. With F1 fixed this is one full rewrite, then stable. Out of scope here.

### F9. The browser's whole message array is the write on send

`syncMessagesToServer` sends every message; the server persists them with `_deleteStaleRows` (SDK default). A stale tab overwrites the server's rows.

Consequence: low today because the snapshot reconciles later. Keep as-is; revisit when a turn-scoped write exists.

## 5. Target design

### 5.1 Identity

Rule: every id is derived from a fact Grok stores, or it is a relay-only key that never leaves the relay. Nothing is minted twice.

| Id               | Source                                                                                                                                             | Minted by                                                                             | Stable across Host restart |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | -------------------------- |
| `conversationId` | Grok `sessionId`                                                                                                                                   | Grok                                                                                  | yes                        |
| `turnId`         | `${conversationId}:turn:${promptIndex}`; `promptIndex` is Grok's per-prompt counter (`_meta.promptIndex` on `user_message_chunk`, live and replay) | Host                                                                                  | yes                        |
| `messageId`      | `${turnId}:assistant                                                                                                                               | reasoning:${n}`, `n`= stream ordinal from`AcpUpdateMapper`, same code live and replay | Host                       | yes |
| `toolCallId`     | Grok                                                                                                                                               | Grok                                                                                  | yes                        |
| user `messageId` | `${turnId}:user` on the Host; the relay row keeps the browser id and records `metadata.turnId`                                                     | Host / browser                                                                        | yes via `metadata.turnId`  |
| `attemptId`      | uuidv7 the relay sends in `turn.start`; idempotency key and correlation until `turn.started { attemptId, turnId }` arrives                         | relay                                                                                 | not needed                 |

Today the relay mints `turnId` (uuidv7) and the Host derives another one on replay, which is F8. Change: the Host predicts `promptIndex` as the count of user messages in its transcript, mints the `turnId` at `beginTurn`, and checks the prediction against Grok's `_meta.promptIndex` on the first chunk. A mismatch is an invariant error and logs once. The relay's `turn.start` carries `attemptId`; `turn.started` carries both, and the relay binds its stream to the `turnId` then.

`ConversationItem` gains `turnId`. The snapshot groups items by it: assistant `UIMessage.id = turnId`; user row id = the existing row with `metadata.turnId === turnId`, else `${turnId}:user`. Live and snapshot then agree on every id, and the fixtures prove it: `session-prompt-live.json` and `session-load-replay.json` are the same Grok session, so one test asserts equal ids from both paths.

### 5.2 Writers

| Moment                         | Writer   | Rows touched                         |
| ------------------------------ | -------- | ------------------------------------ |
| Turn streaming                 | `_reply` | the running turn's assistant message |
| Host socket `onConnect`        | snapshot | every turn except one with a stream  |
| Turn ended (`onChatResponse`)  | snapshot | every turn                           |
| `turn.finished` with no stream | snapshot | every turn                           |
| DO `onStart`                   | nothing  | —                                    |

"Snapshot" = `conversation.get` → `conversationStateToMessages` → `persistMessages(..., { _deleteStaleRows: true })`. Stable ids make it idempotent; `_persistedMessageCache` skips unchanged rows.

`_deleteStaleRows` deletes every row absent from the supplied set once all supplied ids exist (`ai-chat/dist/index.js:2904`). So "skip the streaming turn" means: re-supply that turn's current rows from `this.messages` unchanged, never omit them (codex review, item 2).

The terminal reconcile is the one rule that heals every gap: abort, Host blip, DO eviction. The cost is one `conversation.get` per turn. A turn-scoped Host query can replace it later.

### 5.3 Interrupt

Stop in the UI calls `agent.call('cancelTurn', { turnId: state.runningTurnId })`. It does **not** call `chat.stop()`.

- The stream stays open. `chat.status` stays `streaming`. Send stays disabled.
- The Host resolves pending interactions, sends `session/cancel`, and finishes the turn as `cancelled` when Grok settles or when a cancel deadline passes (F5).
- `turn.finished` → projector emits `finish` → `_reply` completes → `onChatResponse` → snapshot.
- The UI shows "Stopping…" from a local flag until `runningTurnId` clears.

The `abortSignal` listener in `onChatMessage` stays for SDK-internal aborts (`clear`, `destroy`) only.

`Conversation.cancelTurn` becomes a no-op when the turn is not running or has another id.

### 5.4 Send while a turn runs

`canSubmit` also requires `state.runningTurnId === undefined`. A second tab cannot start a turn the Host will reject. Queueing is a later feature, not a relay concern.

### 5.5 Recovery

What the SDK does today. Every chat turn runs inside a durable fiber. When the DO restarts and finds a fiber that did not finish, `chatRecovery` rebuilds a partial assistant message from the buffered chunks, persists it, and schedules `_chatRecoveryContinue`. That calls `continueLastTurn()`, which is the SDK's "ask the model again and append to the last assistant message": it runs `onChatMessage({ continuation: true })`, clones the last assistant message, and appends whatever the new stream produces. It retries up to 10 times inside a 5 minute no-progress budget. It also fires after our Stop (spike 3), because the abort leaves the fiber unfinished.

Why it is wrong here. The model call is not ours. The Mac runs the turn and keeps running it whether the relay is up or not. "Ask again" becomes a second `turn.start`, which the Host rejects or ignores, and the retry budget adds noise for two minutes.

What we do instead. `chatRecovery = false`. `runningTurnId` is durable relay state, so a restarted DO knows a turn may still run. On `onStart` it attaches the hibernated Host socket and does nothing else. Events keep arriving and update the small relay state; the browser shows "working" from `runningTurnId`, not from `isServerStreaming`. When `turn.finished` arrives, the terminal reconcile (5.2) pulls the finished turn from the Host and writes it under its stable ids. Viewers see the answer land whole. Live text after an eviction is lost until then; evictions are rare and this path has zero SDK coupling.

Optional upgrade, not planned: call `continueLastTurn()` on `onStart` when `runningTurnId` is set, with `onChatMessage({ continuation: true })` opening a stream bound to that turn and sending no `turn.start`. The SDK would append new chunks to the assistant row `id = turnId`. Take it only if live text after eviction is worth the coupling.

An orphaned stream buffer from before the eviction must not outlive the restart: on the next client resume ack the SDK would persist its partial and `reconcileOrphanPartial` appends those parts to the row with the same id (`agents/dist/chat/index.js:1983`), which after a reconcile is the complete Host answer (codex review, item 8). So `onStart` clears the buffer when `runningTurnId` is set and the SDK reports an active stream (`this._resumableStream.clearAll()`, an internal field; one touch, covered by the chunk 4 test). A client that acks then receives `done`, and the reconcile delivers the answer.

### 5.7 Wire order

WebSocket preserves order; the relay's sub-agent bridge does not (F11). The Host numbers every notification per connection (`seq`, from 1). `HostJsonRpcSocket` applies `seq` in order and parks early frames. Requests and responses keep their JSON-RPC ids and need no `seq`.

The expected `seq` is durable: the relay stores `{ connectionId, lastSeq }` in DO storage after each applied frame, because a DO wake builds a new `HostJsonRpcSocket` while the Host connection and its counter continue (codex review, item 1). A newly admitted Host connection resets the record to 0. The snapshot that follows a reconnect repairs any gap.

### 5.8 State budget: store the minimum, derive the rest

| Owner          | Keeps                                                                                  | Derived, not stored                                                          |
| -------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Host, memory   | One `Conversation` per open conversation: transcript, turn state, pending interactions | Nothing; Grok is the record and `session/load` rebuilds it                   |
| Host, mapper   | Open stream ids and the live turn                                                      | Tool views (move to the aggregate; today both hold them)                     |
| Relay, durable | AIChat rows (projection of the transcript), SDK stream buffer, `ConversationLiveState` | `hasAssistantMessage`, the parent's `activeConversations` (projection, fine) |
| Relay, memory  | `activeStream`, pending requests, `seq` buffer                                         | —                                                                            |
| Browser        | `useAgentChat` messages, `ConversationLiveState`, commands query                       | The loader's messages query after first paint                                |

`ConversationLiveState` (rename of `ConversationRelayState`) drops `commands`: 99.5 KB that a menu reads once. A `listCommands` callable serves it through a TanStack query. The reducer returns the same object when an event changes nothing, and `setState` runs only on a new object. Per turn that is a handful of writes instead of 750 × 98 KB (F14).

### 5.9 Bounds and limits

| Store                         | Bound                                                                                                                     | Cleanup                                                                                             |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Relay AIChat rows             | The transcript; the SDK caps a row at 1.8 MB                                                                              | Rows follow the Host; a removed conversation deletes the facet                                      |
| Relay stream buffer           | One turn                                                                                                                  | SDK alarm (`STREAM_CLEANUP_DELAY_SECONDS`)                                                          |
| Relay `ConversationLiveState` | Under 2 KB after 5.8                                                                                                      | Replaced on each change                                                                             |
| Relay `seq` buffer            | 256 frames; overflow closes the socket with 1008 and the reconnect snapshot repairs                                       | Cleared on close                                                                                    |
| Relay pending requests        | 60 s timeout each                                                                                                         | Rejected on timeout or socket close                                                                 |
| Host open conversations       | Idle eviction: close the session after N minutes with no running turn (was out of scope; now chunk 1)                     | `CloseConversation`; a viewer re-attaches on demand                                                 |
| Wire frame                    | 1 MB Cloudflare WebSocket message limit; a 78-turn snapshot is 500 KB, so a full `conversation.get` breaks near 150 turns | Turn-scoped `turn.get { turnId }` for the reconcile; `conversation.get` pages by turn for bootstrap |

### 5.6 Host socket close mid-turn

Keep `activeStream`. The turn is still running on the Mac. When the Host reconnects, `onConnect` snapshot skips the streaming turn (5.2) and the stream continues. If the Host never returns, the AIChat stream stays open; add a relay-side deadline later if it matters in practice.

## 6. Implementation order

No backward compatibility. Old paths are deleted before their replacements exist; intermediate commits may not build. Order is bottom-up so the type checker drives every downstream change: core contracts, then Host, then relay, then browser. Each step ends with its own tests green; the whole chain is green again at step 5.

### Step 0 — delete first

Relay `conversation-agent.ts`: remove `chatRecovery = true`, the `continuation` branch, the abort → `cancelTurn` listener, the `onStart` snapshot, `hasAssistantMessage`, `createTurnId`, and the `SPIKE_*` traces. Host: remove the `SPIKE_EVENT` trace. Core: delete `ConversationRelayState`, `INITIAL_CONVERSATION_RELAY_STATE`, `reduceConversationRelayState`, `conversationRelayStateFromState` (replaced in step 1). Spike test files stay until step 5.

### Step 1 — core contracts (`packages/core`)

1. `AttemptIdSchema` (uuidv7 brand) in `identity.ts`. `turnId` keeps its schema; the only mint is `turnIdFor(conversationId, promptIndex)` (today `replayTurnId` on the Host; move it to core so both sides share it).
2. `ConversationItem` gains `turnId` on every variant.
3. Host conversation methods: `turn.start { attemptId, userMessage }` → `null`; `turn.started { turnId, attemptId }`; `turn.get { turnId }` → `{ turnId, items, tools }`; `conversation.get` unchanged for bootstrap.
4. Every notification's params gain `seq` (`conversation.event`, `conversation.updated`, `conversation.removed`). One `sequencedParams(schema)` helper in `websocket/json-rpc.ts`.
5. `ConversationLiveState` in `relay/conversation-live-state.ts`: `{ runningTurnId?, pending, plans, usage?, configuration?, modeId? }`; `reduceLiveState(state, event)` returns the same reference when nothing changes; `liveStateFromConversation(state)`.
6. Errors: `TurnNotFoundError` stays; add `AgentUnresponsiveError` for the cancel deadline.

Proof: core unit tests for the reducer identity rule and `turnIdFor`.

### Step 2 — Host (`apps/host`)

1. `Conversation.beginTurn(attemptId, userMessage)`: mints `turnId = turnIdFor(id, count of user items)`, raises `turn.started { turnId, attemptId }` and the user message as `${turnId}:user`; keeps `attemptId` on the turn record; a repeated `attemptId` (running or the last finished turn) is a no-op.
2. Mapper: `beginTurn(turnId, expectedPromptIndex)`; on the first live `user_message_chunk` compare `_meta.promptIndex`; mismatch raises an invariant error once. Tool views come from a `findTool` lookup into the aggregate; the mapper keeps only open streams and the live turn.
3. View reducer stamps `turnId` on items.
4. `cancelTurn`: no-op when not running that turn; the handler releases parked ACP requests before `session/cancel`; deadline via `background` timer → `closeSession` + `FinishTurn { cancelled }`; late `ApplyAgentUpdate` for a turn that is not running is dropped at debug.
5. `StartTurn` loads the session when it is not open (after a deadline close or idle eviction).
6. Idle eviction: `CloseConversation` after N minutes with no running turn; timer per open conversation, reset on every turn.
7. `websocket-notifications.ts` numbers frames per connection (`seq`).
8. `GetTurn` query handler.

Proof: `conversation-flow.test.ts` (attempt dedupe, cancel idempotent, deadline, eviction); `acp-porte-replay.test.ts` (`turnId` on items); new test: `session-prompt-live.json` and `session-load-replay.json` give equal ids; `host-websocket-connection.test.ts` (seq increments, release-before-cancel order).

### Step 3 — relay (`apps/web/src/server` + `lib/conversation`)

1. `HostJsonRpcSocket`: applies notifications in `seq` order with a bounded buffer (256); `lastSeq` persisted through injected `{ load, save }` (DO storage keyed by connection id); reset on admit. `HostOfflineError` only when the frame never left; unknown response ids log at debug.
2. `ConversationAgent` rewrite: `onChatMessage` sends `turn.start { attemptId }` and holds the stream unbound; `turn.started { attemptId }` binds it to `turnId` and stamps `metadata.turnId` on the user row; `acceptEvent` reduces live state and calls `setState` only on a new reference; `conversation.commands.updated` goes to `ctx.storage` and `listCommands` serves it; terminal event closes the writer; `onChatResponse` and a terminal event with no stream run the `turn.get` reconcile; `onConnect(host)` runs the snapshot, re-supplying the running turn's rows; `onStart` attaches and clears an orphaned stream buffer; `chatRecovery = false`.
3. `conversation-state-messages.ts`: group by `turnId`; assistant `id = turnId`; user row reuses the existing row with `metadata.turnId`, else `${turnId}:user`; one `turnToMessages` shared by snapshot and reconcile.
4. Projector: skip user-role messages by the role seen on `message.started`; drop the stored-ids seed.

Proof: unit (`conversation-state-messages`, projector, socket 1,3,2 → 1,2,3); integration on the facet with `runInDurableObject`: F12 (user row present after the turn), F13 (hibernate between two requests), snapshot during a stream leaves one assistant row, restart mid-turn then `turn.finished` leaves one row with the full answer.

### Step 4 — browser (`apps/web/src/features`, `pages`)

1. `ConversationLiveState` replaces `ConversationRelayState` in hooks and components.
2. Stop → `agent.stub.cancelTurn({ turnId })`; local "Stopping…" until `runningTurnId` clears; `canSubmit` = Host connected ∧ `agent.identified` ∧ `runningTurnId === undefined`.
3. Commands: `useQuery` on `agent.stub.listCommands()`, fetched when the menu opens.
4. Storybook: composer stories for ready, streaming, stopping, offline.

Proof: Playwright flow: send → stream → reload mid-stream → resume; stop → `turn.finished` → ready; second send succeeds; the 250-count prompt on real Grok reads in order.

### Step 5 — docs and cleanup

Rewrite the changed sections of `relay-communication.md` (`conversation.get`/`turn.get`, `seq`, `attemptId`, interrupt flow, id rules, writer table). Delete the spike tests. Delete this file's §3 and §10 once the flows are covered by tests.

## 7. Open questions

1. Chunk 1.4 deadline value. Proposal: 15 s.
2. Chunk 2.4 cost: one `conversation.get` per turn. Accept now, or add `turn.get { turnId }` to the Host registry first?

## 8. Decisions from discussion (2026-08-28)

- Keep `ConversationEvent`, `AcpUpdateMapper`, and the DO projector. The union is the Porte-owned wire; it survives AI SDK version skew between the Host CLI and the web, and it carries product facts (permissions, plans, usage) that `UIMessageChunk` has no home for.
- The compat target is the AI SDK **UI message stream**, not a `LanguageModel` provider. `AIChatAgent.onChatMessage` takes a `Response` of `UIMessageChunk`; that is the SDK seam.
- Borrow first: Agents SDK + AI SDK + proven ACP clients (Zed `agent_ui`, `@agentclientprotocol/sdk` examples, Cloudflare `agents` examples).
- Removal candidates: `chatRecovery`, the `onStart` snapshot, the abort → cancel path, `hasAssistantMessage`.
- This file is the only document. Reading and spikes write back here as plan edits.

## 8b. Codex review (2026-08-28)

One read-only `codex exec` pass over this file and the source, P0 only. Nine items, all verified against the cited lines and all accepted; the plan text above carries each fix with a "(codex review, item N)" marker. Items: (1) `seq` must survive a DO wake; (2) `_deleteStaleRows` deletes omitted rows; (3) a cancel deadline leaves the mapper live; (4) parked ACP requests released after `session/cancel`; (5) `attemptId` needs a claim beyond the running turn; (6) idle eviction cannot count viewers; (7) `continueLastTurn` skips without an assistant row; (8) orphan finalize appends to the reconciled row; (9) AI SDK 7 has an `abort` chunk. Sections with no P0: §1–§4, §8, §10.

## 9. Reading

Done before spike 1. Each item ends with one line here: what we take.

| #   | Source                                                                            | Question it answers                                                | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| --- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Agents SDK docs: AIChatAgent, resumable streams, sub-agents, hibernation          | What the SDK owns; what `onStart`/`onConnect` do after a wake      | `onStart` runs on every DO start, wake included (`agents/dist/index.js:1005-1060`); it rehydrates sub-agent sockets from the root first, so the Host socket reattach in `onStart` is correct. In-memory fields, timers, and promises die on a wake; `this.state` and `connection.state` survive. `keepAlive` on a facet borrows the root's alarm.                                                                                                                                                                                                     |
| 2   | `@cloudflare/ai-chat/dist/index.js`, `agents/dist/chat/*.js`                      | Real contract: `_reply`, resume handshake, `onChatResponse`, abort | `_reply` runs inside `keepAliveWhile`, so no hibernation mid-stream. Abort = `reader.cancel()` + persist partial + status `aborted`. `chatRecovery: true` = enabled with defaults (10 attempts, 5 min no-progress); it wraps the turn in a fiber and on wake calls `onChatRecovery` → `continueLastTurn` → `onChatMessage({ continuation: true })`. `onChatResponse` fires after the assistant row is persisted and the turn lock is released. `persistMessages` reconciles by id and skips unchanged rows. `chatStreamStallTimeoutMs` defaults to 0. |
| 3   | AI SDK UI message stream protocol, `readUIMessageStream`, `createUIMessageStream` | Chunk order rules; `start.messageId`; `finish`; `error`            | One message per stream: `start(messageId)` … `finish`. `start.messageId` becomes `UIMessage.id`. `error` chunks mark the stream failed. AI SDK 7 also defines an `abort` chunk (`ai/dist/index.d.ts:2420`); we do not emit it, because Stop is a Host command and the stream ends with `finish` on `turn.finished`.                                                                                                                                                                                                                                   |
| 4   | AI SDK data parts (transient), dynamic tools, tool approval                       | Where permissions and plans could live                             | `data-*` parts with `transient: true` reach the client via `onData` and are never persisted; with an `id` they reconcile in place. `tool-approval-request` exists but drives the SDK's own approval loop (`_scheduleAutoContinuation`), which we do not want. Plans and permissions stay in relay state (spike 4 confirms).                                                                                                                                                                                                                           |
| 5   | ACP `session/update`, `session/cancel`, `session/load`                            | What cancel guarantees; what replay omits                          | After `session/cancel` the agent MAY still send updates, then answers the prompt with `cancelled`. The client MUST answer pending permissions with `cancelled`. So post-cancel content is real transcript and must reach the relay: Stop must not close the stream early.                                                                                                                                                                                                                                                                             |

## 10. Spikes

Real Grok, real mapper, real streams. Each spike ends with an edit to §5 and §6, and one line here.

| #   | Spike                | Proof                                                                                                                 | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --- | -------------------- | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Mapper + ids         | Fixtures → events → projector → `readUIMessageStream`. Live and snapshot give identical `UIMessage[]` and ids.        | Done. Spike files: `apps/host/tests/unit/spike-dump.test.ts` (fixtures → mapper → aggregate → JSON), `apps/web/tests/unit/spike-ids.test.ts` (JSON → live projector vs `conversationStateToMessages`). **Parts are identical in both paths** (`step-start,reasoning,text,dynamic-tool,…`), so the projector is sound. **Only the id differs**: live `0199-live-turn` (the `turnId`), snapshot `0199-live-turn:reasoning:1` (first item's id). The user message keeps the browser id in both paths. Replay ids are `${conversationId}:turn:N:…`, so `turnId` contains colons; deriving it from a message id by splitting is fragile. Decision: `ConversationItem` carries `turnId`; the snapshot groups by it and uses it as the assistant `UIMessage.id`. Chunk 1.1 and 2.1 confirmed as specified.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 2   | Transport + reload   | Send with real Grok; reload mid-turn resumes; second tab observes; hibernation wake keeps the stream.                 | Done with real Grok on `tunnel.useporte.dev` (traces: `SPIKE_EVENT` in `websocket-notifications.ts`, `SPIKE_CHAT`/`SPIKE_RELAY` in `conversation-agent.ts`; remove before chunk 1). **Works**: send → stream → reload mid-turn → the stream resumes and completes on the reloaded page; hibernation wake reattaches the Host socket. **F11, new, top severity: deltas arrive out of order.** The Host sends 752 deltas in order; the relay's `acceptEvent` sees 5 neighbour swaps (`"7" " seven" "6" " six"`), so the stored text reads "7 seven6 six eight8". Cause: `agents/dist/index.js:3861` `_cf_forwardSubAgentWebSocketMessage` awaits `_cf_resolveSubAgentConnection` before the facet RPC, so two frames in flight can cross. Every sub-agent socket has this; the Host stream is the only one dense enough to show it. Fix: `seq` on `conversation.event` params and an in-order apply in `HostJsonRpcSocket`; report upstream. **F1 confirmed on disk**: after one turn the store held `turnId`, `turnId:reasoning:1`, and after a Host restart `…:turn:N:reasoning:1` for the same answer. **F2 confirmed**: the `onStart` snapshot fires on every wake (rows stamped at each reload). **F12, new: the user's own message is not rendered during or after its turn** until a snapshot rewrites the store; the row exists at `onChatMessage` time (trace) but the loader read after the turn lacks it, and its `created_at` matches the later snapshot. Resolve inside an integration test in chunk 2 (read `this.messages` directly). Side findings, out of scope: the "New conversation" button has no handler (`project-list.tsx:87`); two `porte up` processes for one host replace each other's socket in a loop; `canSubmit` reads the non-reactive `agent.readyState`. |
| 3   | Interrupt + recovery | Stop = `cancelTurn` callable; stream ends at `finish`; second send works. Kill the DO mid-turn; `onStart` reattaches. | Done on the current code (Stop = SDK abort), to measure the baseline. Stop itself works: the UI returns to `ready` at once, the partial persists, the Host cancels and sends `turn.finished`. Then three failures in the next 30 s. **F6 confirmed**: 8 s after Stop the DO woke on the Host's `turn.finished`, `chatRecovery` ran `continueLastTurn` → `onChatMessage({ continuation: true })` → a second `turn.start`. **F13, new: after that wake every `hostSocket.request` fails with `HostOfflineError` from `host-json-rpc-socket.ts:159`; in one of three cases the frame still reached the Host, and Host responses kept arriving as `host_response_unmatched` (16 in two minutes).** The next send therefore showed "The Mac host is offline" while the Host ran the turn and answered PING; the answer never reached the store because `activeStream` had already closed with the error. Cause is inside the facet bridge after a wake (`agents/dist/index.js:3949` `send` calls an RPC stub and ignores its promise); root-cause it in chunk 3 with an integration test that hibernates the facet between two requests. **F3 not reproducible as `ConversationBusyError`** because F13 masks it; the design change stands on the protocol reading (ACP keeps streaming after cancel). Decisions: `chatRecovery = false` (5.5) confirmed; Stop as a command (5.3) confirmed; add "no `HostOfflineError` from a send that left the process" to chunk 3.                                                                                                                                                                                                                                                                                                                         |
| 4   | Permissions          | Transient `data-*` parts vs relay state vs `tool-approval-request`. One choice.                                       | Blocked live by F13 (two attempts at a shell command both died in `turn.start`). Decided from reading §9.4 and the existing code: permissions stay in `ConversationRelayState.pending`, rendered by `ConversationPermissions` and answered through the `answerPermission` callable. `tool-approval-request` would pull the SDK's own continuation loop; transient data parts would add a second channel for one fact. No change to the plan. Re-run live after chunk 3.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 5   | Snapshot cost        | `conversation.get` → rows on the 78-turn fixture: size and time. Decide chunk 2.4.                                    | Measured: the 5-turn replay state is 33 KB and converts in 32 ms; one live turn is 6 KB; 12 stored rows hold 19 KB. A 78-turn conversation lands near 500 KB and 0.5 s per snapshot. One snapshot per turn end is acceptable now; the wire cost, not the CPU, is what will hurt on mobile. Keep §7.2 open: add `turn.get { turnId }` when chunk 2 lands, if the Host side is one handler.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
