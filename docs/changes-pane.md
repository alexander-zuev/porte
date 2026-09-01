# Diff sheet

Roadmap item 2. A pill above the composer says how much of the working tree is uncommitted. It opens a sheet: the files as a tree or list, tracked and untracked, and one file's diff on tap. Read-only: no stage, commit, discard, rename detection, or syntax colour.

The UI is built and is the source of truth: `Design System/AI/Conversation Changes` (`apps/web/.storybook/design-system/conversation-changes.stories.tsx`), rendered by `conversation-changes.tsx` from the pure views in `models/workspace-diff.ts`. The wire types are in `packages/core/src/workspace/workspace-changes.ts`. This document covers what feeds them.

## 1. Not built

1. Host: two conversation methods that run git.
2. Relay: two pass-through callables.
3. Browser: the two hooks, and the refetch when a turn ends.
4. Mount in `conversation-chat.tsx`.
5. Tests.

## 2. Decisions

1. **Base is `HEAD`.** Everything uncommitted is one set; Porte has no staging.
2. **Raw git text crosses the wire.** The Host returns the patch as git prints it; `patchRows` parses it in the browser with `diff`'s `parsePatch`.
3. **Pull, not push.** The browser refetches when `runningTurnId` clears and on window focus. The Host watches nothing. Mission control (roadmap 5) is where a push earns its place.
4. **One file per request.** The list is one call; a diff is one call per file, capped at `CHANGE_PATCH_MAX_BYTES` (512 KiB) and reported by size above it.
5. **No mutations.** Every call is a read. Retry is a refetch.

## 3. Git

| Need                     | Command                                                                                                                                 |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| Base                     | `git rev-parse --verify HEAD`; on failure use the empty tree `4b825dc642cb6eb9a060e54bf8d69288fbee4904`.                                |
| Branch                   | `git branch --show-current`; empty output is a detached HEAD → `null`.                                                                  |
| Tracked files and counts | `git diff <base> --numstat -z --no-renames` (`-\t-` is binary) joined with `git diff <base> --name-status -z --no-renames` for M, A, D. |
| Untracked files          | `git status --porcelain=v2 -z`, lines starting `? `. Counts: `git diff --no-index --numstat -z -- /dev/null <path>`; exit 1 is data.    |
| One file                 | `git diff <base> -U3 --no-renames -- <path>`; untracked: `git diff --no-index -U3 -- /dev/null <path>`.                                 |
| Where                    | `conversation.gitRoot`, read-only, `execFile('git', args, { cwd, maxBuffer: 32 MiB, timeout: 10_000 })`.                                |

Paths are root-relative, so the list matches `git diff --stat` on the machine.

## 4. Contracts

```ts
// packages/core/src/relay/host-conversation-methods.ts
'workspace.changes.list': { kind: request, params: z.strictObject({}), result: WorkspaceChangesSchema }
'workspace.changes.get':  { kind: request, params: z.strictObject({ path: ChangedFilePathSchema }), result: ChangePatchSchema }

// apps/host/src/application/ports/workspace-changes.ts
export interface WorkspaceChangesReader {
  list(gitRoot: string): Promise<WorkspaceChanges>
  /** Root-relative, from `list`. `..` segments and absolute paths throw before git runs. */
  get(gitRoot: string, path: ChangedFilePath): Promise<ChangePatch>
}
// apps/host/src/infrastructure/node/git-workspace-changes.ts — GitWorkspaceChanges implements it.
// apps/host/src/domain/messages/queries.ts — ListWorkspaceChanges, GetWorkspaceChange; handlers read
// deps.conversations.get(id).gitRoot and call the port. AppDeps gains `workspaceChanges`.

// apps/web/src/server/infrastructure/durable-objects/conversation-agent.ts
@callable() listChanges(): Promise<WorkspaceChanges>                                   // hostSocket.request('workspace.changes.list', {})
@callable() getChange(params: { path: ChangedFilePath }): Promise<ChangePatch>          // hostSocket.request('workspace.changes.get', params)

// apps/web/src/features/conversation/hooks/use-workspace-changes.ts
export const changesQueries = {
  all:  (id: ConversationId) => ['conversation', 'changes', id] as const,
  list: (id, stub) => queryOptions({ queryKey: [...all(id), 'list'], queryFn: () => stub.listChanges(), placeholderData: keepPreviousData }),
  file: (id, stub, path) => queryOptions({ queryKey: [...all(id), 'file', path], queryFn: () => stub.getChange({ path }) }),
}
export function useWorkspaceChanges(agent, enabled: boolean): WorkspaceChangesView   // enabled = canSend
export function useChangePatch(agent, path: ChangedFilePath | null): ChangePatchView  // enabled = path !== null
```

Errors: no new tags. A missing `gitRoot`, missing `git`, or any git exit other than the `--no-index` exit 1 throws `WorkspaceNotAllowedError`. A path outside the root throws it before git runs. Offline is `HostOfflineError` from the relay. All reach the views as `failed` with `onRetry`.

## 5. Freshness

- `staleTime: 0` on both queries; `refetchOnWindowFocus` stays on.
- `useConversation` invalidates `changesQueries.all(id)` when `state.runningTurnId` goes from set to unset. That is the only writer of "the tree may have changed".
- `keepPreviousData` on the list, so the pill keeps its numbers during a refetch instead of blinking out.
- A file's diff refetches on every open; the panel shows `Reading…` until it lands.

## 6. Files left

| File                                                                                                 | Owns                                       |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `packages/core/src/relay/host-conversation-methods.ts`                                               | Two methods                                |
| `apps/host/src/domain/messages/queries.ts`                                                           | Two queries                                |
| `apps/host/src/application/ports/workspace-changes.ts`                                               | `WorkspaceChangesReader`                   |
| `apps/host/src/application/handlers/{list-workspace-changes,get-workspace-change}.ts`, `registry.ts` | Handlers                                   |
| `apps/host/src/infrastructure/node/git-workspace-changes.ts`                                         | git adapter                                |
| `apps/host/src/infrastructure/app-deps.ts`                                                           | `workspaceChanges`                         |
| `apps/host/src/entrypoints/websocket/conversation-method-handlers.ts`                                | Two entries                                |
| `apps/web/src/server/infrastructure/durable-objects/conversation-agent.ts`                           | Two callables                              |
| `apps/web/src/features/conversation/hooks/use-conversation-agent.ts`                                 | Stub pick                                  |
| `apps/web/src/features/conversation/hooks/use-workspace-changes.ts`                                  | Queries and views                          |
| `apps/web/src/pages/conversation/use-conversation.ts`                                                | Invalidate on turn end                     |
| `apps/web/src/features/conversation/components/conversation-chat.tsx`                                | Mount beside `ConversationPlans`           |
| `apps/host/tests/integration/git-workspace-changes.test.ts`                                          | Real temp repo                             |
| `apps/host/tests/unit/workspace-changes-handlers.test.ts`                                            | Handlers with a fake reader                |
| `apps/web/tests/unit/workspace-diff.test.ts`                                                         | `patchRows`, `changesTree`, `changeTotals` |
| `apps/web/tests/unit/use-workspace-changes.test.tsx`                                                 | Views and invalidation                     |
| `apps/web/tests/integration/conversation-agent.test.ts`                                              | Pass-through, offline                      |

## 7. Slices

1. `patchRows`, `changesTree` (compaction, sort), `changeTotals`. Unit.
2. `GitWorkspaceChanges.list` on a temp repo: modified, added, deleted, untracked, binary, branch, unborn `HEAD`. Matches `git diff HEAD --stat`.
3. `GitWorkspaceChanges.get`: patch, binary, too-large, untracked, `..` rejected.
4. Methods, handlers, callables: `listChanges` returns parsed `WorkspaceChanges`; offline throws `HostOfflineError`. Send a 600 KiB patch to settle open question 1.
5. Hooks: views, invalidation fires once when `runningTurnId` clears, list keeps previous data during refetch.
6. Mount. Roadmap proof on a phone: multi-file turn, pill matches `git diff HEAD --stat`, tap opens one file.

## 8. Open

1. **Browser-leg frame cap.** Confirm a 512 KiB callable result survives the Workers WebSocket; lower `CHANGE_PATCH_MAX_BYTES` if not.
2. **Branch diff when the tree is clean** (roadmap wording). Needs a base branch; `origin/HEAD` is often unset. Later slice.
3. **Row count.** `DiffBlock` draws one element per line. A 512 KiB patch is about ten thousand rows. If a phone stalls in slice 4, reuse the transcript's virtualizer pattern.
