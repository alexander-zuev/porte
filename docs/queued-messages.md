# Queued messages

> Temporary. The code is the contract; delete this file once the browser wiring lands and the stories carry the UX.

Send while a turn runs. The message waits in a visible queue, runs when the turn ends, and can be reordered, sent now, removed, or read.

## Where it lives

| What                                | Where                                                                                                                                          |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Queue rows, drain, callables        | `apps/web/src/server/infrastructure/durable-objects/conversation-agent.ts`                                                                     |
| Row markers and selectors           | `apps/web/src/lib/conversation/conversation-state-messages.ts`                                                                                 |
| UI: pill, sheet, drag, message page | `apps/web/src/features/conversation/components/composer-queue.tsx`                                                                             |
| Stories (the UX spec)               | `apps/web/.storybook/design-system/composer-queue.stories.tsx`                                                                                 |
| Proof                               | `apps/web/tests/integration/conversation-agent.test.ts` (`ConversationAgent queue`), `apps/web/tests/unit/conversation-state-messages.test.ts` |

Host and Core: unchanged.

## Flows

| Flow                  | Behaviour                                                                     |
| --------------------- | ----------------------------------------------------------------------------- |
| Queue                 | Turn runs, Enter queues. Pill counts. Sheet lists run order.                  |
| Auto-run              | Turn ends: every queued message folds into one user message, one turn starts. |
| Send now              | Cancels the running turn; that row starts alone; the rest stay queued.        |
| Reorder, remove, read | In the sheet: drag, `×`, tap the words for the message page.                  |
| Stop, failed turn     | The queue drains, same as Grok.                                               |
| Reload, other device  | The queue is relay rows, visible everywhere.                                  |
| Machine offline       | Rows stay; drains when the machine is back and idle.                          |
| Not supported         | Steering; edit (later).                                                       |

## Decisions

1. **The relay owns the queue, as SDK message rows with a marker.** Grok queues a second `session/prompt` internally and exposes no withdraw over stdio (`x.ai/queue/*` answers `Method not found`), so the queue must sit above the Host.
2. **Not the SDK's `messageConcurrency` or `Agent.queue()`.** The first is in-memory with no per-item cancel; the second never flushes on wake and is not broadcast. `saveMessages` and `waitUntilStable` are used; nothing else is hand-rolled.
3. **All at once on drain; Send now sends one row alone.**
4. **Stop drains.** No held state.
5. **No inline queued bubbles.** Pill and sheet only, so the transcript stays the Host's transcript.
6. **One composer button while a turn runs:** Stop when empty, the arrow (which queues) with text.

## Spike facts (Grok 1.0.13, ACP v1, 2026-09-01)

- A second `session/prompt` on a running session is queued server-side and announced by `_x.ai/queue/changed`; the request pends until the first turn ends.
- `session/cancel` ends the running prompt `cancelled` and Grok starts its queued prompt at once.
- ACP spec is silent on concurrent prompts; RFD #1261 `session/inject` (queue, steer) is open. The v2 draft is not implemented by Grok.

## Left to do

Browser hook and composer wiring (`useMessageQueue`, `ConversationChat`), then delete this file.
