# Host Architecture

## Status

This document defines the target host architecture. It replaces the earlier chat summary.

The first implementation supports Grok through ACP. Future coding-agent integrations use the same application contracts and canonical events.

## Goal

The host lets a remote client control local coding-agent sessions without exposing provider protocols to the relay or web application.

The core flow is:

```text
ACP DTO
  -> Grok ACP adapter
  -> CodingSessionEvent
  -> host relay
  -> UIMessage projector
  -> UIMessage
```

A future provider uses the same boundary:

```text
Claude protocol
  -> Claude adapter
  -> CodingSessionEvent
  -> host relay
  -> UIMessage projector
  -> UIMessage
```

## Boundaries

Each boundary owns one representation.

1. ACP DTOs exist only inside the ACP infrastructure adapter.
2. `CodingSessionEvent` is the canonical coding-session event model.
3. WebSocket envelopes exist only at the relay boundary.
4. `UIMessage` exists only inside the web application.
5. Raw provider events never cross the adapter boundary.

`CodingSessionEvent` does not include a product name. Its name describes the domain concept.

## First ACP Scope

### Session lifecycle

The first implementation supports these ACP operations:

- `initialize` with capability validation.
- `session/load` for an existing session and its conversation replay.
- `session/new` for a new session.
- `session/prompt`, `session/cancel`, and `session/close`.
- `session/request_permission` with an explicit user answer.

The web open flow uses `session/load`. ACP requires this operation to replay the conversation before it returns.

`session/resume` is not part of the first implementation. It restores context without replay and cannot provide the initial conversation.

### Session updates

The first implementation maps all ACP input required for a usable coding session:

| ACP input                       | Canonical output                     |
| ------------------------------- | ------------------------------------ |
| Completed `session/load` replay | `conversation.snapshot`              |
| Accepted prompt                 | `turn.started`                       |
| `user_message_chunk`            | `message.*` with `role: 'user'`      |
| `agent_message_chunk`           | `message.*` with `role: 'assistant'` |
| `agent_thought_chunk`           | `reasoning.*`                        |
| `tool_call`                     | `tool.started`                       |
| `tool_call_update`              | `tool.updated`                       |
| `plan`                          | `plan.updated`                       |
| `usage_update`                  | `session.usage.updated`              |
| `session_info_update`           | `session.metadata.updated`           |
| `session/request_permission`    | `permission.requested`               |
| Permission response             | `permission.resolved`                |
| Prompt result with `stopReason` | `turn.finished`                      |
| Agent process or ACP failure    | `session.failed`                     |

These events cover replay, live turns, progress, tools, permissions, session metadata, and terminal failures.

The first implementation deliberately ignores these ACP updates:

- Mode and model configuration.
- Available commands.

The product does not display or control these values yet. The adapter records an observability count when it ignores a known update.

Filesystem and terminal methods are separate client capabilities. They are not session events. The host does not advertise these capabilities.

The adapter skips an unknown update and records its ACP name. A malformed supported update stops the session with a typed protocol error.

## Canonical Event Model

`packages/core` owns the schemas and types for `CodingSessionEvent`.

```ts
type CodingSessionEvent = {
  eventId: EventId
  sessionId: SessionId
} & CodingSessionEventData

type CodingSessionEventData =
  | ConversationSnapshotEvent
  | TurnStartedEvent
  | MessageStartedEvent
  | MessageDeltaEvent
  | MessageCompletedEvent
  | ReasoningStartedEvent
  | ReasoningDeltaEvent
  | ReasoningCompletedEvent
  | ToolStartedEvent
  | ToolUpdatedEvent
  | PlanUpdatedEvent
  | SessionUsageUpdatedEvent
  | SessionUpdatedEvent
  | PermissionRequestedEvent
  | PermissionResolvedEvent
  | TurnFinishedEvent
  | SessionFailedEvent
```

### Conversation replay

The Grok adapter collects ACP replay updates during `session/load`.

It emits one snapshot before the open operation returns.

```ts
type ConversationSnapshotEvent = {
  type: 'conversation.snapshot'
  items: readonly ConversationItem[]
  plan: readonly PlanEntry[]
}

type ConversationItem = TextMessage | ReasoningMessage | ToolActivity
```

The receiver replaces its current conversation with the snapshot. It does not merge two replay streams.

### Turn lifecycle

```ts
type TurnStartedEvent = {
  type: 'turn.started'
  turnId: TurnId
}

type TurnFinishedEvent = {
  type: 'turn.finished'
  turnId: TurnId
  outcome:
    | { type: 'completed'; stopReason: string }
    | { type: 'cancelled' }
    | { type: 'failed'; error: CodingAgentError }
}
```

One session can have one active turn. A repeated `turnId` must not send the prompt again.

### Text messages

```ts
type MessageStartedEvent = {
  type: 'message.started'
  turnId: TurnId
  messageId: MessageId
  role: 'user' | 'assistant'
}

type MessageDeltaEvent = {
  type: 'message.delta'
  turnId: TurnId
  messageId: MessageId
  delta: string
}

type MessageCompletedEvent = {
  type: 'message.completed'
  turnId: TurnId
  messageId: MessageId
}
```

All chunks for one message use one `messageId`.

The provider adapter creates explicit start and completion events when the provider only supplies chunks.

### Reasoning

Reasoning uses `reasoning.started`, `reasoning.delta`, and `reasoning.completed`.

Reasoning stays separate from assistant text. This lets the web projector create a distinct `UIMessage` reasoning part.

### Tool activity

```ts
type ToolStartedEvent = {
  type: 'tool.started'
  turnId: TurnId
  toolCallId: ToolCallId
  title: string
  kind: 'read' | 'edit' | 'execute' | 'other'
}

type ToolUpdatedEvent = {
  type: 'tool.updated'
  turnId: TurnId
  toolCallId: ToolCallId
  status: 'pending' | 'in_progress' | 'completed' | 'failed'
  content: readonly ToolContent[]
}
```

The adapter removes raw tool metadata. It keeps only content that the product displays.

### Plan

ACP sends each plan as a complete replacement. The canonical event keeps the same replacement rule.

```ts
type PlanEntry = {
  content: string
  status: 'pending' | 'in_progress' | 'completed'
  priority: 'high' | 'medium' | 'low'
}

type PlanUpdatedEvent = {
  type: 'plan.updated'
  turnId: TurnId
  entries: readonly PlanEntry[]
}
```

The web projector replaces the current plan. It does not merge plan entries.

### Session usage

`usage_update` reports current context use and optional cumulative cost. It does not report token use for one turn.

```ts
type SessionUsage = {
  usedTokens: number
  sizeTokens: number
  cost: { state: 'reported'; amount: number; currency: string } | { state: 'unavailable' }
}

type SessionUsageUpdatedEvent = {
  type: 'session.usage.updated'
  usage: SessionUsage
}
```

The web application derives remaining tokens and percentage from `usedTokens` and `sizeTokens`. The event does not duplicate these values.

Usage support is optional in ACP. The adapter emits no usage event when the coding agent supplies no usage data.

### Session metadata and failures

```ts
type SessionMetadataUpdatedEvent = {
  type: 'session.metadata.updated'
  update: { title: string; updatedAt?: Instant } | { title?: never; updatedAt: Instant }
}

type SessionFailedEvent = {
  type: 'session.failed'
  error: CodingAgentError
}
```

`session.metadata.updated` cannot contain an empty update. The session catalog remains the current metadata source for a reconnect.

`session.failed` means the active session cannot accept more commands. An active turn first emits a failed `turn.finished` event.

### Permissions

```ts
type PermissionRequestedEvent = {
  type: 'permission.requested'
  turnId: TurnId
  permissionId: PermissionId
  toolCallId: ToolCallId
  title: string
  options: readonly PermissionOption[]
}

type PermissionResolvedEvent = {
  type: 'permission.resolved'
  turnId: TurnId
  permissionId: PermissionId
  outcome: { type: 'selected'; optionId: string } | { type: 'cancelled' }
}
```

The host never selects an allow option automatically.

The client answers with `sessionId`, `turnId`, `permissionId`, and `optionId`.

The host emits `permission.resolved` after the ACP response succeeds. This event clears the request for all connected clients.

Every canonical event has one `eventId`. The receiver uses this value to remove duplicate events within one session.

The adapter keeps an ACP event ID when one exists. It creates an ID once for each event that the host derives.

## Application Ports

Port names describe capabilities. Concrete names include the provider or transport.

| Port                 | Responsibility                            | First implementation          |
| -------------------- | ----------------------------------------- | ----------------------------- |
| `SessionCatalog`     | Read stored session metadata              | `GrokSessionCatalog`          |
| `CodingAgent`        | Open or create a coding-agent session     | `GrokAcpCodingAgent`          |
| `CodingAgentSession` | Control one active coding-agent process   | `GrokAcpSession`              |
| `HostEventPublisher` | Publish canonical events to relay targets | `WebSocketHostEventPublisher` |
| `Clock`              | Return the current protocol time          | `SystemClock`                 |

ACP clients and subprocess helpers are infrastructure details. They are not application ports.

### Coding-agent contracts

```ts
interface CodingAgent {
  open(input: OpenCodingSession): Promise<Result<CodingAgentSession, OpenSessionError>>

  create(input: CreateCodingSession): Promise<Result<CreatedCodingSession, CreateSessionError>>
}

type OpenCodingSession = {
  session: SessionSummary
  emit: EmitCodingSessionEvent
}

type CreateCodingSession = {
  cwd: string
  emit: EmitCodingSessionEvent
}
```

```ts
interface CodingAgentSession {
  readonly sessionId: SessionId

  startTurn(input: StartTurn): Promise<Result<TurnAccepted, StartTurnError>>

  cancelTurn(turnId: TurnId): Promise<Result<TurnCancelled, CancelTurnError>>

  answerPermission(
    input: AnswerPermission,
  ): Promise<Result<PermissionAnswered, AnswerPermissionError>>

  close(): Promise<Result<void, CloseSessionError>>
}
```

The event callback belongs to the session lifecycle. It does not belong to each prompt.

## Application State

`ActiveSession` is the domain entity. It enforces the turn and permission state.

```ts
type ActiveSessionState =
  | { state: 'idle' }
  | { state: 'running'; turnId: TurnId }
  | {
      state: 'awaiting_permission'
      turnId: TurnId
      permissionId: PermissionId
      allowedOptionIds: ReadonlySet<string>
    }
  | { state: 'failed'; error: CodingAgentError }
```

`ActiveSessionRegistry` is an application service. It stores each `ActiveSession` with its `CodingAgentSession` runtime.

## Application Handlers

The relay entrypoint dispatches each request to one handler.

| Request             | Handler            |
| ------------------- | ------------------ |
| List host sessions  | `ListSessions`     |
| `session.open`      | `OpenSession`      |
| `session.create`    | `CreateSession`    |
| `session.close`     | `CloseSession`     |
| `turn.start`        | `StartTurn`        |
| `turn.cancel`       | `CancelTurn`       |
| `permission.answer` | `AnswerPermission` |

Handlers coordinate domain state and ports. They do not parse ACP or build WebSocket envelopes.

## AG-UI Design Insights

AG-UI is a design reference, not a runtime dependency.

We use these ideas:

1. Separate session, turn, message, and tool identifiers.
2. Use explicit start, delta, and completion events.
3. Use a complete snapshot for replay and ordered events for live work.
4. Keep event semantics independent from the transport.
5. Keep reasoning separate from assistant text.

We do not use AG-UI `RAW`, `CUSTOM`, or generic state patches in the first implementation.

ACP tool state does not match AG-UI tool argument streaming. The canonical model keeps ACP-independent tool status and content.

## Module Layout

```text
apps/host/src/
├── entrypoints/
│   ├── cli/
│   └── relay/
├── application/
│   ├── handlers/
│   ├── ports/
│   └── active-session-registry.ts
├── domain/
│   ├── active-session.ts
│   └── errors/
├── infrastructure/
│   ├── acp/
│   ├── grok/
│   ├── relay/
│   ├── system/
│   └── app-deps.ts
└── main.ts
```

```text
packages/core/src/
├── coding-session-event.ts
├── identity.ts
├── protocol.ts
└── session.ts
```

`coding-session-event.ts` owns canonical schemas. `protocol.ts` only owns request, response, routing, and version envelopes.

## References

- [ACP overview](https://agentclientprotocol.com/protocol/v1/overview)
- [ACP session setup](https://agentclientprotocol.com/protocol/v1/session-setup)
- [ACP prompt turn](https://agentclientprotocol.com/protocol/v1/prompt-turn)
- [AG-UI architecture](https://docs.ag-ui.com/concepts/architecture)
- [AG-UI events](https://docs.ag-ui.com/concepts/events)
