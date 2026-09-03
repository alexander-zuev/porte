# Shared Grok sessions

The terminal and the phone are two clients of one Grok session. The code is the contract; this page keeps the Grok facts the code cannot show on one screen.

## Where it lives

| Fact                                       | Source                                                                                                                   |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Host joins Grok's shared process           | `apps/host/src/infrastructure/grok/grok-launch.ts` (`--leader`)                                                          |
| Daemon turns it on for the TUI             | `hook-installer.ts` `enableLeaderMode`, `[cli] use_leader = true` in `~/.grok/config.toml`                               |
| Turns come from the stream                 | `apps/host/src/infrastructure/acp/acp-update-mapper.ts`                                                                  |
| A prompt binds to its echo                 | `apps/host/src/domain/conversation/conversation.ts` `requestTurn`, `handlers/start-turn.ts`, `ports/attempt-bindings.ts` |
| Relay streams a turn nobody here asked for | `conversation-agent.ts` `collectForeignTurn`                                                                             |
| Proof against real Grok                    | `apps/host/tests/live/grok-shared-session.test.ts`, `host-shared-session.test.ts`                                        |

## Grok facts (grok 1.0.13)

1. `grok agent leader` is one process per machine on `~/.grok/leader.sock`. Every `grok` started with `--leader`, or with `use_leader = true`, is its client. The TUI registers as `grok-pager-leader-cli`. Grok reads the key at start: one restart after `/rc on`.
2. Sessions live in the leader. Any client loads any session, prompts it, cancels it, and receives every update. Prompts from several clients queue and run one at a time. A turn survives the disconnect of the client that started it.
3. `session/close` from any client ends the session for all. The Host never sends it.
4. Permission requests fan out to every client. The first answer wins; the other copies stay open. A tool that leaves `pending` while its request is parked here was answered elsewhere.
5. The end of a turn never arrives on `session/update`. Live it is `_x.ai/session_notification` with `turn_completed` (`stop_reason`, `usage`); inside a `session/load` replay the same frame is on `_x.ai/session/update`.
6. `_meta.promptIndex` rides only on `user_message_chunk`. After a cancel Grok inserts a hidden chunk (`hideFromScrollback`) that takes a prompt slot and has no `turn_completed`.
7. Grok re-broadcasts a session's history to every client holding it when another client loads it, stamped `_meta.isReplay`. Outside a load those frames are dropped.
8. Grok writes the session's git root facet only after the first turn, with a trailing separator.

## Out of scope

Sessions started before `use_leader` was set run off the leader: replay at open, no live turn.
