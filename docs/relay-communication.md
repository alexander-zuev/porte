# Relay Communication

## Authority

This document defines the communication contract for the Porte relay.

It owns the Host WebSocket protocol, Host methods, relay calls, errors, ordering, and reconnect behavior.

This contract replaces the old pre-release protocol. It does not provide backward compatibility.

## Summary

The relay and Host use JSON-RPC 2.0 over authenticated WebSockets.

Each WebSocket text message contains one JSON-RPC document. Porte does not use batch documents or binary messages.

JSON-RPC owns the envelope. Porte owns method names and all values inside `params`, `result`, and `error.data`.

The two Host method registries have four groups:

1. Queries read conversations or stored events.
2. Commands change one conversation.
3. Conversation list notifications update the relay list.
4. Active conversation notifications replace or increment current state.

## Connection Model

One `porte up` process owns one control connection and zero or more conversation connections.

```text
Host daemon
├─ control WebSocket → HostRelayAgent(hostId)
└─ conversation WebSockets
   ├─ conversation-a → ConversationAgent(conversation-a)
   └─ conversation-b → ConversationAgent(conversation-b)

Browser
├─ control WebSocket → HostRelayAgent(hostId)
└─ active chat WebSocket → ConversationAgent(conversationId)
```

A WebSocket stays attached to one Durable Object after its upgrade. Direct access to multiple conversation objects requires multiple WebSockets.

One shared Host WebSocket would require `HostRelayAgent` to inspect and forward every conversation message. That would keep it in the data path.

### Connection lifecycle

`porte up` opens the control connection and keeps it open until shutdown, unpairing, revocation, or a terminal protocol failure.

The Host opens a conversation connection lazily when the control plane requests `conversation.attach`.

The Host reuses an open conversation connection. It does not close and reopen the connection for each turn.

A conversation connection closes for one of these reasons:

- The conversation is removed.
- The Host daemon stops.
- The pairing is revoked.
- A terminal protocol error makes the connection unsafe.

`conversation.close` stops the active coding-agent process. It does not close the conversation WebSocket by itself.

Both relay Agents disable hibernation while a socket is open. Pending request timers and stream writers remain in memory.

### Connection profiles

The final wire has two Porte JSON-RPC profiles.

| Profile           | Endpoint object     | Purpose                                                                       |
| ----------------- | ------------------- | ----------------------------------------------------------------------------- |
| Host control      | `HostRelayAgent`    | Host lifecycle, conversation registry, authorization, and connection control. |
| Host conversation | `ConversationAgent` | Conversation reads, commands, events, state replacement, and recovery.        |

The control profile uses `porte.host-control.v1`.

The conversation profile uses `porte.host-conversation.v1`.

Browser connections continue to use the Agents SDK protocol. Relay object calls continue to use Agent RPC. ACP connections continue to use ACP.

### Method ownership

The control registry owns these methods:

- `conversations.list`
- `conversation.create`
- `conversation.attach`
- `conversation.updated`
- `conversation.removed`

The initial protocol has no `conversation.detach` method. It keeps each data connection until its defined close condition occurs.

The conversation registry owns these existing methods:

- `conversation.close`
- `turn.start` and `turn.cancel`
- `conversation.configuration.set`
- `permission.answer` and `elicitation.answer`
- `conversation.state` and `conversation.event`

Conversation messages do not repeat `conversationId` after the connection selects one `ConversationAgent`. The connection identity is authoritative.

The two profiles use separate method registries.

## Domain Language

The protocol uses product concepts. It does not name storage or presentation mechanics as domain types.

| Type                | Meaning                                                |
| ------------------- | ------------------------------------------------------ |
| `Conversation`      | One conversation shown in the conversation list.       |
| `Turn`              | One user request and its agent work.                   |
| `Message`           | User or assistant content inside a conversation.       |
| `Permission`        | One agent action that requires a user decision.        |
| `Elicitation`       | One agent request for user data or consent.            |
| `ConversationState` | The complete current state of one active conversation. |
| `ConversationEvent` | One ordered change inside a conversation.              |

Messages, turns, permissions, and elicitations belong to one conversation. They are not separate Host resources.

One ordered `ConversationEvent` union carries their changes. This preserves the order between all changes.

ACP uses `session` at the provider boundary. Porte maps ACP `session/update` notifications to `ConversationEvent` values.

Porte does not expose a `SessionEvent` type. A session is not a Porte product concept.

### Removed types

The relay contract does not use these removed types:

- `ConversationIdentity`
- `ConversationSummary`
- `ConversationPage`
- `ConversationPageQuery`
- `ConversationTranscript`
- `ConversationStateSnapshot`
- `ConversationListRevision`

Use these operation and domain types:

- `Conversation`
- `ListConversationsParams`
- `ListConversationsResult`
- `ConversationState`

`Conversation` is the complete list representation. The protocol does not maintain separate identity and summary representations.

`ListConversationsResult` can contain a limited result set and a cursor. Its type does not model a page.

## Protocol Ownership

| Connection                   | Protocol                    | Owner              |
| ---------------------------- | --------------------------- | ------------------ |
| Host to relay                | JSON-RPC 2.0 over WebSocket | JSON-RPC and Porte |
| Relay object to relay object | Agent RPC                   | Cloudflare         |
| Browser to relay object      | Agents SDK client           | Cloudflare         |
| Host to coding agent         | ACP over standard I/O       | ACP                |

Porte uses the protocol that owns each connection. It does not wrap Agent RPC or ACP in JSON-RPC again.

## JSON-RPC 2.0

### Standard concepts

JSON-RPC 2.0 defines these concepts:

- A request has `jsonrpc`, `id`, `method`, and optional `params`.
- A notification has `jsonrpc`, `method`, and optional `params`. It has no `id`.
- A success response has `jsonrpc`, `id`, and `result`.
- An error response has `jsonrpc`, `id`, and `error`.
- A response has exactly one of `result` or `error`.

The request and notification names are standard JSON-RPC names. Porte did not invent them.

The `result | error` response structure is also standard JSON-RPC. Porte only defines the values inside these members.

### WebSocket relation

WebSocket supplies a persistent, ordered message transport. JSON-RPC supplies the application message format.

Every relay-to-Host and Host-to-relay application message uses JSON-RPC. Close messages remain WebSocket protocol messages.

One WebSocket message contains one complete JSON-RPC document. A JSON-RPC document never spans multiple WebSocket messages.

The WebSocket subprotocol carries the Porte protocol version. Porte does not repeat that version in each JSON-RPC document.

### Porte choices

JSON-RPC does not define these Porte choices:

- WebSocket as the transport.
- One JSON-RPC document per WebSocket message.
- No batch documents.
- Text messages only.
- UUID version 7 request identifiers.
- The Host method names.
- Strict Porte payload schemas.
- The application error payload.
- The WebSocket subprotocol value.

### Generic method definition

The JSON-RPC module owns the generic method definition. Host terminology does not belong in this type.

```ts
export const JSON_RPC_METHOD_KINDS = {
  request: 'request',
  notification: 'notification',
} as const

export type JsonRpcMethodKind = (typeof JSON_RPC_METHOD_KINDS)[keyof typeof JSON_RPC_METHOD_KINDS]

export type JsonRpcMethodDefinition =
  | {
      readonly kind: typeof JSON_RPC_METHOD_KINDS.request
      readonly params: z.ZodType
      readonly result: z.ZodType
    }
  | {
      readonly kind: typeof JSON_RPC_METHOD_KINDS.notification
      readonly params: z.ZodType
    }
```

The union prevents a notification definition from containing a `result` schema.

### Envelope validation

The generic envelope schemas reject unknown members. A subprotocol version change must introduce an incompatible envelope change.

The schemas still enforce these rules:

- `jsonrpc` equals `"2.0"`.
- A request has an `id`.
- A notification has no `id`.
- A success response has `result` and no `error`.
- An error response has `error` and no `result`.

Each Porte-owned `params`, `result`, and `error.data` schema uses `z.strictObject`. Unknown domain fields fail at the receiving boundary.

Each receiver parses and validates untrusted data once. Typed internal calls do not validate the same value again.

The sender uses the method registry types. It does not parse its own typed value before encoding.

### Decode result

`decodeJsonRpc` returns `better-result` because decode failures are expected values.

```ts
function decodeJsonRpc(text: string): Result<JsonRpcDocument, JsonRpcDecodeError>
```

It returns `Result.ok(document)` or `Result.err(protocolError)`.

Porte never sends a `better-result` object over WebSocket. The wire keeps the standard JSON-RPC `result | error` structure.

### Request identifiers

JSON-RPC permits a string, number, or `null` request identifier. Porte accepts only UUID version 7 strings.

```ts
export const HostRequestIdSchema = z.uuidv7().brand<'HostRequestId'>()
```

UUID version 7 is a Porte choice. It gives each request a typed, unique, time-ordered identifier.

The request identifier correlates one response with one request. It is not an idempotency key.

Each command defines repeat safety from its domain data. For example, `turnId` identifies one logical turn.

### Responses and errors

JSON-RPC has no `ok` member. A caller distinguishes the two response shapes.

Success:

```json
{
  "jsonrpc": "2.0",
  "id": "0198f97b-9cf1-7f05-9e9d-df1647d7a821",
  "result": null
}
```

Failure:

```json
{
  "jsonrpc": "2.0",
  "id": "0198f97b-9cf1-7f05-9e9d-df1647d7a821",
  "error": {
    "code": -32000,
    "message": "The conversation is busy.",
    "data": {
      "_tag": "CONVERSATION_BUSY",
      "message": "The conversation is busy."
    }
  }
}
```

The `error.data` value resembles HTTP Problem Details only in purpose. Both carry structured failure data for a caller.

They are different contracts. JSON-RPC uses `error.code`, `error.message`, and optional `error.data`.

JSON-RPC has no HTTP 4xx or 5xx classes. It defines reserved numeric codes for protocol and server failures.

|     Code | Meaning           |
| -------: | ----------------- |
| `-32700` | Parse error.      |
| `-32600` | Invalid request.  |
| `-32601` | Method not found. |
| `-32602` | Invalid params.   |
| `-32603` | Internal error.   |

Porte uses `-32000` for every expected application failure.

```ts
export const HOST_APPLICATION_ERROR_CODE = -32_000
```

The closed error payload in `error.data` carries the Porte error tag. Porte does not map error tags to numeric codes.

`jsonRpcError` requires an explicit code. A caller cannot misclassify a protocol or internal failure as an application failure.

Unknown failures become `-32603`. The relay logs the failure once and sends no private details.

## Host Method Registries

Each connection profile has one method registry. A registry defines every allowed method, kind, params schema, and result schema.

```ts
export const HostControlMethods = {
  'conversations.list': {},
  'conversation.create': {},
  'conversation.attach': {},
  'conversation.updated': {},
  'conversation.removed': {},
} as const satisfies Record<string, JsonRpcMethodDefinition>

export const HostConversationMethods = {
  'conversation.close': {},
  'turn.start': {},
  'turn.cancel': {},
  'conversation.configuration.set': {},
  'permission.answer': {},
  'elicitation.answer': {},
  'conversation.state': {},
  'conversation.event': {},
} as const satisfies Record<string, JsonRpcMethodDefinition>
```

The short entries show the required names. Each real entry contains `kind`, `params`, and applicable `result` schemas.

Each registry is the only source for its method names. Code derives method unions and envelope schemas from it.

| Group                             | Direction     | JSON-RPC kind | Purpose                                         |
| --------------------------------- | ------------- | ------------- | ----------------------------------------------- |
| Queries                           | Relay to Host | Request       | Read authoritative Host data.                   |
| Commands                          | Relay to Host | Request       | Change one conversation.                        |
| Conversation list notifications   | Host to relay | Notification  | Increment the relay conversation list.          |
| Active conversation notifications | Host to relay | Notification  | Replace or increment active conversation state. |

Queries and commands need responses, so they are requests. Notifications do not need responses, so they have no `id`.

### Responses are not acknowledgments

A query response carries the requested value or an error.

A command response reports immediate acceptance or rejection. It does not report later domain events.

A notification has no response. Porte does not add an acknowledgment method or result frame for notifications.

Stable domain identifiers correlate later events. For example, a permission result uses `permissionId`, not the JSON-RPC request identifier.

Each connection keeps pending request identifiers, methods, timeouts, and resolvers in memory. Closing the connection rejects all pending requests.

The pending request map is correlation state. It is not a durable ledger and never causes automatic command replay.

## Queries

### `conversations.list`

This request reads conversations. It does not create a separate catalog concept.

```ts
type ListConversationsParams = {
  cursor?: ConversationCursor
  limit: number
}

type ListConversationsResult = {
  conversations: readonly Conversation[]
  next?: ConversationCursor
}
```

The cursor is an opaque position in one in-memory Host snapshot. The result type does not expose a page abstraction.

The snapshot exists only for the current control connection. A stale cursor returns a typed application error.

The relay restarts the request after a stale cursor. It replaces its cache only after the complete traversal succeeds.

## Commands

`conversation.create` returns the new `Conversation`. Each other command returns `null` after the Host accepts the operation.

### `conversation.create`

This request creates one conversation in a validated workspace.

Its params contain `creationId` and `cwd`. `creationId` is the UUID version 7 idempotency key for this creation.

The Host returns the first result for a repeated key with the same params. It rejects the same key with different params.

The Host stores a claim before it calls the provider. The claim prevents concurrent or post-crash duplicate creation.

The Host completes the claim with the created `Conversation`. An incomplete claim returns a conflict and requires a new `creationId`.

The relay updates its cache from the result. The Host does not send an immediate duplicate `conversation.updated` notification.

### `conversation.attach`

This control request asks the Host to open or reuse one data connection.

Its params contain `conversationId`. It returns `null` after the data WebSocket opens and sends initial state.

The Host does not store the request. A repeated request reuses the open connection.

### `conversation.close`

This request stops the active agent process for one conversation. It does not delete the conversation.

The operation succeeds when no active process remains. A repeated close also succeeds.

If a turn is active, the Host sends its cancelled `turn.finished` event before the close result.

### `turn.start`

This request starts one turn with one client-owned `turnId` and one user message.

The Host loads the conversation process when necessary. An active matching `turnId` does not send a second prompt.

The Host does not resend initial state before this command. This preserves the submitted user message.

The response confirms acceptance. Ordered notifications report all later turn changes.

### `turn.cancel`

This request cancels one active turn. It also cancels pending permissions and elicitations for that turn.

The response confirms acceptance. A `turn.finished` event reports the final outcome.

### `conversation.configuration.set`

This request sets one configuration option on one active conversation.

The Host validates the option identifier, value type, and allowed value. A later event carries the complete configuration state.

### `permission.answer`

This request answers one pending permission. Its params identify the conversation, turn, permission, and selected option.

The Host validates the pending request and option. A later event reports the resolved permission.

### `elicitation.answer`

This request answers one pending elicitation. Its params carry a valid form response or URL decision.

The Host validates the response against the pending elicitation. A later event reports the resolved elicitation.

## Conversation List Notifications

### `conversation.updated`

This notification carries the complete `Conversation`.

It creates or replaces one relay list entry. It replaces the old `conversation.summary` name and shape.

The Host sends it only for changes after creation. The creation result already updates the same relay cache.

### `conversation.removed`

This notification carries one `conversationId`. It removes one relay list entry and its child object.

## Active Conversation Notifications

### `conversation.state`

This notification carries the complete current `ConversationState` for one active conversation.

The relay replaces its local state with this value.

The Host sends current state first on each data connection. It also sends state after it loads a provider process.

### `conversation.event`

This notification carries one ordered `ConversationEvent`.

The relay applies events in WebSocket order. A handler failure closes the connection and causes state replacement after reconnect.

### Why state and event remain separate

`conversation.state` replaces all current state. `conversation.event` applies one ordered change.

These operations have different merge rules. One combined optional shape would make invalid states possible.

The old `summary` and `snapshot` names described reduced representations. The contract uses owned domain values.

## Conversation Events

`ConversationEvent` is one discriminated union. Its members cover these changes:

- Turn lifecycle and conversation failures.
- User messages, assistant messages, and reasoning.
- Tools, plans, usage, and configuration.
- Permission and elicitation requests or resolutions.
- Conversation metadata and available commands.

The union preserves one order across all changes. Separate streams could reorder a permission against its tool call or turn.

Domain identifiers remain in the applicable events. Porte does not add a transport event identifier or sequence.

## Delivery and Ordering

WebSocket preserves message order while one connection remains open. It does not preserve delivery across reconnects.

The Host sends active conversation notifications in this order:

1. Send `conversation.state` for an active conversation.
2. Send later `conversation.event` notifications in domain order.

The relay applies control and data notifications in WebSocket order.

The Host serializes requests on each connection. A later cancel cannot pass an earlier start request.

JSON-RPC notifications have no response. Porte does not add an acknowledgment envelope that changes their standard meaning.

State replacement provides recovery. Porte does not claim exactly-once WebSocket delivery.

## Reconnect and Repeat Safety

After a control reconnect, the relay requests `conversations.list` until `next` is absent.

The relay discards its partial list read if the control connection closes.

The Host sends `conversation.state` first after each data reconnect. This state repairs notifications missed while disconnected.

JSON-RPC request identifiers do not survive as mutation keys. Each command owns its repeat behavior:

- Creation uses a creation idempotency key in `params`.
- A live Host process uses the active `turnId` to prevent a second prompt.
- Close and cancel define idempotent final states.
- Configuration sets an explicit value.
- Interaction answers identify one pending interaction.

The Host never retries an unknown external mutation automatically. A timeout can have an indeterminate result.

The relay does not queue a command while the Host is offline. It returns `HostOfflineError` and lets the user retry.

After reconnect, the relay reads the list or receives current conversation state.

It does not replay generic command records.

## Storage Ownership

Porte stores product state. It does not store WebSocket delivery state.

| Owner               | Durable state                               | In-memory state                                        |
| ------------------- | ------------------------------------------- | ------------------------------------------------------ |
| Host provider       | Conversation history                        | None                                                   |
| Host daemon         | Creation claims and results                 | Active processes, turns, permissions, and elicitations |
| `HostRelayAgent`    | Conversation metadata cache and Agent state | Current control connection work                        |
| `ConversationAgent` | Agent state and AIChat messages             | Current data connection and stream work                |

The Host creation claim contains `creationId`, `cwd`, and a status. A completed claim also contains the created `Conversation`.

The complete conversation list traversal replaces the relay cache atomically. A partial traversal never changes the visible cache.

The relay cache has no automatic expiry or arbitrary row limit. Full list results and removal notifications control its contents.

The control cache and child registry authorize a conversation child. Porte does not store a separate access flag.

### Removed transport storage

The redesign removes these records and schedules:

- Host command, response, event, and event-head records.
- Parent operation records, waiters, offline queues, and cleanup schedules.
- Child event, snapshot, event-head, active-turn, and projection records.
- Event acknowledgment and replay state.
- Conversation list revision and expiry state.

The child applies live events directly to Agent state, AIChat messages, and the active browser stream.

A browser reconnect reads Agent state and AIChat messages from `ConversationAgent`.

The Host turn continues without a browser stream.

## Relay Boundaries

Relay objects exchange typed values through Agent RPC. They do not exchange JSON text.

The Host relay entrypoint parses JSON-RPC. It then calls one typed application handler.

The browser uses the Agents SDK contract. It does not send Host JSON-RPC documents.

No JSON-RPC envelope type appears in an Agent RPC or browser method signature.

## Error Ownership

| Boundary                   | Failure channel            | Owner                                |
| -------------------------- | -------------------------- | ------------------------------------ |
| Host WebSocket decode      | JSON-RPC protocol error    | Host relay entrypoint                |
| Host query or command      | JSON-RPC application error | Application handler and relay mapper |
| Agent RPC domain failure   | Closed tagged union        | Called relay object                  |
| Agent RPC platform failure | Throw                      | Cloudflare runtime                   |
| Browser call               | Agents SDK error contract  | Browser boundary                     |
| ACP call                   | Typed adapter error        | ACP adapter                          |

The code that creates an error does not log it. The owning entrypoint logs the final error once.

Raw provider errors, process output, paths, prompts, and causes never cross the Host boundary.

## Validation

The receiver validates each untrusted boundary value once.

The Host WebSocket receiver performs these steps:

1. Require a text WebSocket message.
2. Decode JSON with `decodeJsonRpc`.
3. Validate the generic JSON-RPC envelope.
4. Select the method definition from the connection profile registry.
5. Validate the strict Porte payload schema.
6. Dispatch the typed value.

The response receiver selects the result schema from the in-memory pending request. A response does not contain a method name.

The relay limits message size before JSON parsing. It rejects binary messages and batch documents.

Logs can contain method names, safe identifiers, error tags, and bounded sizes. They never contain conversation content.
