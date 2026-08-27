# Host conversation redesign

Target state for `apps/host` conversation commands, queries, and events. Every ACP claim below comes from spikes and captures against `grok --no-auto-update agent stdio` (grok 1.0.5, protocol 1) on 2026-08-27.

## 1. ACP facts (proven by spike)

### Capabilities

`initialize` returns `agentCapabilities`:

| Capability                   | Value                                               | Consequence for the host                                               |
| ---------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------- |
| `loadSession`                | `true`                                              | `session/load` replays history                                         |
| `sessionCapabilities.list`   | `{}`                                                | `session/list` with `cwd` filter and `cursor`                          |
| `sessionCapabilities.resume` | `{}`                                                | `session/resume` restores without replay                               |
| `sessionCapabilities.close`  | `{}`                                                | `session/close` frees the session in the process                       |
| `promptCapabilities`         | `image: false, audio: false, embeddedContext: true` | Reject image and audio prompt blocks                                   |
| `authMethods`                | `cached_token`, `grok.com`                          | `authenticate { methodId: 'cached_token', _meta: { headless: true } }` |

No `configOptions` and no `modes` in any response. Model and effort arrive in `models` and `_meta['x.ai/sessionConfig']`.

### Method matrix

| ACP method                  | Params                       | Result                                                                                                                    | Side notifications                                                                                |
| --------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `session/new`               | `cwd, mcpServers`            | `sessionId, models{currentModelId, availableModels[]}, _meta{gitRoot, isGitRepo, x.ai/sessionConfig, x.ai/sessionDetail}` | 2× `available_commands_update`                                                                    |
| `session/list`              | `cwd?, cursor?`              | `sessions[{sessionId, cwd, title?, updatedAt, _meta['x.ai/session'].facets{gitRoot, repo, kind}}], nextCursor?`           | none                                                                                              |
| `session/load`              | `sessionId, cwd, mcpServers` | same shape as `session/new` minus `sessionId`; `_meta['x.ai/sessionDetail'].title`                                        | full replay, then `available_commands_update`                                                     |
| `session/resume`            | `sessionId, cwd, mcpServers` | same as `session/load`                                                                                                    | `available_commands_update` only, no replay                                                       |
| `session/prompt`            | `sessionId, prompt[]`        | `stopReason, _meta{promptId, modelId, totalTokens, inputTokens, outputTokens, usage{...costUsdTicks}}`                    | stream, see below                                                                                 |
| `session/cancel`            | `sessionId`                  | notification                                                                                                              | in-flight prompt resolves `stopReason: 'cancelled'`, `_meta.cancellationCategory: 'MidTurnAbort'` |
| `session/set_model`         | `sessionId, modelId`         | `_meta.model.Ok: modelId`                                                                                                 | 2× `available_commands_update`; next prompt reports the new `modelId`                             |
| `session/set_mode`          | `sessionId, modeId`          | `{}` (accepted `low`; effect unverified)                                                                                  | none                                                                                              |
| `session/set_config_option` | —                            | **`Method not found`**                                                                                                    | —                                                                                                 |
| `session/close`             | `sessionId`                  | `_meta['x.ai/closeOutcome']: 'closed'`                                                                                    | —                                                                                                 |

### Errors

| Call                                                                           | Error             |
| ------------------------------------------------------------------------------ | ----------------- |
| `session/prompt` on a session this process has not created, loaded, or resumed | `Invalid params`  |
| `session/prompt` after `session/close`                                         | `Invalid params`  |
| `session/load` with a `cwd` that differs from the session `cwd`                | `Path not found.` |
| `session/load` with an unknown `sessionId`                                     | `Path not found.` |

Rule: a conversation must be **created, loaded, or resumed in the live process** before `session/prompt`. `session/list` alone does not make a session promptable.

### Stream shape

Live turn (one prompt, one tool call):

```
user_message_chunk        _meta{modelId, promptIndex}
session_info_update       {title}                     ← first turn only
agent_thought_chunk ×N
agent_message_chunk ×N
available_commands_update
tool_call                 {toolCallId, title, kind, status, content, locations, rawInput, _meta['x.ai/tool']}
tool_call_update ×N       {toolCallId, status|content|rawOutput}
agent_thought_chunk ×N
agent_message_chunk ×N
available_commands_update
```

- No `messageId` on any chunk, live or replay. The host synthesizes message identity from stream boundaries (`user → thought → message → tool`).
- `_meta.promptIndex` on `user_message_chunk` is the only stable per-turn key Grok gives.
- No `usage_update` notification. Usage is in the `session/prompt` response `_meta` (`totalTokens`); the context size is the model's `_meta.totalContextTokens`.
- No `current_mode_update`, no `config_option_update`, no `plan_update`.
- `available_commands_update` fires after new, load, resume, set_model, and after each tool call. It is large (229 commands, ~100 KB). Emit once, drop duplicates.

Replay via `session/load`: one chunk per message; `tool_call` arrives once with final `status`, `content`, `rawOutput`; no `tool_call_update`. A cancelled turn replays its `user_message_chunk` and partial `agent_thought_chunk` with no end marker.

Real `/porte` conversation (78 turns, 1392 updates; `scripts/capture-acp-fixtures.ts` → `scripts/clean-acp-fixtures.ts` → `tests/fixtures/acp/porte-*.json`):

- One turn carried **two `user_message_chunk`s with the same `promptIndex`** (a queued message). Same turn, one user message, two deltas.
- The legacy `plan` update (entries only, no `planId`) appears in real history.
- The trailing `available_commands_update` of a load can arrive **after** the `session/load` response. Route updates by session id, never by timing.
- The load response carries the title under `_meta['x.ai/sessionDetail'].title`, and `models` (absent from the SDK 0.x types; parsed off the raw response).

Two concurrent `session/prompt` calls on one session both returned `end_turn`. Grok does not reject the second one; the host serializes turns itself.

During a turn Grok called `fs/read_text_file { sessionId, path }` only. `session/request_permission` did not fire for a read in the default mode.

## 2. Architecture

Typist conventions (`/Users/az/projects/typist/apps/typist/src/server`): `entrypoints → application → domain`, `infrastructure` implements; messages are pure data; one handler per file; registries prove exhaustiveness with `satisfies`; entities raise events, repositories publish them; handlers throw typed errors and never log.

```
entrypoints/websocket/*        relay JSON-RPC frames → bus.handle(createCommand | createQuery)
entrypoints/acp/acp-inbound    AgentListener → bus (ApplyAgentUpdate, RequestPermission, RequestElicitation, CompleteElicitation)
application/message-bus        command → one handler; query → one handler; drains the outbox after every handler
application/handlers/*         one file per command, query, and event subscriber; registry.ts wires them
domain/conversation            Conversation aggregate: live turn + transcript (ConversationState); raises canonical ConversationEvents
domain/messages                CommandDataMap, EventDataMap, QueryDataMap; createCommand/createEvent/createQuery
infrastructure/app-deps        composition root: createAppDeps({ credential, signal }) — starts Grok eagerly
infrastructure/acp             AcpAgentProcess (spawn + JSON-RPC), AcpUpdateMapper (ACP update → events), AcpCodingAgent (port), acp-content (value maps)
infrastructure/grok            grok-launch (initialize, cached_token auth, capabilities, `_meta` readers), git-root
infrastructure/persistence     InMemoryConversationRepository, EventOutbox
infrastructure/node            NodeBackgroundTasks (turn prompts outlive the request; drained at shutdown)
```

Event flow (Cosmic Python in-memory loop): aggregate raises → `repo.save`/`insert`/`delete` push `collectEvents()` to `EventOutbox` → the bus drains after every handler until empty. Events come only from aggregates. A failed subscriber is logged once (`event_handler_failed`) and never fails the command. Subscribers are effects only (the aggregate is the state): `publishConversationEvent` (relay frames), `releaseParkedRequest` (answers the parked ACP request on `*.resolved`), `dropConversationSocket`.

### Decisions

- **Grok is the system of record.** The host owns which conversations are open on this process and their live state; `session/load` rebuilds the rest.
- **One aggregate, one store.** `Conversation.state` is the exact `conversation.get` shape; pending permissions and elicitations live only in `state.pending`. No separate view store.
- **Raise = fold + record.** Every transition raises a canonical event, folds it via `applyConversationEvent`, and records `ConversationEventRaised`. `replay` folds Grok history without raising.
- **Turns are serialized on the host** (`ConversationBusyError`); Grok accepts concurrent prompts.
- **`StartTurn` returns before the agent answers.** The prompt runs in `BackgroundTasks`; `FinishTurn` ends the turn with the outcome (and usage) when it settles. A conversation closed meanwhile has nothing to end.
- **Interrupt/steer has no host command.** The relay sends `turn.cancel`, waits for `turn.finished { cancelled }`, then `turn.start`.
- **Ids are branded strings from `@porte/core`.** `ConversationId` is Grok's session id; the host mints none. `message-identity.ts` derives the rest: replayed turn `${conversationId}:turn:${promptIndex}`, user `${turnId}:user`, assistant/reasoning `${turnId}:assistant|reasoning:${n}`, permission/elicitation `${turnId}:permission|elicitation:${acpRequestId}`.
- **Port `CodingAgent`.** Mutations return the events they cause; `prompt` resolves with `{ outcome, usage? }`; agent pushes go through `AgentListener`; `resolvePermission`/`resolveElicitation` release parked requests and are no-ops when nothing is parked. No SDK type crosses it. The model list is the one `select` option, id `model`.
- **`AcpCodingAgent` state** is only what ACP needs: open sessions (`cwd` for fs requests, one mapper, model list), parked requests, and updates that arrive before `session/new` answers. Replay is buffered during `session/load` and returned.
- **`AcpUpdateMapper`** never emits `turn.*`; `beginTurn`/`endTurn` bracket a live turn, replay turns key on `promptIndex`, a repeated index continues the same turn, `available_commands_update` is deduped.

### Contract changes in `packages/core`

1. `conversation.attach` params carry `cwd` (the relay stores it per conversation). No list scan; Grok rejects a wrong `cwd` with `Path not found`.
2. `conversation.configuration.set` accepts only `{ optionId: 'model', value: { type: 'select', value: modelId } }`; anything else → `ConfigurationNotFoundError`.
3. `conversation.usage.updated` is emitted once per turn at finish.

## 3. Tests

| Level                                | Where                                          | Proof                                                                                                  |
| ------------------------------------ | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Host flows, real Grok, fake sockets  | `tests/integration/host-flows.test.ts`         | create + list; send → stream → finish; close → open → messages back; cancel → `cancelled`              |
| Adapter, real Grok                   | `tests/integration/acp-coding-agent.test.ts`   | create → prompt → completed with usage; close → prompt rejected; load replays; cancel; setModel        |
| Process, no Grok                     | `tests/integration/acp-agent-process.test.ts`  | deadline, no process signals, stop on abort                                                            |
| Application flows, fake agent        | `tests/unit/conversation-flow.test.ts`         | start; busy; stream + usage; permission park/release; cancel; close while running; open twice          |
| Relay sockets, fake agent            | `tests/unit/host-websocket-connection.test.ts` | attach → socket → open on up → get; reconnect no reload; events on the socket; stopped socket replaced |
| Real `/porte` replay (deterministic) | `tests/unit/acp-porte-replay.test.ts`          | 5 real turns incl. repeated `promptIndex`, legacy `plan`, commands once, list rows, load response      |
| Spike streams (deterministic)        | `tests/unit/acp-update-mapper.test.ts`         | replay ids, one `tool.updated` per replayed call, live commands once, streams closed at end            |
| Aggregate, bus, repository           | `tests/unit/*`                                 | transitions, raise/fold, outbox drain order, subscriber failure isolation                              |

## 4. Status

| #   | Commit                                                  | State |
| --- | ------------------------------------------------------- | ----- |
| 1   | `refactor: rename ACP transport to AcpAgentProcess`     | ✓     |
| 2   | `feat: add host message bus and handler registry`       | ✓     |
| 3   | `feat: add Conversation aggregate and repository`       | ✓     |
| 4   | `feat: add AcpUpdateMapper`                             | ✓     |
| 5   | `feat: add AcpCodingAgent and Grok launch`              | ✓     |
| —   | `test: add real porte ACP fixtures and replay checks`   | ✓     |
| 6   | `refactor: route host commands through the message bus` | ✓     |
| 7   | `chore: remove dead host code`                          | ✓     |

Out of scope, tracked separately: idle eviction of open conversations, `creationId` idempotency on `conversation.create`, effort via `session/set_mode`, `session/resume` (no use until the host persists views).
