# Diff sheet

Roadmap item 2. A pill above the composer says how much of the working tree is uncommitted. It opens a sheet: the changed files as a tree or list, tracked and untracked, and one file's diff on tap. Read-only: no stage, commit, discard, rename detection, or syntax colour.

Words are git's: **uncommitted changes** are the files that differ from `HEAD`, tracked and untracked; a **changed file** is one of them, `modified`, `added`, `deleted`, or `untracked`; a **diff** is one file's unified diff; the **working tree** is the checkout git runs in; the **branch** is what `git branch --show-current` prints.

The UI is built and is the source of truth: `Design System/AI/Conversation Changes` (`apps/web/.storybook/design-system/conversation-changes.stories.tsx`), rendered by `conversation-changes.tsx` from the pure views in `models/changes.ts`. The wire types are in `packages/core/src/git/uncommitted-changes.ts`. The Host side is built: port `WorkingTree`, adapter `GitWorkingTree`, queries `ListChanges` and `GetDiff`, methods `changes.list` and `changes.diff`. This document covers what feeds the UI from there.

## 1. Not built

1. Relay: two pass-through callables.
2. Browser: the two hooks, and the refetch when a turn ends.
3. Mount in `conversation-chat.tsx`.
4. Tests for those.

## 2. Decisions

1. **Base is `HEAD`.** Everything uncommitted is one set; Porte has no staging.
2. **Raw git text crosses the wire.** The Host returns the diff as git prints it; `patchRows` parses it in the browser with `diff`'s `parsePatch`.
3. **Pull, not push.** The browser refetches when `runningTurnId` clears and on window focus. The Host watches nothing. Mission control (roadmap 5) is where a push earns its place.
4. **One file per request.** The list is one call; a diff is one call per file, capped at `FILE_DIFF_MAX_BYTES` (512 KiB) and reported by size above it. The cap is for reading and rendering; the WebSocket carries 32 MiB on every leg.
5. **No mutations.** Every call is a read. Retry is a refetch.

## 3. Git

| Need                  | Command                                                                                                                                                                                                                         |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Base                  | `git rev-parse --verify --quiet HEAD`; on failure use the empty tree `4b825dc642cb6eb9a060e54bf8d69288fbee4904`.                                                                                                                |
| Branch                | `git branch --show-current`; empty output is a detached HEAD → `null`.                                                                                                                                                          |
| Tracked changed files | `git diff <base> --numstat -z --no-renames` (`-\t-` is binary) joined with `git diff <base> --name-status -z --no-renames` for M, A, D.                                                                                         |
| Untracked files       | `git status --porcelain=v2 -z --no-renames --untracked-files=all`, the `? path` records. Counts: `git diff --no-index --numstat -z -- /dev/null <path>`; exit 1 is data, and `-z` prints `added\tremoved\t\0/dev/null\0path\0`. |
| One diff              | `git diff <base> -U3 --no-renames -- <path>`; untracked: `git diff --no-index -U3 -- /dev/null <path>`.                                                                                                                         |
| Where                 | `conversation.gitRoot`, read-only, spawned with a 10 s deadline and a 32 MiB stdout bound.                                                                                                                                      |

Paths are root-relative, so the list matches `git diff --stat` on the machine. Proven by `apps/host/tests/integration/git-working-tree.test.ts` on a real repository.

## 4. Contracts

```ts
// packages/core/src/relay/host-conversation-methods.ts — built
'changes.list': { kind: request, params: z.strictObject({}), result: UncommittedChangesSchema }
'changes.diff': { kind: request, params: z.strictObject({ path: ChangedFilePathSchema }), result: FileDiffSchema }

// apps/web/src/server/infrastructure/durable-objects/conversation-agent.ts
@callable() listChanges(): Promise<UncommittedChanges>                          // hostSocket.request('changes.list', {})
@callable() getDiff(params: { path: ChangedFilePath }): Promise<FileDiff>       // hostSocket.request('changes.diff', params)

// apps/web/src/features/conversation/hooks/use-changes.ts
export const changesQueries = {
  all:  (id: ConversationId) => ['conversation', 'changes', id] as const,
  list: (id, stub) => queryOptions({ queryKey: [...all(id), 'list'], queryFn: () => stub.listChanges(), placeholderData: keepPreviousData }),
  diff: (id, stub, path) => queryOptions({ queryKey: [...all(id), 'diff', path], queryFn: () => stub.getDiff({ path }) }),
}
export function useChanges(agent, enabled: boolean): ChangesView                 // enabled = canSend && agent.identified
export function useFileDiff(agent, path: ChangedFilePath | null): FileDiffView   // enabled = path !== null
```

Errors: no new tags. A missing `gitRoot`, missing `git`, or any git exit other than the `--no-index` exit 1 throws `WorkspaceNotAllowedError`. A path outside the root throws it before git runs. Offline is `HostOfflineError` from the relay. All reach the views as `failed` with `onRetry`.

## 5. Freshness

- `staleTime: 0` on both queries; `refetchOnWindowFocus` stays on.
- `useConversation` invalidates `changesQueries.all(id)` when `state.runningTurnId` goes from set to unset. That is the only writer of "the tree may have changed".
- `keepPreviousData` on the list, so the pill keeps its numbers during a refetch instead of blinking out.
- A diff refetches on every open; the panel shows `Reading…` until it lands.

## 6. Files left

| File                                                                       | Owns                                       |
| -------------------------------------------------------------------------- | ------------------------------------------ |
| `apps/web/src/server/infrastructure/durable-objects/conversation-agent.ts` | Two callables                              |
| `apps/web/src/features/conversation/hooks/use-conversation-agent.ts`       | Stub pick                                  |
| `apps/web/src/features/conversation/hooks/use-changes.ts`                  | Queries and views                          |
| `apps/web/src/pages/conversation/use-conversation.ts`                      | Invalidate on turn end                     |
| `apps/web/src/features/conversation/components/conversation-chat.tsx`      | Mount beside `ConversationPlans`           |
| `apps/web/tests/unit/changes.test.ts`                                      | `patchRows`, `changesTree`, `changeTotals` |
| `apps/web/tests/unit/use-changes.test.tsx`                                 | Views and invalidation                     |
| `apps/web/tests/integration/conversation-agent.test.ts`                    | Pass-through, offline                      |

## 7. Slices

1. `patchRows`, `changesTree` (compaction, sort), `changeTotals`. Unit.
2. Callables: `listChanges` returns parsed `UncommittedChanges`; offline throws `HostOfflineError`. Integration, fake Host socket.
3. Hooks: views, invalidation fires once when `runningTurnId` clears, list keeps previous data during refetch.
4. Mount. Roadmap proof on a phone: multi-file turn, pill matches `git diff HEAD --stat`, tap opens one diff.

## 8. Open

1. **Branch diff when the tree is clean** (roadmap wording). Needs a base branch; `origin/HEAD` is often unset. Later slice.
2. **Row count.** `DiffBlock` draws one element per line. A 512 KiB diff is about ten thousand rows. If a phone stalls in slice 4, reuse the transcript's virtualizer pattern.
