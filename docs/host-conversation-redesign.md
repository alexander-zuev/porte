# Host conversation redesign

Target state for `apps/host` conversation commands, queries, and events. Every ACP claim below comes from a spike against `grok --no-auto-update agent stdio` (grok 1.0.5, protocol 1) on 2026-08-27.

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
| `session/prompt`            | `sessionId, prompt[]`        | `stopReason, _meta{promptId, modelId, inputTokens, outputTokens, usage{...costUsdTicks}}`                                 | stream, see below                                                                                 |
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

- No `messageId` on any chunk, live or replay. The host must synthesize message identity from stream boundaries (`user → thought → message → tool`).
- `_meta.promptIndex` on `user_message_chunk` is the only stable per-turn key Grok gives.
- No `usage_update` notification. Usage is in the `session/prompt` response `_meta`.
- No `current_mode_update`, no `config_option_update`, no `plan`.
- `available_commands_update` fires after new, load, resume, set_model, and after each tool call. It is large (≈300 commands, ~100 KB). Store once, diff, and drop duplicates.

Replay via `session/load` for the same 2-turn conversation: **12 updates**. One chunk per message. `tool_call` arrives once with final `status`, `content`, `rawOutput`; no `tool_call_update`. A cancelled turn replays its `user_message_chunk` and partial `agent_thought_chunk` with no end marker.

Two concurrent `session/prompt` calls on one session both returned `end_turn`. Grok does not reject the second one; the host must serialize turns itself.

### Inbound client requests

During the turn Grok called `fs/read_text_file { sessionId, path }` only. `session/request_permission` did not fire for a read in the default mode.

## 1b. Conventions copied from typist

Source: `/Users/az/projects/typist/apps/typist/src/server`. Only the rules the host reuses.

| Concern          | typist rule                                                                                                                                                                                                                                                                       | Host adoption                                                  |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Layers           | `entrypoints/ → application/ → domain/`, `infrastructure/` implements; dependencies inward                                                                                                                                                                                        | same                                                           |
| Messages         | Zod schemas in `domain/messages/{commands,events,queries}.ts`; `baseCommandSchema` (`type`, `name`, `id`, `timestamp`), `baseEventSchema`, `baseQuerySchema` (no id); `createCommand/createEvent/createQuery` factories; `COMMAND_SCHEMAS` registry → `CommandName`, `CommandMap` | same shape, no queue, no outbox                                |
| Handlers         | `CommandHandler<C, R> = (command, deps) => Promise<R>`; `EventHandler<E> = (event, deps) => Promise<void>`; `QueryHandler<Q, R> = (query, deps) => Promise<R>`; one exported const per file, kebab-case file = handler name                                                       | same                                                           |
| Registry         | `application/handlers/registry.ts`: `COMMAND_HANDLERS satisfies CommandRegistry`, `EVENT_HANDLERS satisfies EventRegistry` (array per event), `QUERY_HANDLERS satisfies QueryRegistry`; `satisfies` proves exhaustiveness                                                         | same                                                           |
| Bus              | `MessageBus.handle(message)`: command → one handler; event → all subscribers via `Promise.allSettled`, first error rethrown; query → one handler with `QueryDeps` (no write access)                                                                                               | same, in-process only                                          |
| Entities         | `class X extends Entity<Data>`; `private constructor(data)`; `static create(...)` emits events via `addEvent`; `static restore(data)` emits nothing; `toPlainObject(): Data`; transitions guard and throw typed errors; repeated transition is a no-op that returns `this`        | same                                                           |
| Repositories     | interface accepts and returns entities only; `findX` → `T \| null`; `getX` → `T` or throws `EntityNotFoundError`; `insert` / `save` / `delete`; no `update(id, fields)`; no list-for-screen methods (those are queries)                                                           | same, in-memory implementation                                 |
| Queries          | read path skips entities; projection is the DTO                                                                                                                                                                                                                                   | same, reads project from the repository snapshot               |
| Domain services  | pure, no I/O, no `deps`; class with static methods or a module of functions                                                                                                                                                                                                       | same                                                           |
| Ports            | interfaces beside the adapter or in `application/ports/`; `AppDeps` is the only thing handlers see                                                                                                                                                                                | keep `application/ports/`                                      |
| Composition root | one `createAppDeps(...)` returning lazy memoized accessors; entrypoints consume, never construct                                                                                                                                                                                  | `apps/host/src/main.ts` → `infrastructure/app-deps.ts`         |
| Errors           | thrown, typed, stable `code`; handlers throw and never log; the entrypoint logs once; `instanceof` only; expected absence is data, not an error                                                                                                                                   | same, keep `better-result` `TaggedError` (already in the host) |

## 2. What is wrong today

| Problem                                                                                                      | Where                                                                                                        | Effect                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `GrokCodingAgent` (836 lines) owns process, session lookup, turn state, pending RPCs, view fold, and mapping | `infrastructure/grok/grok-coding-agent.ts`                                                                   | No domain model. Nothing below the port is unit-testable without Grok.                                                                      |
| Two mappers for one stream                                                                                   | `grok-event-mapper.ts` (`GrokEventMapper` + `GrokReplayMapper`)                                              | Replay and live use the same ACP update types (§1). Two code paths, two bug surfaces.                                                       |
| Open scans `session/list` up to 40 pages to find `cwd`                                                       | `openConversation`                                                                                           | O(pages) per open. The Worker already stores `cwd` for every listed conversation.                                                           |
| Application handlers are one-line forwarders                                                                 | `commands/*.command.ts`                                                                                      | The port is the use case. Handlers add nothing.                                                                                             |
| `held` vs `conversations` maps                                                                               | `GrokCodingAgent`                                                                                            | Two representations of "conversation on this process". `snapshot()` of a held conversation returns an empty transcript instead of an error. |
| Turn runs fire-and-forget inside the adapter                                                                 | `startTurn` → `void this.promptSession()`                                                                    | Finish and fail transitions are hidden in infrastructure. Shutdown cannot wait for them.                                                    |
| `SetConfiguration` maps to `session/set_config_option`                                                       | `setConfiguration`                                                                                           | Grok answers `Method not found` (§1). Dead path. Model change needs `session/set_model`.                                                    |
| Unknown-session fs requests root at `$HOME`                                                                  | `answerIncoming` fallback                                                                                    | Path containment is at home, not the repository.                                                                                            |
| `ListSessionsResponse` (SDK type) in the port                                                                | `ports/coding-agent.ts`                                                                                      | ACP leaks into application.                                                                                                                 |
| Dead code                                                                                                    | `grok-summary.ts`, `HostConfig.grokHome`, `tests/e2e/resume.test.ts` (`porte list`/`resume` no longer exist) | Noise.                                                                                                                                      |

## 3. Target domain model

Grok is the system of record for transcripts. The host owns exactly two facts: **which conversations are open on this process** and **the live turn**. Everything else is a projection that can be rebuilt with `session/load` (12 updates per 2 turns, §1).

### Aggregate `Conversation` — `domain/conversation/conversation.ts`

```ts
type ConversationData = {
  readonly id: ConversationId
  readonly cwd: string
  readonly gitRoot: string          // normalised, no trailing separator
  readonly title: string
  readonly updatedAt: IsoDateTime
  readonly modelId: string          // from session/new|load|resume `models.currentModelId`
  readonly turn: Turn               // see below
}

class Conversation extends Entity<ConversationData> {
  static create(input: { id, cwd, gitRoot, modelId, now }): Conversation   // after session/new
  static restore(data: ConversationData): Conversation                     // after session/load|resume, no events
  beginTurn(turnId: TurnId, userMessage): void        // throws ConversationBusyError; emits turn.started + user message events
  requestPermission(request): PermissionId            // throws TurnNotRunningError; emits permission.requested
  answerPermission(permissionId, optionId): void      // throws PermissionNotFoundError; emits permission.resolved
  requestElicitation(...) / answerElicitation(...)    // same shape
  cancelTurn(turnId): PendingInteraction[]            // resolves every pending as cancelled; returns them for the adapter
  finishTurn(turnId, outcome: TurnOutcome): void      // idle; emits *.completed + turn.finished; repeat is a no-op
  applyMetadata(patch): void                          // title/updatedAt; emits conversation.metadata.updated
  changeModel(modelId): void
  toPlainObject(): ConversationData
}
```

Turn is a discriminated union, never optional fields:

```ts
type Turn =
  { state: 'idle' } | { state: 'running'; turnId: TurnId; pending: readonly PendingInteraction[] }
type PendingInteraction =
  | { kind: 'permission'; permissionId: PermissionId; optionIds: readonly string[] }
  | { kind: 'elicitation'; elicitationId: ElicitationId }
```

Domain events emitted by the aggregate are the canonical `ConversationEvent` values from `@porte/core` (the published contract), wrapped once: `ConversationEventRaised { conversationId, event }`. The aggregate never touches ACP types.

Removed: `hold()`, `held` map, `OpenConversation` class, `GrokReplayMapper`.

### Read model `ConversationView` — `domain/conversation/conversation-view-reducer.ts` (keep)

`applyConversationEvents(view, events)` stays as the one fold. The stored view keeps tool `content: []` and no `rawOutput` (what `conversation.get` returns today); the wire event keeps the full body. One stored representation, no second strip step.

### Domain service `MessageIdentity` — `domain/conversation/message-identity.ts`

Grok sends no `messageId` (§1). Ids are deterministic so a Worker replace-all after reload matches:

| Item                          | Id                                                                                              |
| ----------------------------- | ----------------------------------------------------------------------------------------------- |
| Live turn                     | `turnId` from the relay                                                                         |
| Replayed turn                 | `${conversationId}:turn:${promptIndex}` (`_meta.promptIndex` on `user_message_chunk`)           |
| User message                  | `${turnId}:user`                                                                                |
| Assistant / reasoning message | `${turnId}:assistant:${n}` / `${turnId}:reasoning:${n}`, `n` increments on each stream boundary |
| Permission                    | `${turnId}:permission:${acpRequestId}`                                                          |

### Repositories — `domain/repositories/`

```ts
interface ConversationRepository {
  // open conversations on this process
  find(id: ConversationId): Conversation | null
  get(id: ConversationId): Conversation // throws ConversationNotFoundError
  insert(c: Conversation): void // throws ConversationAlreadyOpenError
  save(c: Conversation): void
  delete(id: ConversationId): void
  all(): readonly Conversation[]
}
interface ConversationViewStore {
  // projection, one per open conversation
  get(id): ConversationView // throws ConversationNotFoundError
  put(id, view): void
  delete(id): void
}
```

Both in-memory (`infrastructure/persistence/in-memory-*.ts`). Synchronous: one process, no I/O. Memory is bounded by open conversations; close deletes both rows.

## 4. Application layer (CQRS)

`domain/messages/{base,commands,events,queries,types}.ts` and `application/handlers/registry.ts` follow §1b. Bus is in-process, no receipts, no outbox: every command comes from one relay request or one ACP message and is not redelivered.

### Commands

| Command                                                                 | Origin                                                          | Handler does                                                                                                                                             |
| ----------------------------------------------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CreateConversation { cwd, mcpServers? }`                               | relay `conversation.create`                                     | `findGitRoot` → `codingAgent.createSession` → `Conversation.create` → `repo.insert` + `views.put(empty)` → return summary                                |
| `OpenConversation { conversationId, cwd }`                              | conversation socket up                                          | no-op if open → `codingAgent.loadSession(id, cwd, onUpdate)`; replay events fold into a fresh view → `Conversation.restore` → `repo.insert`, `views.put` |
| `StartTurn { conversationId, turnId, userMessage }`                     | relay `turn.start`                                              | `beginTurn` → `save` → `background.run(prompt)`; on settle dispatch `FinishTurn` or `FailTurn`                                                           |
| `FinishTurn { conversationId, turnId, stopReason, usage }`              | internal                                                        | `finishTurn` + `conversation.usage.updated` (usage is only in the prompt response `_meta`, §1)                                                           |
| `FailTurn { conversationId, turnId, error }`                            | internal                                                        | `finishTurn(failed)`                                                                                                                                     |
| `CancelTurn { conversationId, turnId }`                                 | relay `turn.cancel`                                             | `cancelTurn` → `codingAgent.resolvePending(cancelled)` for each → `codingAgent.cancel(id)`                                                               |
| `ReceiveAgentUpdate { conversationId, update }`                         | ACP `session/update`                                            | mapper → events → `raise` on aggregate (running turn) or metadata/commands only (idle)                                                                   |
| `RequestPermission { conversationId, acpRequestId, toolCall, options }` | ACP `session/request_permission`                                | `requestPermission` → save; the adapter parks the RPC keyed by `permissionId`                                                                            |
| `AnswerPermission { conversationId, turnId, permissionId, optionId }`   | relay `permission.answer`                                       | `answerPermission` → `codingAgent.resolvePermission(permissionId, { selected })`                                                                         |
| `RequestElicitation` / `AnswerElicitation`                              | ACP / relay                                                     | same shape                                                                                                                                               |
| `SetModel { conversationId, modelId }`                                  | relay `conversation.configuration.set` with `category: 'model'` | `codingAgent.setModel` → `changeModel` → `conversation.configuration.updated`                                                                            |
| `CloseConversation { conversationId }`                                  | relay `conversation.close`, socket stopped, shutdown            | running turn → `CancelTurn`; `codingAgent.closeSession`; `repo.delete`; `views.delete`                                                                   |
| `CloseAllConversations`                                                 | shutdown                                                        | `CloseConversation` for `repo.all()`, then `codingAgent.stop()`                                                                                          |

Effort (`session/set_mode`) is out of scope until its effect is verified. `set_config_option` is not implemented by Grok (§1) and is not a command.

### Events (in-process)

| Event                                               | Subscribers                                                                                                                                                                                                                                                        |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ConversationEventRaised { conversationId, event }` | `project-conversation-view` (state: fold into `ConversationViewStore`), `publish-conversation-event` (effect: `conversation.event` frame), `publish-metadata` (effect: `conversation.updated` control frame when `event.type === 'conversation.metadata.updated'`) |
| `ConversationClosed { conversationId }`             | `disconnect-conversation-socket` (effect)                                                                                                                                                                                                                          |

Subscribers run per `Promise.allSettled`; a socket write failure never blocks the fold.

### Queries

| Query                                | Handler                                                                                      |
| ------------------------------------ | -------------------------------------------------------------------------------------------- |
| `ListConversations { cursor? }`      | `codingAgent.listSessions(cursor)` → summaries (drop rows without `gitRoot` facet, as today) |
| `GetConversation { conversationId }` | `views.get(id)` + `repo.get(id).turn` → `ConversationState`                                  |

### Handler shape

```ts
export const startTurn: CommandHandler<StartTurn, void> = async (command, deps) => {
  const conversation = deps.repos.conversations.get(command.conversationId)
  conversation.beginTurn(command.turnId, command.userMessage)
  deps.repos.conversations.save(conversation) // publishes raised events through the bus
  deps.background.run(
    deps.codingAgent.prompt(command.conversationId, command.userMessage.content).then(
      (result) =>
        deps.bus.handle(
          createCommand('FinishTurn', {
            ...ids,
            stopReason: result.stopReason,
            usage: result.usage,
          }),
        ),
      (cause) =>
        deps.bus.handle(createCommand('FailTurn', { ...ids, error: toFailurePayload(cause) })),
    ),
  )
}
```

`save` drains `collectEvents()` into `bus.handle` (in-memory analogue of the UoW outbox). No handler calls a notifier directly.

## 5. Ports and infrastructure

### `application/ports/coding-agent.ts` (rewrite)

```ts
interface CodingAgent {
  listSessions(cursor?: ConversationCursor): Promise<SessionPage> // host DTO, not ListSessionsResponse
  createSession(input: { cwd; mcpServers }): Promise<SessionInfo> // { id, modelId }
  loadSession(id, cwd, onEvent: (events: ConversationEvent[]) => void): Promise<SessionInfo> // replay through the mapper
  prompt(id, content: CanonicalContent[]): Promise<{ stopReason; usage? }>
  cancel(id): Promise<void>
  setModel(id, modelId): Promise<void>
  closeSession(id): Promise<void>
  resolvePermission(permissionId, outcome): void // resolves the parked RPC
  resolveElicitation(elicitationId, answer): void
  stop(): Promise<void>
}
```

Other ports keep their names: `ControlNotifications`, `ConversationNotifications`, `HostConnections`. New: `BackgroundTasks { run(task: Promise<void>): void; drain(): Promise<void> }` so shutdown waits for in-flight turns.

### Infrastructure

| File                                      | Owns                                                                                                                                                                                                                    |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `infrastructure/acp/acp-agent-process.ts` | keep as is                                                                                                                                                                                                              |
| `infrastructure/acp/acp-update-mapper.ts` | **one** stateful mapper: ACP update → canonical events, live and replay. Replaces both classes in `grok-event-mapper.ts`. Dedupes `available_commands_update` by deep-equal (§1: ~100 KB, fires after every tool call). |
| `infrastructure/acp/acp-coding-agent.ts`  | `CodingAgent` implementation over `AcpAgentProcess`; parks permission/elicitation RPCs in `Map<PermissionId, resolve>`; nothing else stateful                                                                           |
| `infrastructure/acp/incoming-fs.ts`       | fs read/write rooted at the conversation `cwd`; unknown session → `-32602`, never `$HOME`                                                                                                                               |
| `infrastructure/grok/grok-launch.ts`      | binary + args, `cached_token` auth, required capabilities (`loadSession`, `list`, `close`), `_meta['x.ai/session'].facets.gitRoot` parsing, `models.currentModelId`                                                     |
| `entrypoints/acp/acp-inbound.ts`          | ACP → bus: `session/update` → `ReceiveAgentUpdate`; `session/request_permission` → `RequestPermission` then await the parked promise; `elicitation/create` → `RequestElicitation`                                       |
| `entrypoints/websocket/*`                 | parse → `bus.handle(createCommand/createQuery)` → convert. `conversation.attach` carries `cwd`; the conversation socket `onUp` dispatches `OpenConversation`                                                            |
| `infrastructure/bootstrap/app-deps.ts`    | composition root: `createAppDeps({ signal, credential })` → `{ repos, codingAgent, bus, notifications, background, now }`                                                                                               |

### Where `grok-coding-agent.ts` goes (file is deleted)

| Today (`grok-coding-agent.ts`)                                                                                                                                                     | Target                                                                                                                                                                    |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ensureAcp`, `startGrok`, `authenticateGrok`, `requireGrokCapabilities`, `grokCapabilityMap`                                                                                       | `infrastructure/grok/grok-launch.ts` — `startGrok(signal): Promise<AcpTransport>` runs once at `porte up`, eager, in the composition root. No lazy start, no `ensureAcp`. |
| `listConversations`, `createSession`, `loadSession`, `promptSession`, `cancelTurn`, `setConfiguration`, `closeConversation`, `toAcpContent`, `toMcpServers`, `elicitationResponse` | `infrastructure/acp/acp-coding-agent.ts` — one method, one RPC, no conversation state                                                                                     |
| `held`, `snapshots`, `loadSinks`, `loadErrors`, `conversations` maps; `hold`, `drop`, `has`, `requireSession`, `snapshot`                                                          | `Conversation` aggregate in `ConversationRepository`; view in `ConversationViewStore`                                                                                     |
| `findSession` (40-page scan)                                                                                                                                                       | deleted; `cwd` arrives with `conversation.attach`                                                                                                                         |
| `OpenConversation.beginTurn/finishTurn/failTurn/cancelPendingForTurn/answerPermission/answerElicitation/discardPending`, `elicitationOutcome`                                      | `Conversation` aggregate methods                                                                                                                                          |
| `OpenConversation.permissions/elicitations` resolve functions                                                                                                                      | `AcpCodingAgent.parked: Map<PermissionId \| ElicitationId, resolve>`                                                                                                      |
| `OpenConversation.send` (fold + listener)                                                                                                                                          | `project-conversation-view` + `publish-conversation-event` event subscribers                                                                                              |
| `receiveUpdate`, `answerIncoming`, `answerIncomingElicitation`, `completeElicitation`, `applyIdleUpdate`                                                                           | `entrypoints/acp/acp-inbound.ts` → bus commands                                                                                                                           |
| `GrokEventMapper` + `GrokReplayMapper`                                                                                                                                             | `infrastructure/acp/acp-update-mapper.ts` (one class)                                                                                                                     |
| `grok-session.ts` `toSessionFacts`                                                                                                                                                 | `infrastructure/grok/grok-launch.ts` (list row → summary)                                                                                                                 |

`AcpAgentProcess` (`infrastructure/acp/acp-agent-process.ts`, commit 1 ✓) is the only agent-agnostic piece: one spawned ACP process plus its JSON-RPC connection. Grok specifics live in `grok-launch.ts`; nothing else spawns.

### Contract changes in `packages/core`

1. `conversation.attach` params: add `cwd: z.string().min(1)`. The Worker has it in its `conversation` table. Removes the 40-page scan; Grok rejects a wrong `cwd` with `Path not found` (§1).
2. `conversation.configuration.set`: host accepts only `{ optionId: 'model', value: { type: 'select', value: modelId } }`; other ids → `ConfigurationNotFoundError`.
3. `conversation.usage.updated` is emitted once per turn at finish, not streamed.

## 6. Implementation plan

One commit per row. Every commit is green (`pnpm lint`, `pnpm typecheck`, `pnpm test` in `apps/host`). Commits 1–5 add new modules that nothing imports yet; commit 6 switches every entrypoint at once and deletes the old path in the same commit. No shim keeps old and new alive together.

| #   | Commit                                                                                                                                                                                                                                                                                                                                                                                                                        | Files                                                                                                                                                                            | Proof                                                                                                                                                                                                                                                                                                                        |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `refactor: simplify ACP transport start and timeouts` — `spawn({ signal })`, `once(child, 'spawn', { signal })`, `AbortSignal.any/timeout`, no flags                                                                                                                                                                                                                                                                          | `infrastructure/acp/acp-agent-process.ts`, `tests/integration/acp-transport.test.ts`                                                                                             | existing transport tests green; file shrinks by ~80 lines                                                                                                                                                                                                                                                                    |
| 2   | `feat: add host message bus and handler registry` — `base`, `commands`, `events`, `queries`, `types`, `MessageBus`, empty registries with `satisfies`                                                                                                                                                                                                                                                                         | `domain/messages/*`, `application/message-bus.ts`, `application/handlers/{types,registry}.ts`                                                                                    | unit: unknown message → `NoHandlerError`; event with two subscribers runs both when one throws                                                                                                                                                                                                                               |
| 3   | `feat: add Conversation aggregate and repositories` — `Conversation`, `Turn`, `PendingInteraction`, `MessageIdentity`, `ConversationRepository`, `ConversationViewStore`, in-memory implementations                                                                                                                                                                                                                           | `domain/conversation/*`, `domain/repositories/*`, `infrastructure/persistence/*`                                                                                                 | unit: `beginTurn` twice → `ConversationBusyError`; `finishTurn` twice → one `turn.finished`; `cancelTurn` returns every pending and emits `*.resolved cancelled`; `restore` emits nothing                                                                                                                                    |
| 4   | `feat: add AcpUpdateMapper` — one mapper for live and replay, deterministic ids, `available_commands_update` dedupe                                                                                                                                                                                                                                                                                                           | `infrastructure/acp/acp-update-mapper.ts`, `tests/fixtures/acp/*.json` (written from the spike)                                                                                  | unit: `session-load-replay.json` → 2 turns with ids `…:turn:0/1`, one `tool.updated` per call; `session-prompt-live.json` → `tool.updated` ×3 for one call, commands emitted once                                                                                                                                            |
| 5   | `feat: add AcpCodingAgent and Grok launch` — port implementation, parked RPC map, `startGrok` (initialize, `cached_token`, capabilities, list-row facets)                                                                                                                                                                                                                                                                     | `application/ports/coding-agent.ts` (new shape, old one still exists under the old name until 6), `infrastructure/acp/acp-coding-agent.ts`, `infrastructure/grok/grok-launch.ts` | integration (real grok, `skipIf`): create → prompt → `end_turn`; load → mapper → view with 2 turns; prompt before load → RPC error; `setModel` → next prompt `_meta.modelId` changes; close → prompt → RPC error                                                                                                             |
| 6   | `refactor: route host commands through the message bus` — the switch. Handlers (commands, events, queries), `acp-inbound`, websocket entrypoints call `bus.handle`, `app-deps.ts` composition root, `BackgroundTasks`, `conversation.attach` carries `cwd` (core + `apps/web` caller). **Deletes** `grok-coding-agent.ts`, `grok-event-mapper.ts`, `grok-session.ts`, `commands/*.command.ts`, `queries/*.query.ts`, old port | `application/handlers/**`, `entrypoints/**`, `infrastructure/bootstrap/*`, `packages/core/src/relay/host-control-methods.ts`, `apps/web` attach call                             | unit with fake `CodingAgent`: open → start → permission → answer → finish asserts frames and view; `StartTurn` while running → `ConversationBusyError` and `prompt` not called; `host-websocket-connection.test.ts` and `host-runtime.test.ts` rewritten and green; e2e by hand: phone attach → transcript without list scan |
| 7   | `chore: remove dead host code` — `grok-summary.ts`, `HostConfig.grokHome`, `tests/e2e/resume.test.ts`                                                                                                                                                                                                                                                                                                                         | —                                                                                                                                                                                | all checks green                                                                                                                                                                                                                                                                                                             |

Commit 6 is large by design: splitting it would require the old and new paths to coexist. Review it as one diff with the table in §5 ("Where `grok-coding-agent.ts` goes") as the checklist.

Precondition: the working tree has uncommitted edits from another session in `grok-coding-agent.ts`, `coding-agent.ts`, `conversation.ts`, `attach-conversation.command.ts`, `list-conversations.query.ts` and new `open-conversation.command.ts`, `grok-session.ts`. Commit or discard them before commit 1; commit 6 deletes most of those files.

Out of scope, tracked separately: idle eviction of open conversations, `creationId` idempotency on `conversation.create`, effort via `session/set_mode`, `session/resume` (no use until the host persists views).
