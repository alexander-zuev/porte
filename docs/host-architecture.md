# Host Architecture

## Status and Authority

This document defines the target host architecture for the first Porte release.

[The product specification](./spec.md) owns product scope and published behavior. This document defines the host design that implements it.

The current host code implements conversation discovery, CLI resume, and the outbound relay. It does not implement this complete target yet.

## Summary

The host lets a remote client control local coding-agent conversations. Provider protocols do not cross the host adapter boundary.

```text
Phone PWA
  -> Worker authentication
  -> Host Durable Object
  -> routed WebSocket request
  -> host relay entrypoint
  -> application handler
  -> ActiveConversation
  -> CodingAgent port
  -> Grok ACP adapter
  -> local Grok process
```

Events use the reverse path. The web application projects canonical events into `UIMessage` parts.

The host uses direct handlers. Each relay method has one handler and no local persistence transaction.

## Goals

1. Implement every host behavior in the product specification.
2. Keep ACP and Grok types inside the Grok adapter.
3. Preserve one current conversation view across replay and live updates.
4. Make retries, cancellation, and reconnect safe.
5. Return stable errors without exposing content or raw failures.

## Non-Goals

1. Attach to an open terminal interface.
2. Expose a file browser or interactive terminal.
3. Advertise ACP filesystem or terminal capabilities.
4. Support conversation deletion, fork, extra roots, or MCP injection.
5. Persist conversation content in the relay.

## Invariants

| Invariant                                             | Owner                                  |
| ----------------------------------------------------- | -------------------------------------- |
| One agent process exists for each open conversation.  | `ActiveConversationRegistry`           |
| One active turn exists in each conversation.          | `ActiveConversation`                   |
| A repeated `turnId` never sends a second prompt.      | `ActiveConversation`                   |
| A repeated `requestId` never repeats a mutation.      | `RequestLedger`                        |
| Only a catalog path can start or load a conversation. | Create and open handlers               |
| Replay completes before live delivery starts.         | `ConversationEventRouter`              |
| `conversation.snapshot` replaces the complete view.   | `ActiveConversation` and web projector |
| Every permission and elicitation waits for the user.  | `ActiveConversation`                   |
| Cancellation stops later process and file effects.    | ACP boundary and process controller    |
| Raw provider values never enter public events.        | Grok adapter                           |

## Current State

The current code is an earlier delivery slice. Implementation must replace these contracts.

| Current code                                         | Target state                                        |
| ---------------------------------------------------- | --------------------------------------------------- |
| `protocol.ts` publishes `conversation.update`.       | Publish the event families in this document.        |
| `conversation.open` returns no complete snapshot.    | Publish `conversation.snapshot` before live events. |
| Messages contain text only.                          | Use canonical rich content.                         |
| Tools support four kinds.                            | Support all nine product tool kinds.                |
| Permission requests receive an automatic answer.     | Store each request until the user answers.          |
| The adapter advertises filesystem methods.           | Advertise no filesystem or terminal methods.        |
| Configuration, commands, and elicitation are absent. | Map all capability-gated inputs.                    |
| Errors expose `GROK_UNAVAILABLE`.                    | Use provider-independent agent codes.               |

Confirm external protocol use before removing current shapes. If an external client exists, use an overlap period.

## Design Constraints

`packages/core` owns published Zod schemas and inferred types. Runtime boundaries parse unknown data with these schemas.

The host uses `better-result`. Expected failures return `Result.err(TaggedError)`. Only programmer defects can escape as thrown values.

The host daemon owns local process state. The Durable Object owns public routing state for one paired host.

The relay can hold payloads in memory. It does not persist or log prompts, messages, tool output, diffs, or responses.

Optional ACP features remain capability-gated. The adapter records only safe names and counts for unsupported data.

## Alternatives Considered

### Raw ACP relay

This design couples the relay and PWA to ACP. It also exposes unsafe extension data.

### Canonical events with direct handlers

This design keeps provider changes local. It gives domain models clear ownership of state, replay, and interactions.

### Generic state patches

This design makes invalid patches representable. It hides replacement rules and makes replay checks harder.

## Recommendation

Use canonical events with direct handlers. Keep one provider adapter, one conversation model, and one composition root.

Do not add generic provider, raw, custom, or patch events.

## Boundaries

| Boundary       | Input             | Output                     | Must not cross            |
| -------------- | ----------------- | -------------------------- | ------------------------- |
| Worker         | Public request    | Authenticated route        | Unverified identity       |
| Durable Object | Protocol envelope | Routed envelope            | Local path interpretation |
| Host relay     | Unknown JSON      | Parsed request             | Invalid data              |
| Application    | Typed command     | Typed result or event      | Transport and ACP types   |
| Grok adapter   | Application types | Events and typed errors    | Raw ACP values            |
| Web projector  | Canonical events  | `UIMessage` and view state | Raw ACP values            |

The relay entrypoint owns parsing, dispatch, response conversion, and final error logging.

Handlers own use-case order. Domain models own invariants and state changes.

Infrastructure owns WebSocket, ACP, process, clock, and identifier details.

## Canonical Domain Model

### Content

```ts
type CanonicalContent =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string }
  | { type: 'audio'; data: string; mimeType: string }
  | { type: 'resource'; resource: EmbeddedResource }
  | ResourceLink

type EmbeddedResource = {
  uri: string
  mimeType?: string
  content: { type: 'text'; text: string } | { type: 'blob'; data: string }
}

type ResourceLink = {
  type: 'resource-link'
  uri: string
  name: string
  title?: string
  description?: string
  mimeType?: string
  size?: number
}
```

Text and resource links are baseline inputs. Other content requires the matching negotiated capability.

### Conversation view

`ConversationView` is the only current representation of one open conversation.

```ts
type ConversationView<TPending extends PendingInteractions = PendingInteractions> = {
  items: readonly ConversationItem[]
  tools: readonly ToolView[]
  plan: readonly PlanEntry[]
  usage?: ConversationUsage
  configuration?: readonly ConversationConfigurationOption[]
  commands?: readonly ConversationCommand[]
  pending: TPending
}

type ConversationItem = MessageView | ReasoningView | { type: 'tool'; toolCallId: ToolCallId }

type MessageView = {
  type: 'message'
  messageId: MessageId
  role: 'user' | 'assistant'
  content: readonly CanonicalContent[]
}

type ReasoningView = {
  type: 'reasoning'
  messageId: MessageId
  content: readonly CanonicalContent[]
}
```

A tool appears once in `tools`. A conversation item references it by `toolCallId`.

### Active conversation

```ts
type ActiveConversation = {
  acceptedTurnIds: ReadonlySet<TurnId>
  state: ActiveConversationState
}

type ActiveConversationState =
  | { state: 'idle'; view: ConversationView<NoPendingInteractions> }
  | { state: 'running'; turnId: TurnId; view: ConversationView }
  | { state: 'failed'; error: CodingAgentError; view: ConversationView<NoPendingInteractions> }

type PendingInteractions = {
  permissions: readonly PendingPermission[]
  elicitations: readonly PendingElicitation[]
}

type NoPendingInteractions = {
  permissions: readonly []
  elicitations: readonly []
}
```

`ActiveConversation` applies events and rejects invalid turn or interaction changes.

Each pending interaction must use the active `turnId`. Failure and cancellation clear all pending interactions.

## Canonical Event Model

`packages/core/src/coding-conversation-event.ts` owns these schemas and types.

```ts
type ConversationEvent = {
  eventId: EventId
  conversationId: ConversationId
} & ConversationEventData

type ConversationEventData =
  | ConversationSnapshotEvent
  | TurnStartedEvent
  | MessageEvent
  | ReasoningEvent
  | ToolUpdatedEvent
  | PlanUpdatedEvent
  | ConversationUsageUpdatedEvent
  | ConversationMetadataUpdatedEvent
  | ConversationConfigurationUpdatedEvent
  | ConversationCommandsUpdatedEvent
  | PermissionEvent
  | ElicitationEvent
  | TurnFinishedEvent
  | ConversationFailedEvent

type CodingAgentError = {
  code: 'CODING_AGENT_UNAVAILABLE' | 'REQUEST_TIMEOUT' | 'INTERNAL_ERROR'
  message: string
}

type ConversationFailedEvent = {
  type: 'conversation.failed'
  error: CodingAgentError
}
```

Each receiver removes duplicate `eventId` values within one conversation. It preserves unique arrival order.

The adapter keeps a provider event ID when available. The host creates one stable ID for each derived event.

### Snapshot and conversation

```ts
type ConversationSnapshotEvent = {
  type: 'conversation.snapshot'
  view: ConversationView
}

type TurnStartedEvent = { type: 'turn.started'; turnId: TurnId }

type TurnFinishedEvent = {
  type: 'turn.finished'
  turnId: TurnId
  outcome:
    | { type: 'completed'; reason: 'completed' | 'limit_reached' | 'refused' | 'other' }
    | { type: 'cancelled' }
    | { type: 'failed'; error: CodingAgentError }
}

type MessageEvent =
  | { type: 'message.started'; turnId: TurnId; messageId: MessageId; role: 'user' | 'assistant' }
  | { type: 'message.delta'; turnId: TurnId; messageId: MessageId; content: CanonicalContent }
  | { type: 'message.completed'; turnId: TurnId; messageId: MessageId }

type ReasoningEvent =
  | { type: 'reasoning.started'; turnId: TurnId; messageId: MessageId }
  | { type: 'reasoning.delta'; turnId: TurnId; messageId: MessageId; content: CanonicalContent }
  | { type: 'reasoning.completed'; turnId: TurnId; messageId: MessageId }
```

The snapshot replaces the complete view. The client never merges two replay streams.

All chunks for one message use one `messageId`. The adapter creates an ID only when the agent supplies none.

### Tools

```ts
type ToolKind =
  'read' | 'edit' | 'delete' | 'move' | 'search' | 'execute' | 'think' | 'fetch' | 'other'

type ToolView = {
  toolCallId: ToolCallId
  turnId: TurnId
  title: string
  kind: ToolKind
  status: 'pending' | 'in_progress' | 'completed' | 'failed'
  content: readonly ToolContent[]
  locations: readonly ToolLocation[]
}

type ToolContent =
  | { type: 'content'; content: CanonicalContent }
  | { type: 'diff'; path: string; oldText: string | null; newText: string }

type ToolLocation = { path: string; line?: number }

type ToolUpdatedEvent = {
  type: 'tool.updated'
  tool: ToolView
}
```

Each event replaces its complete `ToolView`. There is no separate `tool.started` event.

The adapter removes raw input, raw output, provider metadata, and unknown extension fields.

### Plan and usage

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

type ConversationUsage = {
  usedTokens: number
  sizeTokens: number
  cost?: { amount: number; currency: string }
}

type ConversationUsageUpdatedEvent = {
  type: 'conversation.usage.updated'
  usage: ConversationUsage
}
```

Each plan event replaces the ordered plan. Each usage event replaces current conversation usage.

The client derives remaining tokens and percentage. Per-turn token use stays outside the protocol.

### Configuration and commands

```ts
type ConversationConfigurationOption = SelectConfiguration | BooleanConfiguration

type SelectConfiguration = {
  type: 'select'
  id: string
  name: string
  description?: string
  category?: string
  currentValue: string
  options: readonly SelectConfigurationValue[]
}

type SelectConfigurationValue = {
  value: string
  name: string
  description?: string
}

type BooleanConfiguration = {
  type: 'boolean'
  id: string
  name: string
  description?: string
  category?: string
  currentValue: boolean
}

type ConversationConfigurationUpdatedEvent = {
  type: 'conversation.configuration.updated'
  options: readonly ConversationConfigurationOption[]
}

type ConversationCommand = {
  name: string
  description: string
  inputHint?: string
}

type ConversationCommandsUpdatedEvent = {
  type: 'conversation.commands.updated'
  commands: readonly ConversationCommand[]
}
```

Each event contains the complete ordered state. Unknown configuration categories remain displayable.

The adapter uses `configOptions` when present. It maps legacy modes only when configuration options are absent.

The client executes a slash command as a normal prompt. The command catalog is conversation state, not conversation content.

### Conversation metadata

```ts
type ConversationMetadataPatch =
  | { title: string | null; updatedAt?: Instant | null }
  | { title?: never; updatedAt: Instant | null }

type ConversationMetadataUpdatedEvent = {
  type: 'conversation.metadata.updated'
  update: ConversationMetadataPatch
}
```

Omitted fields stay unchanged. `null` clears a field. An empty update is invalid.

The event router also updates the host catalog. The Durable Object receives the catalog without polling.

### Permissions

```ts
type PendingPermission = {
  turnId: TurnId
  permissionId: PermissionId
  toolCallId: ToolCallId
  title: string
  options: readonly PermissionOption[]
}

type PermissionOption = {
  optionId: string
  name: string
  kind: 'allow_once' | 'allow_always' | 'reject_once' | 'reject_always'
}

type PermissionEvent =
  | ({ type: 'permission.requested' } & PendingPermission)
  | {
      type: 'permission.resolved'
      turnId: TurnId
      permissionId: PermissionId
      outcome: { type: 'selected'; optionId: string } | { type: 'cancelled' }
    }
```

The host forwards every option. It never selects an allow option without a user response.

### Elicitation

```ts
type FormValue = string | number | boolean

type FormField =
  | { type: 'text'; id: string; label: string; required: boolean; options?: readonly string[] }
  | { type: 'number'; id: string; label: string; required: boolean }
  | { type: 'boolean'; id: string; label: string; required: boolean }

type PendingElicitation = {
  turnId: TurnId
  elicitationId: ElicitationId
  request: { type: 'form'; fields: readonly FormField[] } | { type: 'url'; url: string }
}

type ElicitationAnswer =
  | { type: 'submit'; values: Readonly<Record<string, FormValue>> }
  | { type: 'accept' }
  | { type: 'decline' }
  | { type: 'cancel' }

type ElicitationEvent =
  | ({ type: 'elicitation.requested' } & PendingElicitation)
  | {
      type: 'elicitation.resolved'
      turnId: TurnId
      elicitationId: ElicitationId
      outcome:
        | { type: 'submitted'; values: Readonly<Record<string, FormValue>> }
        | { type: 'accepted' }
        | { type: 'declined' }
        | { type: 'cancelled' }
    }
  | { type: 'elicitation.completed'; turnId: TurnId; elicitationId: ElicitationId }
```

The adapter accepts only the restricted form schema. It rejects sensitive fields and unsupported schema keywords.

`submit` is valid only for a form. `accept` is valid only for a URL.

The PWA shows the complete URL and obtains consent. It does not prefetch the URL.

The host does not advertise request-scoped elicitation outside a conversation.

## Application Ports

| Port                      | Responsibility                           | Grok implementation           |
| ------------------------- | ---------------------------------------- | ----------------------------- |
| `ConversationCatalog`     | List provider-independent conversations. | `GrokConversationCatalog`     |
| `CodingAgent`             | Create or open one conversation.         | `GrokAcpCodingAgent`          |
| `CodingAgentConversation` | Control one open conversation.           | `GrokAcpSession`              |
| `HostEventPublisher`      | Publish canonical events.                | `WebSocketHostEventPublisher` |
| `Clock`                   | Return protocol time.                    | `SystemClock`                 |
| `IdFactory`               | Create host-owned identifiers once.      | `UuidV7IdFactory`             |

ACP clients, Grok storage, subprocess helpers, and WebSocket libraries are infrastructure details.

```ts
interface ConversationCatalog {
  list(): Promise<Result<readonly ConversationSummary[], ConversationCatalogError>>
}

interface CodingAgent {
  create(input: CreateConversation): Promise<Result<OpenedConversation, CreateConversationError>>
  open(input: OpenConversation): Promise<Result<OpenedConversation, OpenConversationError>>
}

type CreateConversation = { cwd: string; routeEvent: RouteConversationEvent }
type OpenConversation = { conversation: ConversationSummary; routeEvent: RouteConversationEvent }

type OpenedConversation = {
  runtime: CodingAgentConversation
  replay: ConversationView
}

type RouteConversationEvent = (
  event: ConversationEvent,
) => Promise<Result<void, ConversationEventRouteError>>

type TurnAccepted = { turnId: TurnId }
type TurnCancelled = { turnId: TurnId }
type PermissionAnswered = { permissionId: PermissionId }
type ElicitationAnswered = { elicitationId: ElicitationId }

type AnswerPermission = {
  turnId: TurnId
  permissionId: PermissionId
  optionId: string
}

type AnswerElicitation = {
  turnId: TurnId
  elicitationId: ElicitationId
  answer: ElicitationAnswer
}

interface CodingAgentConversation {
  readonly conversationId: ConversationId
  startTurn(input: StartTurn): Promise<Result<TurnAccepted, StartTurnError>>
  cancelTurn(turnId: TurnId): Promise<Result<TurnCancelled, CancelTurnError>>
  setConfiguration(
    input: SetConversationConfiguration,
  ): Promise<Result<readonly ConversationConfigurationOption[], SetConfigurationError>>
  answerPermission(
    input: AnswerPermission,
  ): Promise<Result<PermissionAnswered, AnswerPermissionError>>
  answerElicitation(
    input: AnswerElicitation,
  ): Promise<Result<ElicitationAnswered, AnswerElicitationError>>
  close(): Promise<Result<void, CloseConversationError>>
}

type StartTurn = { turnId: TurnId; prompt: readonly CanonicalContent[] }

type SetConversationConfiguration =
  | { optionId: string; value: { type: 'select'; value: string } }
  | { optionId: string; value: { type: 'boolean'; value: boolean } }
```

The event callback belongs to the conversation lifetime. It does not belong to each prompt.

The Grok adapter starts `grok --no-auto-update agent stdio` in the validated workspace.

`GrokConversationCatalog` uses `session/list` when advertised. Otherwise, it reads provider storage.

The adapter follows every list cursor. Provider `_meta` data does not cross the boundary.

## Application Services

### Active conversation registry

`ActiveConversationRegistry` stores each `ActiveConversation` with its `CodingAgentConversation` runtime.

Opening an active conversation returns its current snapshot. It does not start another process.

Closing removes the runtime only after the process stops. A failed stop leaves the conversation in `failed` state.

### Request ledger

```ts
type RequestFingerprint = string & { readonly __brand: 'RequestFingerprint' }

type DaemonMethod = Exclude<ClientMethod, 'host.snapshot'>
type DaemonResult<Method extends DaemonMethod> = ApiResponse<ClientMethodMap[Method]['result']>

type RequestKey<Method extends DaemonMethod> = {
  requestId: RequestId
  method: Method
  fingerprint: RequestFingerprint
}

type RequestClaim<Method extends DaemonMethod> =
  | { state: 'new' }
  | { state: 'pending'; result: Promise<DaemonResult<Method>> }
  | { state: 'completed'; result: DaemonResult<Method> }
  | { state: 'conflict' }

interface RequestLedger {
  claim<Method extends DaemonMethod>(key: RequestKey<Method>): RequestClaim<Method>
  complete<Method extends DaemonMethod>(key: RequestKey<Method>, result: DaemonResult<Method>): void
}
```

The bounded ledger is process-local. It survives relay reconnects because the daemon stays alive.

A repeated pending request waits for the first result. A completed request returns the stored result.

The ledger rejects one `requestId` with a different method or payload fingerprint.

The ledger never evicts an entry during the daemon process lifetime. It rejects new claims when its fixed capacity is full.

The client does not retry an indeterminate mutation after the daemon exits. It first reads current host and conversation state.

### Event router

`ConversationEventRouter` applies each event to `ActiveConversation` before publication.

During open, it collects replay into one `ConversationView`. It buffers live events until snapshot publication completes.

Metadata changes go to the conversation audience and the host catalog audience.

## Application Handlers

| Public method                    | Owner                          | Main sequence                                      |
| -------------------------------- | ------------------------------ | -------------------------------------------------- |
| `host.snapshot`                  | Host Durable Object            | Read host status and cached catalog.               |
| `conversation.create`            | `CreateConversation`           | Validate path, create, register, publish snapshot. |
| `conversation.open`              | `OpenConversation`             | Find summary, open or reuse, publish snapshot.     |
| `conversation.close`             | `CloseConversation`            | Cancel work, close process, remove runtime.        |
| `turn.start`                     | `StartTurn`                    | Claim turn, send prompt, publish acceptance.       |
| `turn.cancel`                    | `CancelTurn`                   | Cancel interactions, cancel turn, enforce stop.    |
| `conversation.configuration.set` | `SetConversationConfiguration` | Validate option, set value, replace state.         |
| `permission.answer`              | `AnswerPermission`             | Validate request and option, answer, resolve.      |
| `elicitation.answer`             | `AnswerElicitation`            | Validate request and data, answer, resolve.        |

Handlers receive parsed inputs. They never parse WebSocket or ACP data.

## Public Protocol

`packages/core/src/protocol.ts` owns request, response, route, and version envelopes.

`packages/core/src/coding-conversation-event.ts` owns event data. `protocol.ts` references those schemas.

```ts
type ClientMethodMap = {
  'host.snapshot': { params: {}; result: HostSnapshot }
  'conversation.create': { params: CreateConversationParams; result: ConversationOpened }
  'conversation.open': { params: OpenConversationParams; result: ConversationOpened }
  'conversation.close': { params: CloseConversationParams; result: {} }
  'turn.start': { params: StartTurnParams; result: TurnAccepted }
  'turn.cancel': { params: CancelTurnParams; result: TurnCancelled }
  'conversation.configuration.set': {
    params: SetConversationConfigurationParams
    result: ConversationConfigurationState
  }
  'permission.answer': { params: AnswerPermissionParams; result: PermissionAnswered }
  'elicitation.answer': { params: AnswerElicitationParams; result: ElicitationAnswered }
}

type ConversationOpened = { conversation: ConversationSummary; turn: ConversationTurnState }
type CreateConversationParams = { cwd: string }
type OpenConversationParams = { conversationId: ConversationId }
type CloseConversationParams = { conversationId: ConversationId }

type StartTurnParams = {
  conversationId: ConversationId
  turnId: TurnId
  prompt: readonly CanonicalContent[]
}

type CancelTurnParams = { conversationId: ConversationId; turnId: TurnId }
type SetConversationConfigurationParams = {
  conversationId: ConversationId
} & SetConversationConfiguration
type ConversationConfigurationState = { options: readonly ConversationConfigurationOption[] }
type AnswerPermissionParams = { conversationId: ConversationId } & AnswerPermission
type AnswerElicitationParams = { conversationId: ConversationId } & AnswerElicitation

type HostStatusEvent = { status: 'online' | 'offline' }
type ConversationsChangedEvent = { catalog: ConversationCatalogState }

type ClientEventMap = {
  'host.status': HostStatusEvent
  'conversations.changed': ConversationsChangedEvent
  'conversation.event': ConversationEvent
}
```

Each request has a client-owned `requestId`. `turn.start` also has a client-owned `turnId`.

The client reuses both identifiers only for the same logical action.

`conversation.event` transports the canonical union. Its nested `type` is the product event name.

## Call Stacks and Data Flow

### Connect and catalog

```text
main
  -> createAppDeps
  -> HostConnector.connect
  -> WebSocketHostRelay.run
  -> Worker verifies daemon token
  -> Host Durable Object accepts socket
  -> ListConversations handler
  -> ConversationCatalog.list
  -> ACP session/list or Grok storage
  -> conversations.changed
  -> Durable Object stores catalog
```

The daemon reconnects with bounded exponential backoff, full jitter, and a maximum delay.

A new authenticated socket replaces the prior host socket. The host publishes a catalog after each reconnect.

### Open conversation

```text
conversation.open envelope
  -> Durable Object adds connection route
  -> host relay parses RoutedRequest
  -> RequestLedger.claim
  -> OpenConversation.execute
  -> ConversationCatalog.list
  -> validate conversation and workspace
  -> reuse ActiveConversation or CodingAgent.open
  -> Grok initialize and session/load
  -> map replay into ConversationView
  -> ActiveConversationRegistry.add
  -> publish conversation.snapshot
  -> open live event gate
  -> return typed result
```

The handler publishes the snapshot before it returns. No live event can arrive first.

### Create conversation

```text
conversation.create envelope
  -> request claim
  -> CreateConversation.execute
  -> validate cwd against catalog paths
  -> CodingAgent.create
  -> Grok initialize and session/new
  -> build ConversationView
  -> register conversation
  -> publish conversations.changed
  -> publish conversation.snapshot
  -> return ConversationOpened
```

A repeated `requestId` returns the same result. It never creates a second conversation.

### Start turn and live updates

```text
turn.start envelope
  -> request claim
  -> StartTurn.execute
  -> ActiveConversation.acceptTurn
  -> CodingAgentConversation.startTurn
  -> ACP session/prompt
  -> turn.started
  -> ACP session/update notifications
  -> Grok canonical mapper
  -> ConversationEventRouter applies and publishes events
  -> ACP prompt result
  -> turn.finished
  -> ActiveConversation.finishTurn
```

A repeated `turnId` returns the first acceptance. It does not send another prompt.

### Configuration and commands

```text
ACP configuration or command update
  -> ACP DTO parser
  -> Grok canonical mapper
  -> complete ordered state
  -> ConversationEventRouter applies replacement
  -> publish conversation event
```

```text
conversation.configuration.set envelope
  -> validate option id, type, and value
  -> ACP session/set_config_option
  -> complete configuration response
  -> apply and publish replacement
  -> typed result
```

### Permission and elicitation

```text
ACP incoming request
  -> Grok DTO parser
  -> canonical requested event
  -> ActiveConversation stores request
  -> publish request
  -> user answer envelope
  -> validate identifiers and value
  -> answer original ACP request
  -> canonical resolved event
  -> remove pending request
  -> publish resolution
```

No default answer exists. A relay disconnect leaves the request pending while the host process stays alive.

### Cancellation and close

```text
turn.cancel envelope
  -> CancelTurn.execute
  -> cancel pending interactions
  -> answer pending ACP requests as cancelled
  -> ACP session/cancel
  -> wait for bounded grace period
  -> stop process group if work continues
  -> turn.finished(cancelled)
```

```text
conversation.close envelope
  -> CloseConversation.execute
  -> cancel active turn when present
  -> ACP session/close when advertised
  -> stop process group when required
  -> remove active runtime
  -> typed result
```

### Timeout and failure

```text
ACP request starts with deadline
  -> deadline expires
  -> send $/cancel_request when advertised
  -> wait for bounded grace period
  -> stop process group when work continues
  -> create typed RequestTimeoutError
  -> relay boundary returns safe error
```

The ACP boundary does not retry requests. A nested retry can duplicate a mutation.

```text
raw ACP, process, or transport failure
  -> infrastructure classifier
  -> typed boundary error with cause
  -> application cleanup or propagation
  -> relay maps ApiError once
  -> relay logs once
  -> error response or conversation.failed
```

During a turn, the host publishes failed `turn.finished` before `conversation.failed`.

Unknown external failures are terminal. The host never classifies failures from message text.

## Error Model

```ts
type HostApplicationError =
  | WorkspaceNotAllowedError
  | ConversationNotFoundError
  | ConversationBusyError
  | TurnNotFoundError
  | PermissionNotFoundError
  | ElicitationNotFoundError
  | InvalidInteractionAnswerError
  | RequestTimeoutError
  | CodingAgentUnavailableError
  | CodingAgentProtocolError
  | CodingAgentProcessError
```

Each error is a `TaggedError` with a stable `_tag`. Infrastructure errors preserve the raw failure as `cause`.

| Internal error                   | Public code                |
| -------------------------------- | -------------------------- |
| Invalid envelope or answer       | `INVALID_REQUEST`          |
| `WorkspaceNotAllowedError`       | `WORKSPACE_NOT_ALLOWED`    |
| `ConversationNotFoundError`      | `CONVERSATION_NOT_FOUND`   |
| `ConversationBusyError`          | `CONVERSATION_BUSY`        |
| `TurnNotFoundError`              | `TURN_NOT_FOUND`           |
| `PermissionNotFoundError`        | `PERMISSION_NOT_FOUND`     |
| `ElicitationNotFoundError`       | `INVALID_REQUEST`          |
| `RequestTimeoutError`            | `REQUEST_TIMEOUT`          |
| Agent start or transport failure | `CODING_AGENT_UNAVAILABLE` |
| Programmer defect                | `INTERNAL_ERROR`           |

The code that creates an error does not log it. The relay entrypoint logs the final error once.

Raw ACP codes, process output, paths, and causes stay inside the host.

## Observability

Metrics use bounded attributes only. These include operation, provider, outcome, error code, and capability.

Metrics never contain account, host, conversation, turn, request, path, prompt, content, or timestamp values.

Logs can contain safe identifiers and operation names. They never contain prompts, messages, diffs, URLs, or form values.

The adapter records only the ACP name and count for ignored updates.

## Security

The Worker authenticates public connections. The host accepts requests only from its authenticated Durable Object connection.

The host validates each workspace against the current catalog. It does not accept an arbitrary local path from the Worker.

The Grok process inherits the account, repository rules, sandbox, hooks, and permission policy.

The adapter advertises no ACP filesystem or terminal capability. Grok remains the execution owner.

Zod validates prompt content, configuration values, permission answers, and elicitation values before use.

## Module Layout

```text
apps/host/src/
├── entrypoints/
│   ├── cli/
│   └── relay/
├── application/
│   ├── handlers/
│   ├── ports/
│   ├── active-conversation-registry.ts
│   ├── request-ledger.ts
│   └── conversation-event-router.ts
├── domain/
│   ├── active-conversation.ts
│   ├── conversation-view.ts
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
├── coding-content.ts
├── coding-conversation-event.ts
├── identity.ts
├── protocol.ts
└── conversation.ts
```

Dependencies flow from entrypoints to application, then domain and application ports. Infrastructure implements ports and depends inward.

`infrastructure/app-deps.ts` is the only composition root. It constructs adapters and injects them into handlers.

## File Change Map

| File or module                                   | Required change                                             |
| ------------------------------------------------ | ----------------------------------------------------------- |
| `packages/core/src/identity.ts`                  | Add `ElicitationId` and keep branded identifiers.           |
| `packages/core/src/coding-content.ts`            | Own canonical content schemas.                              |
| `packages/core/src/coding-conversation-event.ts` | Own event and snapshot schemas.                             |
| `packages/core/src/protocol.ts`                  | Add all methods and route canonical events.                 |
| `packages/core/src/conversation.ts`              | Own catalog, summary, and host snapshot schemas.            |
| `apps/host/src/domain/*`                         | Own conversation state, view replacement, and errors.       |
| `apps/host/src/application/handlers/*`           | Own one use case for each daemon method.                    |
| `apps/host/src/application/ports/*`              | Own agent, catalog, publisher, clock, and ID contracts.     |
| `apps/host/src/infrastructure/acp/*`             | Own JSON-RPC, deadlines, cancellation, and process control. |
| `apps/host/src/infrastructure/grok/*`            | Own Grok parsing and canonical mapping.                     |
| `apps/host/src/infrastructure/relay/*`           | Own outbound WSS and routed envelopes.                      |
| `apps/host/src/infrastructure/app-deps.ts`       | Construct the dependency graph.                             |

Remove automatic permission answers and filesystem handlers after the new interaction flow works.

## RGR TDD Test Plan

Each slice starts with one failing behavior test. Add only the code required to pass, then refactor.

| Slice       | Red test                                                  | Green result                              |
| ----------- | --------------------------------------------------------- | ----------------------------------------- |
| Catalog     | Prefer ACP list; use storage only without the capability. | One ordered canonical catalog.            |
| Open        | Replay completes before snapshot and live events.         | One complete current view.                |
| Create      | Repeat one `requestId`.                                   | One conversation and one process.         |
| Turn        | Repeat one `turnId` while active and after completion.    | One prompt submission.                    |
| Content     | Map supported content and reject unknown data.            | No raw ACP content crosses.               |
| Tools       | Apply replacements for all tool kinds.                    | One current tool view.                    |
| State       | Replace plan, usage, configuration, and commands.         | Ordered state stays canonical.            |
| Metadata    | Set, omit, and clear each mutable field.                  | Catalog and conversation stay equal.      |
| Permission  | Deny, cancel, and reject invalid identifiers.             | No automatic approval.                    |
| Elicitation | Accept form, decline URL, and reject sensitive fields.    | One validated response.                   |
| Cancel      | Continue work after graceful cancel in a test process.    | Process group stops before later effects. |
| Timeout     | Hold one ACP request past its deadline.                   | Cancel request, process stop, safe error. |
| Reconnect   | Drop the relay during a request and live stream.          | No duplicate request, event, or process.  |
| Failure     | Fail process and protocol paths during a turn.            | One log, then ordered failure events.     |

Tests use real Zod schemas and application handlers. They fake only clocks, identifiers, process boundaries, and network boundaries.

The final end-to-end test starts the built host, Worker runtime, Durable Object, test client, and installed Grok process.

It proves the completion flow in the product specification without provider fixtures.

## Risks and Open Questions

### Protocol maturity

ACP session list, select configuration, metadata updates, and conversation close are stable as of this update.

Boolean configuration, usage, request cancellation, and elicitation remain capability-gated. Grok integration tests must verify their installed shapes.

Porte does not expose ACP stability labels. The adapter contains any ACP change.

### Published contract use

Confirm whether a client outside this repository uses the current protocol before implementation changes it.

If one exists, use an overlap period. Otherwise, replace the pre-release contract in one coordinated deployment.

## References

- [Porte product specification](./spec.md)
- [ACP architecture](https://agentclientprotocol.com/get-started/architecture)
- [ACP session list](https://agentclientprotocol.com/rfds/conversation-list)
- [ACP session configuration](https://agentclientprotocol.com/rfds/conversation-config-options)
- [ACP request cancellation](https://agentclientprotocol.com/rfds/request-cancellation)
- [ACP elicitation](https://agentclientprotocol.com/rfds/elicitation)
