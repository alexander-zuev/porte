# Scratch: `session/load` for this chat

Harness check: 2026-08-29.

Live spike: `grok --no-auto-update agent stdio`, 2026-08-27.

This is conversation `01a03ffe-f02b-7660-b33d-3b662ad3df28` (this Host/Grok session).

## List row (`session/list`)

| Field      | Value                                                |
| ---------- | ---------------------------------------------------- |
| id         | `01a03ffe-f02b-7660-b33d-3b662ad3df28`               |
| cwd        | `/Users/az/projects/porte`                           |
| git root   | `/Users/az/projects/porte/` (trailing slash on Grok) |
| title      | ACP transport vs Grok coding-agent split             |
| updated at | 2026-08-27T12:39:20.340887+00:00                     |

These are the facts `Conversation.restore` needs. History is not here.

## Load RPC (`session/load`)

Waited **1090 ms**. History is **not** in the result.

The result was Grok extras only:

- `models.currentModelId`: `grok-4.6`
- `_meta["x.ai/sessionDetail"].title`: same title as the list
- `_meta["x.ai/sessionConfig"]`: model + effort options (not ACP `configOptions`)

No top-level ACP `configOptions` or `modes`.

## History burst (during that wait)

**1199** `session/update` notifications. One session id.

| Update                      | Count |
| --------------------------- | ----- |
| `tool_call`                 | 723   |
| `agent_thought_chunk`       | 300   |
| `agent_message_chunk`       | 100   |
| `user_message_chunk`        | 69    |
| `plan`                      | 6     |
| `available_commands_update` | 1     |

First three: user message, thought, agent message. Last three: tool call, thought, available commands.

When `session/load` returns, that burst is complete. Fold it, then drop the sink.

## Last 10 user messages (this session)

From this Grok session’s later turns (the Host/Grok chat you are in now). Assistant ACP text is omitted: a second live load could not be run in this pass.

1. Finally what you want to change now? Which things to touch
2. OK lets do all changes
3. OK lets commit
4. Lets discuss the target state again — pick open conversation as the other flow
5. Spike: load a single conversation over grok agent stdio. What happens in command / domain / infra?
6. How should open work globally — do we load then wait for events?
7. Define key changes to get there: before/after + application, domain, infra
8. What would `loadSession` do? Why not put it on Conversation?
9. Refactor open conversation end to end, and put this load result in a scratch pad
10. On open, are we supposed to return the messages? Add the last 10 messages to this scratch pad.
