# Porte Product Specification

## Goal

Porte lets a user control local coding-agent conversations from a phone.

Grok through ACP is the first integration. The product protocol does not expose ACP or Grok types.

The host starts a separate coding-agent process. It does not attach to an open terminal interface.

## Success

### Conversation control

1. A user can list, create, open, and close conversations from a phone.
2. Opening a conversation restores its complete current view before live events start.
3. A user can start and cancel one active turn in each conversation.
4. A retry never creates a second conversation or sends a second prompt.
5. An open local terminal interface remains unchanged.

### Coding experience

1. The phone shows messages, reasoning, tools, plans, usage, and conversation metadata.
2. The phone shows the current model, mode, and other conversation configuration.
3. The phone shows available slash commands.
4. Permissions and elicitation always wait for an explicit user response.
5. Cancellation prevents later command or file side effects from that turn.

### Access and reliability

1. Each account can access only its paired host.
2. The host makes only outbound public connections.
3. The relay does not store or log conversation content.
4. Reconnect and replay do not create duplicate events.
5. A host or agent failure produces one safe, visible failure.

## Scope

### In scope

- Multi-user accounts and one paired host for each account.
- A host daemon, Worker, and one Durable Object for each host.
- An authenticated PWA for complete remote coding-conversation control.
- Grok through ACP v1, behind provider-independent application contracts.
- Text, rich content, tools, permissions, elicitation, plans, usage, configuration, and commands.

### Out of scope

- Attachment to a live terminal interface.
- Multiple paired hosts for one account.
- Cloud sandboxes, SSH, Computer Use, and wake-on-LAN.
- A general file browser or interactive terminal in the PWA.
- ACP v2 draft features and provider extension payloads.

Conversation deletion is outside the first release. The first release does not expose coding-agent authentication or logout on the phone.

## System Design

```text
Phone PWA  --WSS-->  Worker  -->  Host Durable Object
                                      ^
                                      | outbound WSS
                                  Host daemon
                                      |
                           Coding-agent adapter
                                      |
                              Local agent process
```

The Worker authenticates public connections. The Durable Object routes messages for one host.

The host daemon owns coding-agent processes. The daemon does not listen on a public port.

The first adapter starts `grok --no-auto-update agent stdio`. It uses the installed Grok account and local repository.

The relay can process conversation payloads in memory. It does not persist or log prompts, messages, tool output, diffs, or user responses.

## Product Capabilities

### Conversation operations

| Product operation   | ACP v1 operation                   | Required behavior                                              |
| ------------------- | ---------------------------------- | -------------------------------------------------------------- |
| Connect agent       | `initialize`                       | Check version and capabilities before conversation work.       |
| List conversations  | `session/list` or provider storage | Return one provider-independent catalog.                       |
| Create conversation | `session/new`                      | Accept only an allowed workspace path.                         |
| Open conversation   | `session/load`                     | Finish replay before live delivery.                            |
| Start turn          | `session/prompt`                   | Accept one active turn for each conversation.                  |
| Cancel turn         | `session/cancel`                   | Stop the agent process if graceful cancellation fails.         |
| Close conversation  | `session/close`                    | Cancel work and release process resources.                     |
| Set configuration   | `session/set_config_option`        | Replace configuration with the complete returned state.        |
| Cancel request      | `$/cancel_request`                 | Cancel timed-out non-turn requests when the agent supports it. |

The host uses `session/list` when the agent advertises it. A provider adapter can use provider storage when the method is unavailable.

The web open flow does not use `session/resume`. That method does not replay conversation history.

### ACP input coverage

| ACP input                       | Product event or action                 |
| ------------------------------- | --------------------------------------- |
| Completed `session/load` replay | `conversation.snapshot`                 |
| Accepted prompt                 | `turn.started`                          |
| `user_message_chunk`            | `message.*` with user role              |
| `agent_message_chunk`           | `message.*` with assistant role         |
| `agent_thought_chunk`           | `reasoning.*`                           |
| `tool_call`, `tool_call_update` | `tool.updated`                          |
| `plan`                          | `plan.updated`                          |
| `usage_update`                  | `conversation.usage.updated`            |
| `session_info_update`           | `conversation.metadata.updated`         |
| `config_option_update`          | `conversation.configuration.updated`    |
| `current_mode_update`           | Configuration fallback for older agents |
| `available_commands_update`     | `conversation.commands.updated`         |
| `session/request_permission`    | `permission.requested`                  |
| Permission response             | `permission.resolved`                   |
| `elicitation/create`            | `elicitation.requested`                 |
| Elicitation response            | `elicitation.resolved`                  |
| `elicitation/complete`          | `elicitation.completed`                 |
| Prompt result                   | `turn.finished`                         |
| Process or protocol failure     | `conversation.failed`                   |

The host supports every input in this table when the agent provides it. Optional data can be absent without failing the conversation.

### Content

The canonical content model supports ACP text, image, audio, embedded resource, and resource-link content.

Text and resource links are baseline prompt inputs. Image, audio, and embedded resources require the matching agent capability.

The adapter keeps an ACP `messageId` when the agent supplies one. It creates a stable ID only when the agent supplies none.

The web projector converts canonical content into `UIMessage` parts. Raw ACP content never reaches the web application.

### Tools

The product supports these tool kinds:

`read`, `edit`, `delete`, `move`, `search`, `execute`, `think`, `fetch`, and `other`.

A tool event contains its current title, status, display content, and file locations. Each update replaces the current tool view.

Display content supports regular content and diffs. A diff uses `oldText: null` for a new file.

Raw tool input, raw tool output, provider metadata, and unknown extension fields do not cross the adapter boundary.

### Plans and usage

Each `plan.updated` event contains the complete ordered plan. The client replaces its current plan.

Each `conversation.usage.updated` event contains used context tokens, total context tokens, and optional cumulative cost.

The client derives remaining tokens and percentage. The protocol does not send these derived values.

Per-turn token accounting stays outside this release because ACP v1 does not define it as stable conversation state.

### Conversation configuration

The product supports ACP select and boolean configuration options when capability negotiation permits them.

Each configuration update contains the complete ordered configuration state. The client replaces its current state.

Configuration categories can identify model, mode, model settings, and reasoning level. Unknown categories remain displayable.

The host uses `configOptions` when the agent provides them. It maps legacy conversation modes only when configuration options are absent.

### Slash commands

Each command update contains the complete ordered command catalog. The client replaces its current catalog.

A command contains its name, description, and optional input hint. The client sends execution as a normal prompt.

The command catalog is conversation state. It is not a conversation message.

### Permissions

The host forwards every permission option. It never selects an allow option without a user response.

The user can select one advertised option. Turn cancellation resolves each pending permission as `cancelled`.

The host validates the conversation, turn, permission, and option identifiers before it answers the agent.

### Elicitation

The first release supports conversation-scoped form and URL elicitation. Request-scoped elicitation outside a conversation is not advertised.

Form elicitation accepts only the restricted ACP schema. The PWA validates data before submission.

URL elicitation shows the complete target URL and requires consent. The PWA does not prefetch the URL.

The user can accept, decline, or cancel. Sensitive values never use form elicitation.

### Conversation metadata

Conversation title and update time can change or clear. Omitted fields remain unchanged, and `null` clears a value.

The conversation catalog is the reconnect source. A metadata event updates the current catalog without polling.

## Deliberate ACP Exclusions

The host does not advertise ACP filesystem or terminal capabilities. Grok runs its own tools under its local sandbox and permission policy.

Supporting `fs/*` or `terminal/*` would make the host the execution owner. That design needs a separate sandbox and security specification.

The host ignores unknown `_meta` values and unsupported extension updates. It records only safe names and counts for diagnostics.

The first release does not use conversation fork, conversation delete, additional workspace roots, or MCP server injection.

## Public Protocol

Zod schemas in `packages/core/src` define the published HTTP and WebSocket contract.

### Identifier ownership

| Identifier       | Owner                                     |
| ---------------- | ----------------------------------------- |
| `hostId`         | Worker when the daemon first connects     |
| `connectionId`   | Durable Object for each client socket     |
| `requestId`      | Client for one logical request            |
| `turnId`         | Client for one logical turn               |
| `conversationId` | Coding agent                              |
| `eventId`        | Provider adapter or host                  |
| `messageId`      | Coding agent when present, otherwise host |
| `toolCallId`     | Coding agent                              |
| `permissionId`   | Host for one incoming permission request  |
| `elicitationId`  | Coding agent when present, otherwise host |

The client reuses `requestId` and `turnId` when it retries the same logical action.

### Client methods

| Method                           | Purpose                                       |
| -------------------------------- | --------------------------------------------- |
| `host.snapshot`                  | Read host status and conversation catalog.    |
| `conversation.create`            | Create and open a conversation.               |
| `conversation.open`              | Open a conversation and receive its snapshot. |
| `conversation.close`             | Close the active remote conversation.         |
| `turn.start`                     | Start one prompt turn.                        |
| `turn.cancel`                    | Cancel the active turn.                       |
| `conversation.configuration.set` | Set one advertised configuration value.       |
| `permission.answer`              | Answer one pending permission.                |
| `elicitation.answer`             | Answer one pending elicitation.               |

### Client events

| Event family                                                              | Purpose                                     |
| ------------------------------------------------------------------------- | ------------------------------------------- |
| `host.*`, `conversations.*`                                               | Host availability and conversation catalog. |
| `conversation.snapshot`, `conversation.metadata.*`, `conversation.failed` | Conversation state and lifecycle.           |
| `turn.*`, `message.*`, `reasoning.*`                                      | Conversation lifecycle.                     |
| `tool.*`, `plan.*`, `conversation.usage.*`                                | Coding progress and resource state.         |
| `conversation.configuration.*`, `conversation.commands.*`                 | User controls and command discovery.        |
| `permission.*`, `elicitation.*`                                           | Required user interactions.                 |

Every event has `eventId` and `conversationId`. The receiver removes duplicates within one conversation and preserves unique arrival order.

`conversation.snapshot` replaces the current conversation view. It contains conversation items, tools, plan, usage, configuration, commands, and pending interactions.

Live events do not start until the snapshot has been published. A reconnect opens the conversation again and replaces the old view.

### Errors

Errors contain a stable provider-independent code and safe user text. Raw process and ACP errors stay inside the host.

Each error has one logging point at the owning entrypoint. Logs include safe identifiers and operation names, not conversation content.

## Security

The Worker derives the host and connection role from verified credentials. The WebSocket URL contains no credentials or routing identity.

The host validates each workspace path against its current conversation catalog. The Worker treats local paths as opaque strings.

Pairing uses the OAuth device authorization grant. The daemon receives a conversation, not a bespoke token, so there is no separate credential for the server to hash. [UX Flows](./ux-flows.md) holds the pairing design.

WSS protects transport data. End-to-end encryption is outside the first release.

## Reliability

The daemon reconnects with bounded backoff. A new authenticated daemon socket replaces the prior socket for that host.

The Durable Object uses WebSocket attachments for routing. It does not depend on an in-memory request map.

The host applies deadlines to ACP requests. Timeout handling sends `$/cancel_request` when supported and then stops the process when required.

The host first sends `session/cancel` for turn cancellation. It kills the process group when work continues after the deadline.

## Delivery Slices

| Slice | Outcome                                                    | Completion proof                                                |
| ----- | ---------------------------------------------------------- | --------------------------------------------------------------- |
| 1     | Local host can list and resume Grok conversations.         | Existing CLI and Grok integration tests pass.                   |
| 2     | Remote backend controls complete coding conversations.     | A client completes every public method through Worker and host. |
| 3     | Accounts and pairing isolate each host.                    | Two accounts cannot access each other's host.                   |
| 4     | Phone PWA exposes the complete approved coding experience. | A phone completes the end-to-end acceptance flow.               |

Slice 2 includes all host protocol behavior in this specification. Slice 4 projects the same contract into the PWA.

## Completion Proof

One automated flow starts the built host, Worker runtime, Durable Object, test client, and installed Grok process.

The flow proves these results:

1. The client lists, creates, opens, and closes a real conversation.
2. Replay and live events produce one current conversation view without duplicates.
3. Configuration, commands, plans, usage, permissions, and elicitation reach the client when Grok supplies them.
4. Permission denial and turn cancellation prevent later command or file side effects.
5. Disconnect and reconnect do not duplicate a prompt, event, conversation, or agent process.

The final product check uses a second account on another network. It can access only its paired host and complete the same coding flow.

## Decisions

1. Porte controls a separate coding-agent process and never attaches to a live terminal interface.
2. The product protocol uses canonical events and never exposes ACP or provider payloads.
3. The host stays outbound-only, and Cloudflare provides the meeting point.
4. One Durable Object coordinates one host, not one conversation.
5. The first execution owner remains the coding agent, not the ACP client.

## Host Design

[Host Architecture](./host-architecture.md) defines the ports, canonical types, call stacks, errors, modules, and test plan.
