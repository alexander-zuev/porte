# Grok ACP — Host decisions

Live `grok agent stdio`. Only what changes Host code.

## Process

One stdio process (`GrokAcpClient`). Many sessions. Two chats can `session/prompt` at the same time; both returned `end_turn`.

`AcpSession` does not own a process.

## Session lifecycle

| UX                                    | ACP                                                                                                    |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| New chat                              | `session/new` then `session/prompt`                                                                    |
| Open with history                     | `session/load` (replays `session/update`; result is config only)                                       |
| Process back, DO already has messages | `session/resume` (no replay)                                                                           |
| Send a message                        | `session/prompt`                                                                                       |
| Stop the live slot                    | `session/close` then `session/prompt` → `unknown session id`. Same process still accepts `session/new` |
| Delete forever                        | **No ACP method.** `close` is not delete                                                               |

## Turns

Grok does **not** reject a second `session/prompt` on the **same** `sessionId`. Both completed `end_turn`.

Host must serialize one turn per `AcpSession` if the product is one-at-a-time. ACP will not do it.

`session/cancel` is a **notification** (no result). Idle cancel is silent; a later prompt still works. Cancel during a prompt → `stopReason: cancelled`. A second cancel does not error.

There is no `isPrompting` flag. “Turn running” = our in-flight `session/prompt` Promise.

## Snapshot

No get. Keep `view` by folding `session/update` (load + live). That is `conversation.get`.
