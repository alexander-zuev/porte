# Relay Communication

The code is the contract. This page holds only the rules the code cannot show on one screen.

## Where the contract lives

| Fact                                              | Source                                                                                                      |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Control methods (Host ⇄ `HostRelayAgent`)         | `packages/core/src/relay/host-control-methods.ts`                                                           |
| Conversation methods (Host ⇄ `ConversationAgent`) | `packages/core/src/relay/host-conversation-methods.ts`                                                      |
| Envelope, `seq`, request ids                      | `packages/core/src/relay/host-json-rpc.ts`, `packages/core/src/websocket/json-rpc.ts`                       |
| Conversation events                               | `packages/core/src/conversation/conversation-event.ts`                                                      |
| Live state beside the transcript                  | `packages/core/src/relay/conversation-live-state.ts`                                                        |
| Ids                                               | `packages/core/src/identity/identity.ts`                                                                    |
| Relay behavior                                    | `apps/web/src/server/infrastructure/durable-objects/conversation-agent.ts`                                  |
| Host turn policy                                  | `apps/host/src/application/turn-policy.ts`, `handlers/cancel-turn.ts`, `handlers/expire-cancel.ts`          |
| Proof                                             | `apps/web/tests/integration/conversation-agent.test.ts`, `apps/web/tests/unit/host-json-rpc-socket.test.ts` |

## Shape

```text
Host daemon                                  Browser
├─ control socket ─┐                         ├─ control socket ─┐
└─ one socket per  │                         └─ one chat socket │
   conversation    ▼                                            ▼
              HostRelayAgent(hostId) ▸ ConversationAgent(conversationId)  (sub-agent)
```

JSON-RPC 2.0, one document per text frame, no batches. Porte owns method names and payloads; the registries above are the only source of both. Every Host notification carries `seq`.

## Rules

1. **Grok owns the turns; the Host owns the transcript the relay sees.** Every `turn.started` and `turn.finished` comes from Grok's stream, whoever typed the prompt (see `leader-sessions.md`). The relay's rows are a projection; when they disagree, the Host wins.
2. **One writer per turn.** The live stream writes the running turn. `conversation.get` (after each data connect) writes finished turns and re-supplies the streaming turn's rows unchanged. `turn.get` (after `turn.finished`) replaces that turn's rows. A turn nobody in Porte asked for gets its user row from the Host's echo and its stream from the SDK's programmatic turn.
3. **Ids are never invented twice.** `turnId = turnIdFor(conversationId, index)`, where `index` is Grok's `promptIndex`, or the next free index when Grok repeats one. `attemptId` (uuidv7) is minted by the relay per `turn.start`; the Host answers `turn.start` once Grok's echo of the prompt is bound to it, and `turn.started { turnId, attemptId }` carries that binding. A turn typed elsewhere carries a Host-minted `attemptId` no row matches. The user row keeps the browser's id and carries `metadata: { attemptId }` from send time, upgraded to `{ turnId, attemptId }` on `turn.started`. The assistant row's id is the `turnId`.
4. **Order is `seq`, not socket order.** The relay keeps the last applied `seq` per Host connection in storage, parks early frames (limit in `host-json-rpc-socket.ts`), drops repeats, and closes with 1008 on overflow.
5. **Stop is a command.** The browser calls `cancelTurn`; the relay never aborts the SDK stream. The Host resolves pending permissions and elicitations as cancelled and sends ACP `session/cancel`; Grok ends the turn as `cancelled` on the stream. When `CANCEL_DEADLINE_MS` passes first, the Host ends the turn itself and drops Grok's late events. It never closes the agent session: the session is shared with the terminal.
6. **A restart is not a retry.** After a wake, the relay re-attaches the Host socket and does nothing else; `onChatRecovery` neither persists nor continues. `runningTurnId` in live state tells the browser a turn still runs.
7. **Small live state.** Commands live in DO storage and reach the browser through the `listCommands` callable, not through `setState`.
8. **No offline queue.** A command with no Host socket fails with `HostOfflineError`; the user retries.
9. **A permission answered elsewhere resolves as `answered-elsewhere`.** The card goes without a browser decision; the tool already runs.

## Idempotency

| Command                                   | Repeat key                                   |
| ----------------------------------------- | -------------------------------------------- |
| `conversation.create`                     | `creationId` in params                       |
| `turn.start`                              | `attemptId`; a running turn is not restarted |
| `turn.cancel`, `conversation.close`       | Final state; repeat is a no-op               |
| `permission.answer`, `elicitation.answer` | One pending interaction id                   |
