# Conversation list activity indicators

## Summary

Show one trailing indicator for each conversation row.

1. Show a spinner while Porte owns an active turn.
2. Show a blue dot after that turn produces an unseen assistant message and stops.
3. Show no trailing indicator in all other states.

The relay owns active-turn facts. The current web client owns seen state. Do not persist unread state.

## Evidence

The headless probes establish a provider-neutral turn boundary.

- `codex exec --ephemeral --json` emitted `turn.started`, one completed assistant item, then `turn.completed`.
- `grok --single ... --output-format streaming-json` emitted text records, then `end` with `stopReason`.
- Grok ACP gives the stronger integration contract. `session/update` carries assistant chunks. `session/prompt` returns terminal metadata.

Official references: [Codex non-interactive mode](https://developers.openai.com/codex/noninteractive) and [Grok headless and ACP](https://docs.x.ai/build/cli/headless-scripting).

Porte already maps Grok ACP into canonical lifecycle events. It emits `turn.started` and one terminal `turn.finished` in [grok-event-mapper.ts](../../apps/host/src/adapters/grok/grok-event-mapper.ts#L62).

The host also reports its active turns during catalog sync in [host-controller.ts](../../apps/host/src/application/host-controller.ts#L126). The relay currently uses them only for child recovery.

The parent Agent state contains only host status and catalog revision. It drops turn activity before the browser can use it in [host-relay-agent.ts](../../apps/web/src/server/infrastructure/durable-objects/host-relay-agent.ts#L564).

The current conversation row has no trailing chevron in [project-list.tsx](../../apps/web/src/features/conversations/components/project-list.tsx#L115). The supplied references confirm that the idle state stays empty.

## Goals

- Update indicators from the existing host WebSocket and parent Agent state.
- Mark only turns that this web client observes. Never infer unread state from stored history.
- Clear the blue dot when the conversation is open.
- Keep provider details outside the browser and Durable Object.

## Non-goals

- Durable unread state across reloads, tabs, devices, or accounts.
- Unread counts or more than one dot for a conversation.
- Detection of turns started outside Porte.
- A Codex adapter. Codex only validates the provider-neutral contract.

## Alternatives considered

### Use `updatedAt`

Reject this option. Metadata changes do not prove an active turn or a new assistant message. Initial history would also create false dots.

### Subscribe to every conversation child

Reject this option. It creates one browser socket per row. Some child Agents do not exist until a successful transcript read.

### Project activity through the parent Agent

Use this option. The parent already receives every ordered conversation event and already has one browser connection.

Cloudflare Agent state persists in SQLite and broadcasts changes to connected clients. See [Store and sync state](https://developers.cloudflare.com/agents/runtime/lifecycle/state/).

## Contracts

Add a small activity projection to the existing parent state.

```ts
export type RelayActiveConversation = {
  readonly conversationId: ConversationId
  readonly turnId: TurnId
  readonly hasAssistantMessage: boolean
}

export type HostRelayState = {
  readonly hostStatus: 'online' | 'offline'
  readonly catalogRevision: number
  readonly activeConversations: readonly RelayActiveConversation[]
}

export type ConversationTurnStatus = 'idle' | 'running'
export type ConversationAttentionStatus = 'none' | 'unseen'

export function normalizeHostRelayState(input: unknown): HostRelayState
```

Presence means the conversation has an active turn. No active boolean is stored.

`turnId` lets the reducer ignore a replayed terminal event for an older turn. `hasAssistantMessage` proves that this turn produced an assistant message.

Keep `ActiveConversationTurn` on the Mac protocol unchanged. The relay uses its `conversationId` and `turnId`.

Normalize old persisted `HostRelayState` values once during `HostRelayAgent.onStart()`. A missing `activeConversations` becomes an empty array.

## Relay state reduction

Add one pure reducer beside `HostRelayState`.

```ts
reduceHostRelayActivity(
  state: HostRelayState,
  input:
    | { type: 'sync'; activeTurns: readonly ActiveConversationTurn[] }
    | { type: 'snapshot'; conversationId: ConversationId; turn: ConversationTurnState }
    | { type: 'event'; conversationId: ConversationId; event: ConversationEvent },
): HostRelayState
```

Apply these rules:

1. `turn.started` adds the conversation with `hasAssistantMessage: false`.
2. An assistant `message.started` changes that conversation to `hasAssistantMessage: true`.
3. `turn.finished` removes the conversation.
4. `conversation.failed` removes the conversation's turn.
5. A sync replaces the active set but preserves the message flag only for the same `turnId`.
6. A terminal event removes the entry only when its `turnId` matches.

All rules are idempotent. A repeated host event cannot create another turn or another unseen message.

Reduce parent state before child forwarding and host acknowledgment. Event replay makes every reduction idempotent.

## Web client state

Add a client-only attention provider under `RelayProvider`. The existing relay layout keeps this provider mounted across list, conversation, and account routes.

The provider keeps one render state value and three refs:

```ts
const unseenConversationIds: ReadonlySet<ConversationId>
const previousActiveConversations: React.RefObject<
  ReadonlyMap<ConversationId, RelayActiveConversation>
>
const openedConversationIds: React.RefObject<ReadonlySet<ConversationId>>
const visibleConversationId: React.RefObject<ConversationId | null>
```

The first relay snapshot is a baseline. It never creates a blue dot.

For each later snapshot, find conversations present in the previous set but absent from the next set. Mark a conversation unseen only when all conditions are true:

- The previous turn has `hasAssistantMessage: true`.
- This browser opened the conversation before the turn completed.
- The conversation is not the visible conversation.
- The conversation disappeared from the active set.

Opening a conversation clears its unseen entry. A completion while that conversation is visible does not create an unseen entry.

A full page reload creates a new baseline and clears all dots. This behavior prevents historical conversations from appearing unread.

## Presentation

`useConversationList` combines query rows with attention state and returns a view-ready item.

```ts
type ConversationListItem = {
  readonly conversation: ConversationSummary
  readonly turnStatus: ConversationTurnStatus
  readonly attentionStatus: ConversationAttentionStatus
}
```

Turn and attention are independent facts. The shared trailing slot renders `running`, then `unseen`, then nothing.

Use one fixed-width trailing slot at the right edge of `ConversationLink`.

- `running`: existing gray `Spinner`, with `aria-label="Conversation is running"`.
- `unseen`: an 8px circle using `bg-status-info`, with `aria-label="New message"`.
- `none`: an empty slot with no accessible content.

Match the reference images: center the spinner or dot in the slot. Keep the row height unchanged.

Keep the title flexible and truncated. The fixed slot prevents text movement when the indicator changes.

## Call stacks

### Start and stream

```text
Grok ACP or future Codex adapter
  -> canonical turn.started
  -> host event ledger
  -> HostRelayAgent
  -> reduceHostRelayActivity
  -> setState(activeConversations)
  -> useAgent
  -> conversation row spinner
```

### Finish and mark unseen

```text
assistant message.started
  -> active turn records hasAssistantMessage
turn.finished
  -> active turn is removed
  -> attention provider compares relay snapshots
  -> unseenConversationIds adds conversationId
  -> conversation row blue dot
```

### Mark seen

```text
conversation route mounts
  -> attention action marks conversation visible
  -> unseenConversationIds removes conversationId
conversation route unmounts
  -> attention action clears the visible conversation
```

## Harness decision

Keep Grok ACP. Do not replace it with `streaming-json`. ACP already separates chunks from terminal metadata and supports session control.

Keep `CodingAgent.activeTurns()` for reconnect recovery. Add a provider contract test that requires this lifecycle:

```text
one turn.started
zero or more assistant message events
one turn.finished
activeTurns contains the turn only between start and finish
```

A future Codex adapter maps `turn.started`, assistant `item.*`, and `turn.completed` or `turn.failed` into this same contract.

## Files

- Change `packages/core/src/relay/host-relay-state.ts`: state types, normalization, and the pure activity reducer.
- Change `apps/web/src/server/infrastructure/durable-objects/host-relay-agent.ts`: reduce sync, snapshot, and event activity.
- Add `apps/web/src/entities/conversation/conversation-attention.ts`: pure client reducer and indicator projection.
- Add `apps/web/src/entities/conversation/conversation-attention-context.tsx`: mounted client state and visible-conversation actions.
- Change `apps/web/src/entities/host/relay-context.tsx`: mount the attention provider from reactive Agent state.
- Change `apps/web/src/routes/_auth/_relay/conversations/$conversationId.tsx`: mark its conversation visible while mounted.
- Change the list model and `apps/web/src/features/conversations/components/project-list.tsx`: pass and render the indicator.
- Change `apps/web/.storybook/pages/conversations.stories.tsx`: add none, running, unseen, and running-over-unseen stories.
- Add `packages/core/tests/unit/host-relay-state.test.ts` and `apps/web/tests/unit/conversation-attention.test.ts`.
- Change `apps/web/tests/integration/host-relay-agent.test.ts`: prove parent state updates through the real Agent entrypoint.

No database migration, new socket, polling, or package is required.

## RGR test plan

1. Add reducer tests for start, assistant message, finish, replay, sync, and old-state normalization. Then implement the relay projection.
2. Add attention tests for baseline, unseen finish, visible finish, no-output finish, and clearing on open. Then implement client state.
3. Add list stories for all indicator states. Then implement the fixed trailing slot.
4. Add one relay integration test that sends canonical events and reads parent Agent state. Then wire the Durable Object.
5. Run host and web unit tests, web integration tests, typecheck, lint, and Storybook design tests.

## Completion proof

- A running turn shows a spinner within one parent state update.
- A stopped turn with assistant output shows one blue dot when its conversation is not visible.
- An idle conversation without an unseen message has no trailing indicator.
- Opening that conversation clears the dot.
- Initial list load and full reload show no historical blue dots.
- A turn without an assistant message never shows a blue dot.
- Replay and catalog sync do not create duplicate or false indicators.
