# Conversation configuration switcher

## Summary

A model and effort switcher on the composer. Phone: a drawer from the bottom. Desktop: a menu on the trigger. Rendered entirely from `state.configuration`; mutations go through the existing `setConfiguration` callable. The host learns to expose reasoning effort as a second select option.

## Context / Current State

- `ConversationLiveState.configuration` already carries select options; the composer renders them as dead `<small>` text (`conversation-chat.tsx:95-104`).
- The full model pipe exists: `setConfiguration` callable on `ConversationAgent` → `conversation.configuration.set` → host `SetModel` → ACP `session/set_model`.
- The host rejects every `optionId` except `model` (`conversation-method-handlers.ts:48`); effort is not exposed.
- Grok wire facts (verified by spike, 2026-09-01, grok 1.0.13):
  - `session/new|load` answer `models`: `grok-4.6` (default), `grok-4.5`; each model's `_meta` carries `supportsReasoningEffort`, current `reasoningEffort`, and `reasoningEfforts` (id, label, description, default). grok-4.6: xhigh/high/medium/low; grok-4.5: high/medium/low.
  - Effort set: `session/set_model { sessionId, modelId, _meta: { reasoningEffort } }`. There is no separate method.
  - A `set_model` without `_meta` resets effort to the model's default.
  - `session/set_mode` is a silent no-op; no ACP path to plan/ask/auto modes.
- UI precedent: `ComposerAddMenu` — `usePhone()` picks `Drawer` on a phone, a menu from `md` up, same trigger for both (`composer-add-menu.tsx:39-42`).

## Goals

1. Switch the model from the composer, on phone and desktop.
2. Switch the reasoning effort of the current model.
3. The trigger shows the current model and effort.

## Non-Goals

- A mode switcher (plan / auto / always-approve). Grok exposes no ACP method for it; `always-approve` is already reachable as a command in the `+` menu. Revisit when grok implements `session/set_mode`.
- Boolean configuration options. Grok advertises none; the renderer handles selects only and ignores other option types.

## Invariants

1. The UI invents no options: every row comes from `state.configuration`. New models or efforts appear without a web deploy.
2. `currentValue` is the host's fact. The mutation never writes it locally; the `conversation.configuration.updated` broadcast is the only writer.
3. A model switch resets effort to the model's default (grok behavior). The host re-announces both options after every set, so the UI always agrees.
4. One select option per category: `model` and `effort` are the two `id`s the host emits and the only two the handler accepts.

## Alternatives Considered

### Option 1: Generic select renderer driven by `configuration` (recommended)

One component renders any select option; `model` and `effort` are just the two options present. Caller burden: none on new options. Locality: adding a grok option later is host-only work.

### Option 2: Dedicated Model and Effort components with hardcoded structure

Matches the screenshots pixel-for-pixel with less indirection, but bakes grok's current catalog into web code and needs a deploy for every option change. Rejected: violates invariant 1.

### Option 3: Server-fn mutation instead of the callable

Symmetric with reads, but adds a Worker hop and a new entrypoint for a mutation the socket already carries typed (`cancelTurn`, `answerPermission` precedent). Rejected.

## Proposed Design

Two slices, host first.

### Slice A — host exposes effort

`AcpSessionModels` parses each model's effort `_meta`. `configurationEvents` emits two options. A new `conversation.model.set` method mirrors ACP's `set_model` and carries the model + effort pair; the browser sends the pair it displays, so no layer resolves "current model". `conversation.configuration.set` stays for future generic options; model and effort no longer route through it.

### Slice B — web switcher

`ComposerConfigurationMenu` replaces the dead footer text. Phone drawer / desktop menu, `ComposerAddMenu`-style. A `useSetConfiguration` mutation wraps the callable.

## Types, Interfaces, and APIs

### Host (`acp-content.ts`)

```ts
const reasoningEffortSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string().nullish(),
})

// sessionModelsSchema._meta gains a typed view; unknown keys stay ignored.
const modelMetaSchema = z
  .object({
    reasoningEffort: z.string().optional(),
    reasoningEfforts: z.array(reasoningEffortSchema).optional(),
  })
  .loose()

/** Both selects for one session; effort is absent when the current model has none. */
export function modelsToConfigurationOptions(
  models: AcpSessionModels,
): ConversationConfigurationOption[]
```

### Host port (`coding-agent.ts`)

```ts
export const EFFORT_OPTION_ID = 'effort'

// setModel gains the effort it must preserve or set; undefined = model default.
setModel(
  id: ConversationId,
  modelId: string,
  reasoningEffort?: string,
): Promise<readonly ConversationEvent[]>
```

One method, not two: ACP has one method, and the port mirrors the boundary.

### Host messages

```ts
// SetModel payload gains the optional effort; no new command.
export const setModelSchema = baseCommandSchema.extend({
  name: z.literal('SetModel'),
  conversationId: ConversationIdSchema,
  modelId: z.string().min(1),
  reasoningEffort: z.string().min(1).optional(),
})
```

### Relay protocol (`host-conversation-methods.ts`)

The write path mirrors ACP's `set_model`: the browser sends the pair it displays, so the
intent carries its own context and no layer resolves "current model". Internal method,
same-deploy break allowed.

```ts
'conversation.model.set': {
  kind: JSON_RPC_METHOD_KINDS.request,
  params: z.strictObject({
    modelId: z.string().min(1),
    // Omitted = the model's default effort (grok's own `/model <name>` semantics).
    reasoningEffort: z.string().min(1).optional(),
  }),
  result: EmptyResultSchema,
},
```

`ConversationAgent` gains the matching `@callable setModel(params)`; `setConfiguration`
stays for future generic options but model and effort no longer route through it.

### Host handler (`conversation-method-handlers.ts`)

```ts
'conversation.model.set': async (params, { bus, conversationId }) => {
  await bus.handle(createCommand('SetModel', { conversationId, ...params }))
  return null
},
```

### Web stub (`use-conversation-agent.ts`)

```ts
export type ConversationAgentStub = Pick<
  ConversationAgentClient['stub'],
  'cancelTurn' | 'listCommands' | 'setModel'
>
```

### Web mutation (`features/conversation/hooks/use-set-model.ts`)

```ts
export type SetModelInput = {
  readonly modelId: string
  readonly reasoningEffort?: string
}

/** Pending disables the picker; the new value arrives via the live-state broadcast. */
export function useSetModel(stub: ConversationAgentStub): {
  readonly setModel: (input: SetModelInput) => void
  readonly pending: boolean
  readonly error: Error | undefined
}
// useMutation around stub.setModel(input)
```

### Web component (`features/conversation/components/composer-configuration-menu.tsx`)

```ts
export type ComposerConfigurationMenuProps = {
  readonly options: readonly ConversationConfigurationOption[]
  readonly disabled: boolean
  readonly actions: { readonly onSetModel: (input: SetModelInput) => void }
  readonly pending: boolean
}
// model row click  -> onSetModel({ modelId: clicked })                          — effort resets to default
// effort row click -> onSetModel({ modelId: displayedCurrent, reasoningEffort }) — the pair the user sees

export function ComposerConfigurationMenu(props): ReactNode
// usePhone() ? <ConfigurationDrawer/> : <ConfigurationMenu/>
```

- Trigger (both surfaces): a `PromptInputButton` labeled with the current model name, plus the current effort label when the effort option exists — `Grok 4.6 · High`.
- Desktop menu: `DropdownMenu`; model rows with a check on `currentValue`; `DropdownMenuSub` "Effort" listing effort rows with check.
- Phone drawer: `Drawer` with a local `view: 'root' | 'effort'` state; root = "Select model" rows (name, description, check) + "Effort ›" row; effort view = back chevron + effort rows (label, description, check). Reuses `Row` styling from `ComposerAddMenu` (extract `Row`/`Tile` to a shared module rather than copy).
- A row click calls `actions.onSelect` and closes; rows disable while `pending` or `disabled` (offline / not identified).
- Selects with unknown `id` render nowhere (invariant 4); `boolean` options are ignored.

## Call Stacks and Data Flow

### Set effort (new)

```txt
effort row click ('low', beside model 'grok-4.6')
  -> useSetModel.mutate({ modelId: 'grok-4.6', reasoningEffort: 'low' })
  -> stub.setModel(...)                                     [browser socket callable]
  -> ConversationAgent.setModel -> hostSocket.request('conversation.model.set')
  -> host handler -> SetModel { conversationId, modelId, reasoningEffort }
  -> AcpCodingAgent.setModel -> session/set_model { modelId, _meta: { reasoningEffort: 'low' } }
  -> configurationEvents(session) -> 'conversation.configuration.updated' [model + effort options]
  -> relay reduceLiveState -> setState broadcast -> useAgent state -> menu re-renders with check moved
```

### Set model (changed)

Same stack with `{ modelId }` alone; `AcpCodingAgent.setModel` sends no `_meta`, grok resets effort to the model's default, the session's stored effort updates from the response, and the re-announced effort option carries the new default (invariant 3).

### Failure flow

`hostSocket.request` rejection (offline, unknown option) → callable throws → mutation `error` → one inline line in the menu ("Could not switch. Try again."); no log in the component (the DO boundary already logged). Live state stays on the old value, so the check never lies.

## Files to Add / Change / Delete

| File                                                                            | Work                                                                                                                             |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `apps/host/src/infrastructure/acp/acp-content.ts`                               | Parse effort `_meta`; `modelsToConfiguration` → `modelsToConfigurationOptions` (model + effort)                                  |
| `apps/host/src/infrastructure/acp/acp-coding-agent.ts`                          | `setModel(id, modelId, reasoningEffort?)` sends `_meta`; track effort in `OpenSession`; `configurationEvents` emits both options |
| `apps/host/src/application/ports/coding-agent.ts`                               | `EFFORT_OPTION_ID`; `setModel` signature                                                                                         |
| `apps/host/src/application/handlers/set-model.ts`                               | Pass `reasoningEffort` through                                                                                                   |
| `apps/host/src/domain/messages/commands.ts`                                     | `SetModel` payload gains optional `reasoningEffort`                                                                              |
| `packages/core/src/relay/host-conversation-methods.ts`                          | New `conversation.model.set` method                                                                                              |
| `apps/web/src/server/infrastructure/durable-objects/conversation-agent.ts`      | New `@callable setModel` forwarding to the host                                                                                  |
| `apps/host/src/entrypoints/websocket/conversation-method-handlers.ts`           | Handle `conversation.model.set`                                                                                                  |
| `apps/web/src/features/conversation/hooks/use-conversation-agent.ts`            | Stub pick gains `setModel`                                                                                                       |
| `apps/web/src/features/conversation/hooks/use-set-model.ts`                     | New mutation hook                                                                                                                |
| `apps/web/src/features/conversation/components/composer-configuration-menu.tsx` | New component (drawer + menu)                                                                                                    |
| `apps/web/src/features/conversation/components/composer-add-menu.tsx`           | Extract shared `Row`/`Tile`                                                                                                      |
| `apps/web/src/features/conversation/components/conversation-chat.tsx`           | Replace footer `<small>`s with the menu; wire hook                                                                               |
| `apps/web/src/features/conversation/components/*.stories.tsx`                   | Story first: menu from a fixture (2 models, 4 efforts), phone + desktop viewports                                                |
| `apps/host/tests/unit/*`                                                        | See test plan                                                                                                                    |

## RGR TDD Test Plan

Slice order; each bullet is one red test then green.

1. **Host parse**: `parseSessionModels` on a captured grok `session/new` payload keeps `reasoningEffort` + `reasoningEfforts` per model (fixture from the spike output).
2. **Host options**: `modelsToConfigurationOptions` emits model + effort selects with correct `currentValue`; emits only the model select when the model has no efforts.
3. **Host set effort**: fake ACP process — `SetModel { reasoningEffort }` sends `session/set_model` with `_meta.reasoningEffort` and re-emits both options.
4. **Host model reset**: `SetModel` without effort updates the session's stored effort from the model default and re-announces it.
5. **Host handler**: `conversation.model.set` dispatches `SetModel` with the pair; `conversation.configuration.set` for `model`/`effort` now throws `ConfigurationNotFoundError`.
6. **Web story** (the UI spec): drawer and menu render model rows + effort sub-view from the fixture; pending disables rows. Playwright design snapshot per existing `test:design` setup.
7. **Web hook**: `useSetModel` passes the pair to the stub and reports `pending`/`error` (unit, fake stub).

## Risks and Open Questions

1. ~~Where the effort handler learns the current model~~ — resolved: the browser sends the model + effort pair (`conversation.model.set` mirrors ACP `set_model`), so nothing resolves "current".
2. **Effort copy length**: grok's effort descriptions are sentences; the drawer row truncates — acceptable, or drop descriptions on the phone row.
3. **`configuration` category field**: options already carry `category` (`'model'`); emit `category: 'effort'` accordingly — the UI keys on `id`, `category` stays informational.
4. **Trigger placement**: replacing the footer `<small>`s changes the composer layout slightly on `md+`; the story shows both breakpoints before wiring.
