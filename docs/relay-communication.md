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

1. **The Host owns the transcript.** The relay's rows are a projection; when they disagree, the Host wins.
2. **One writer per turn.** The live stream writes the running turn. `conversation.get` (after each data connect) writes finished turns and re-supplies the streaming turn's rows unchanged. `turn.get` (after `turn.finished`) replaces that turn's rows.
3. **Ids are never invented twice.** `turnId = turnIdFor(conversationId, promptIndex)`, minted by the Host. `attemptId` (uuidv7) is minted by the relay per `turn.start`; `turn.started { turnId, attemptId }` binds the two. The user row keeps the browser's id and carries `metadata: { attemptId }` from send time, upgraded to `{ turnId, attemptId }` on `turn.started`. The assistant row's id is the `turnId`.
4. **Order is `seq`, not socket order.** The relay keeps the last applied `seq` per Host connection in storage, parks early frames (limit in `host-json-rpc-socket.ts`), drops repeats, and closes with 1008 on overflow.
5. **Stop is a command.** The browser calls `cancelTurn`; the relay never aborts the SDK stream. The Host resolves pending permissions and elicitations as cancelled, sends ACP `session/cancel`, and finishes the turn as `cancelled` when the agent settles or when `CANCEL_DEADLINE_MS` passes (then it also closes the agent session).
6. **A restart is not a retry.** After a wake, the relay re-attaches the Host socket and does nothing else; `onChatRecovery` neither persists nor continues. `runningTurnId` in live state tells the browser a turn still runs.
7. **Small live state.** Commands live in DO storage and reach the browser through the `listCommands` callable, not through `setState`.
8. **No offline queue.** A command with no Host socket fails with `HostOfflineError`; the user retries.

## Idempotency

| Command                                   | Repeat key                                   |
| ----------------------------------------- | -------------------------------------------- |
| `conversation.create`                     | `creationId` in params                       |
| `turn.start`                              | `attemptId`; a running turn is not restarted |
| `turn.cancel`, `conversation.close`       | Final state; repeat is a no-op               |
| `permission.answer`, `elicitation.answer` | One pending interaction id                   |
