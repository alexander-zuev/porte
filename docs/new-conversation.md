# New conversation from the phone

## Goal

The pencil next to a project creates a Grok conversation in that repository and opens it, empty. One tap; the composer is the first prompt. No form, no page.

## Flow

```
pencil click  →  createConversation({ cwd: project.gitRoot })      server fn, POST
              →  hosts.findPairing(user) → hostRelay.createConversation(hostId, { cwd })
              →  DO: hostSocket.request('conversation.create') → save → bump conversationsVersion
              →  host: CreateConversation → ACP session/new → ConversationSummary   (exists, tested)
success       →  invalidate ['conversation','list'] → navigate /conversations/$id
failure       →  error toast; the pencil is enabled again
```

While the mutation runs, that pencil is disabled. While the relay reports the machine offline, every pencil is disabled.

## Contracts (new)

```ts
// server/application/ports/host-agent-client.ts
createConversation(hostId: HostId, params: { cwd: string }): Promise<ConversationSummary>
// HostRelayClient: `once`, not `repeatable` — the host opens one session per call.

// server/entrypoints/functions/conversation.fn.ts
export const createConversation = createServerFn({ method: 'POST' })
  .middleware([requireAuth])
  .validator(z.object({ cwd: z.string().min(1) }))
  .handler(…): Promise<ConversationSummary>
// Unpaired → NotAuthorizedError. Host offline → HostOfflineError (existing mapping).

// entities/conversation/conversation-mutations.ts
create: () => ({ mutationKey: ['conversation', 'create'], mutationFn: createConversation })

// features/conversations/hooks/use-create-conversation.ts
useCreateConversation(): { create(cwd: string): void; pendingCwd: string | undefined }
```

## Files

| Add                                                       | Owns                                          |
| --------------------------------------------------------- | --------------------------------------------- |
| `entities/conversation/conversation-mutations.ts`         | mutation options                              |
| `features/conversations/hooks/use-create-conversation.ts` | mutation → invalidate → navigate; error toast |

| Change                                                               | What                               |
| -------------------------------------------------------------------- | ---------------------------------- |
| `ports/host-agent-client.ts`, `durable-objects/host-relay-client.ts` | `createConversation`               |
| `functions/conversation.fn.ts`                                       | server fn                          |
| `features/conversations/components/project-list.tsx`                 | pencil gets `onCreate`, `disabled` |
| `pages/conversations/conversations-page.tsx` and its story           | pass the action through            |

| Delete                                                                                                      | Why              |
| ----------------------------------------------------------------------------------------------------------- | ---------------- |
| `features/conversation-create/`, `pages/new-conversation/`, `.storybook/pages/new-conversation.stories.tsx` | the form is gone |

## Out of scope

Typing a new path (only known repositories), MCP servers.

## Proof

1. Unit: server fn resolves the account's host id and calls the relay; unpaired → `NotAuthorizedError`.
2. Live (tunnel): pencil on `porte` → lands on an empty conversation, the list shows it, the first prompt answers.
3. `dev:up` stopped → pencils disabled.
