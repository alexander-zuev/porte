# Changes pane

Roadmap item 2. One row above the composer says how much the working tree has changed. A tap opens a sheet with every changed file. A tap on a file shows its diff, the way Zed's "Uncommitted Changes" tab does, without staging, commits, or history.

## 1. Flows

| #   | Flow              | What happens                                                                                                            |
| --- | ----------------- | ----------------------------------------------------------------------------------------------------------------------- |
| F1  | Clean tree        | No row above the composer. Nothing to open.                                                                             |
| F2  | Changed tree      | Row `± 4 files · +65 −18`. Counts come from `git diff HEAD --numstat` plus untracked files.                             |
| F3  | Open              | Tap the row. Sheet `Changes`. One row per file: name mono, directory muted, `+N −M`. Untracked files show `+N −0`.      |
| F4  | Open a file       | Tap a file row. The diff pushes in from the right, iOS-style, the same as a tool run's sheet. Back returns to the list. |
| F5  | Turn ends         | The row refetches. Counts match what the machine's `git diff HEAD --stat` says at that moment.                          |
| F6  | Return to the tab | The row refetches on window focus. A phone that comes back from the lock screen shows current counts.                   |
| F7  | Turn running      | The row keeps the counts from the last fetch. It does not poll. The sheet fetches a file's diff live on every open.     |
| F8  | Machine offline   | Row hidden. `canSend` is false, the query is disabled.                                                                  |
| F9  | Read fails        | Row `Could not read changes · Retry`. Same shape as the command list.                                                   |
| F10 | Binary file       | File row shows `binary`, no counts. Its diff panel says `Binary file`.                                                  |
| F11 | Huge file         | Diff above 512 KiB: panel says `Too large to show here (1.4 MB)`. The list still counts it.                             |
| F12 | Branch diff       | Later slice. When the tree is clean, show the diff against the base branch instead of F1.                               |

Not supported: stage, unstage, commit, discard, revert, rename detection, syntax colour. A rename shows as one deleted file and one added file.

Not like Zed: no fold arrows to load more context. Every hunk carries git's default three lines each side.

## 2. Storyboard

Phone width. Desktop uses the same sheet.

```text
S1  Changed tree                  S2  Sheet: files                  S3  Sheet: one file
┌───────────────────────┐         ┌───────────────────────┐         ┌───────────────────────┐
│ ▸ user: Add tests     │         │ [×]    Changes        │         │ [‹]  chat-frame.tsx   │
│ ◂ Reading parser.ts   │         │                       │         │                       │
│ ◂ Done. 3 tests added │         │ chat-frame.tsx  +27 −2│         │ @@ -1,4 +1,4 @@       │
│                       │         │ .storybook/harnesses ›│         │ -import { Lightning…  │
│ ┌───────────────────┐ │         │ notifications.ts +1 −1│         │ +import { Lightning…  │
│ │ ± 4 files · +65 −18│ │  ← row │ src/features/notif…  ›│         │  import type { Conv…  │
│ └───────────────────┘ │         │ roadmap.md     +27 −13│         │  import { Composer…   │
│ ┌───────────────────┐ │         │ docs                 ›│         │ @@ -20,7 +20,9 @@     │
│ │ Message Grok…     │ │         │ queued-messages.md +98│         │   PromptInputTools,   │
│ │ [+] [model▾]  [🎤][↑]│         │ docs · untracked     ›│         │ +import { InputGroup… │
│ └───────────────────┘ │         │                       │         │                       │
└───────────────────────┘         └───────────────────────┘         └───────────────────────┘
 tap row → S2                      tap file → S3                     [‹] → S2
```

Rules the frames encode:

1. The row sits above the composer with the plans, same width, same `Card` shape as a plan line.
2. The sheet is the one place for the file list and the diff on every device. Same push pattern as `RunSheetBody`.
3. A diff fills the sheet height. `DiffBlock` gets an `unbounded` variant; the transcript keeps its cap.
4. Context rows are plain. Added and removed rows keep the gutter bar and tint. A hunk header is one muted row.

Copy: row `± N files · +A −R`, sheet title `Changes`, empty `No uncommitted changes`, failed `Could not read changes`, action `Retry`.

## 3. Decisions to align

1. **Sheet on every width, not `Collapsible` on desktop.** The roadmap says `Collapsible` on desktop. The pane is a view of the workspace, not a transcript row, and `ConversationPlans` already opens a sheet on every width. One component, one storyboard. A desktop side panel is a later upgrade.
2. **Base is `HEAD`, not the index.** `git diff` alone hides staged changes. Porte has no staging, so everything uncommitted is one set.
3. **Raw git text crosses the wire.** The Host returns the patch as git prints it. The browser parses it. Git's format is the boundary name; interpretation stays in the web model.
4. **Pull, not push.** The browser refetches when the turn ends and on window focus. The Host does not watch files and does not compute counts at turn end. Roadmap item 5 (mission control `Finished +214 −80`) will reuse the same port on the Host; that is when a push earns its place.
5. **One file per request.** The list is one request, a diff is one request per file. A whole-tree patch can pass 1 MiB; a file rarely does.

## 4. Facts

| Question                           | Answer                                                                                                                                                          |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| File list with counts              | `git diff HEAD --numstat -z --no-renames` → `added\tremoved\tpath\0`. Binary prints `-\t-`.                                                                     |
| Untracked files                    | `git status --porcelain=v2 -z` lines starting `? `. Counts: `git diff --no-index --numstat -z -- /dev/null <path>`, exit code 1 means "differs", not failure.   |
| One file's diff                    | `git diff HEAD -U3 --no-renames -- <path>`. Untracked: `git diff --no-index -U3 -- /dev/null <path>`.                                                           |
| Unborn `HEAD` (no commits)         | `git rev-parse --verify HEAD` fails. Use the empty tree `4b825dc642cb6eb9a060e54bf8d69288fbee4904` as the base.                                                 |
| Where git runs                     | `conversation.gitRoot`, already on the aggregate. Paths are root-relative, so they match `git diff --stat`.                                                     |
| Host precedent for child processes | `machine.ts` uses `execFileSync`. `acp-agent-process.ts` uses `spawn`. No git library on the Host.                                                              |
| Wire limits                        | Host → relay frame cap is 32 MiB; request timeout 60 s. Browser leg: Workers WebSocket messages are capped at 1 MiB (open question 1).                          |
| Web diff parser                    | None. `spanDiff` builds unified text; nothing reads it. The `diff` package (jsdiff) `parsePatch` returns hunks with `oldStart`, `newStart`, and prefixed lines. |
| Existing renderer                  | `DiffBlock` rows are `added \| removed` only. No context, no hunk row, capped at `max-h-96`.                                                                    |

## 5. Design

- The Host answers two new conversation methods with the output of git. It stores nothing.
- The relay (`ConversationAgent`) forwards each as one callable. No state, no cache.
- The browser owns freshness through TanStack Query: refetch when `runningTurnId` clears, and on window focus.

### Alternatives

| Option                                                    | Freshness       | Payload                    | Verdict                                                                          |
| --------------------------------------------------------- | --------------- | -------------------------- | -------------------------------------------------------------------------------- |
| A. Browser pulls on turn end and focus                    | Turn end, focus | List + one file per open   | Recommended                                                                      |
| B. Host computes counts at turn end, pushes on live state | Turn end        | Counts on every `setState` | Later, with roadmap item 5; two writers of one fact until then                   |
| C. Host file watcher pushes every change                  | Live, Zed-like  | Many small frames          | Rejected: a watcher, debounce, and a new event for a v1 that fetches on demand   |
| D. Host sends structured hunks                            | Same as A       | JSON, larger than text     | Rejected: parsing moves to the Host, git's own format is dropped at the boundary |
| E. Whole-tree patch in one request                        | Same as A       | Can pass 1 MiB             | Rejected: open question 1                                                        |

### Invariants

1. The Host never caches git output. Every request runs git.
2. Git runs in `gitRoot`, read-only. No command in this feature writes to the index or the tree.
3. The list and a file's diff are computed against the same base: `HEAD`, or the empty tree when `HEAD` is unborn.
4. Totals on the row are derived on the browser from the file list. They are never sent.
5. A file above `CHANGE_PATCH_MAX_BYTES` (512 KiB) is reported as `too-large` with its size, never truncated.
6. The relay forwards and never parses. `HostOfflineError` is the relay's only own failure.

### Domain model

```ts
// packages/core/src/workspace/workspace-changes.ts

/** Root-relative path, as git prints it. */
export const ChangedFilePathSchema = z.string().min(1).brand<'ChangedFilePath'>()
export type ChangedFilePath = z.infer<typeof ChangedFilePathSchema>

export const ChangedFileStatusSchema = z.enum(['modified', 'added', 'deleted', 'untracked'])

/** Line counts from `--numstat`; absent when git printed `-\t-`. */
export const ChangedFileSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('text'),
    path: ChangedFilePathSchema,
    status: ChangedFileStatusSchema,
    added: z.int().nonnegative(),
    removed: z.int().nonnegative(),
  }),
  z.strictObject({
    kind: z.literal('binary'),
    path: ChangedFilePathSchema,
    status: ChangedFileStatusSchema,
  }),
])
export type ChangedFile = z.infer<typeof ChangedFileSchema>

export const WorkspaceChangesSchema = z.strictObject({
  files: z.array(ChangedFileSchema),
})
export type WorkspaceChanges = z.infer<typeof WorkspaceChangesSchema>

export const CHANGE_PATCH_MAX_BYTES = 512 * 1024

/** One file's diff, as `git diff -U3` printed it, or why it cannot be shown. */
export const ChangePatchSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('patch'), patch: z.string() }),
  z.strictObject({ kind: z.literal('binary') }),
  z.strictObject({ kind: z.literal('too-large'), bytes: z.int().positive() }),
])
export type ChangePatch = z.infer<typeof ChangePatchSchema>
```

```ts
// apps/web/src/features/conversation/models/workspace-diff.ts
import { parsePatch } from 'diff'

export type DiffRow =
  | {
      readonly key: string
      readonly sign: 'added' | 'removed' | 'context'
      /** New-side number for added and context, old-side for removed. */
      readonly line: number
      readonly text: string
    }
  | { readonly key: string; readonly sign: 'hunk'; readonly header: string }

/** Rows for `DiffBlock` from one file's unified diff. Empty patch → empty rows. */
export function patchRows(patch: string): readonly DiffRow[]

export type ChangeTotals = {
  readonly files: number
  readonly added: number
  readonly removed: number
}
/** Row copy input. Binary files count as files, add no lines. */
export function changeTotals(files: readonly ChangedFile[]): ChangeTotals
```

`DiffRow` moves from `tool-output.tsx` to this model, and `tool-output.tsx` imports it. `diffRows` in `tool-detail.tsx` is unchanged: its rows already fit the union.

### Host method table

```ts
// packages/core/src/relay/host-conversation-methods.ts
'workspace.changes.list': {
  kind: JSON_RPC_METHOD_KINDS.request,
  params: z.strictObject({}),
  result: WorkspaceChangesSchema,
},
'workspace.changes.get': {
  kind: JSON_RPC_METHOD_KINDS.request,
  params: z.strictObject({ path: ChangedFilePathSchema }),
  result: ChangePatchSchema,
},
```

### Host port and adapter

```ts
// apps/host/src/application/ports/workspace-changes.ts
/** Read-only view of one git workspace's uncommitted changes. */
export interface WorkspaceChangesReader {
  list(gitRoot: string): Promise<WorkspaceChanges>
  /** `path` is root-relative and must come from `list`; the adapter rejects `..` and absolute paths. */
  get(gitRoot: string, path: ChangedFilePath): Promise<ChangePatch>
}

// apps/host/src/infrastructure/node/git-workspace-changes.ts
export class GitWorkspaceChanges implements WorkspaceChangesReader {
  constructor(private readonly run: RunGit = execFileGit) {}
}
type RunGit = (
  gitRoot: string,
  args: readonly string[],
) => Promise<{ stdout: Buffer; exitCode: number }>
```

`execFileGit` wraps `execFile('git', args, { cwd: gitRoot, maxBuffer: 32 MiB, timeout: 10_000 })`. Exit code 1 from `--no-index` is data. Any other non-zero exit, a missing `git`, or a missing `gitRoot` throws `WorkspaceNotAllowedError` ("That repository is not available on this machine"). No new error tag.

### Host queries and handlers

```ts
// apps/host/src/domain/messages/queries.ts
ListWorkspaceChanges: { conversationId: ConversationId }
GetWorkspaceChange: { conversationId: ConversationId; path: ChangedFilePath }

// apps/host/src/application/handlers/list-workspace-changes.ts
export const listWorkspaceChanges: QueryHandler<QueryMap['ListWorkspaceChanges'], WorkspaceChanges> =
  (query, deps) => deps.workspaceChanges.list(deps.conversations.get(query.conversationId).gitRoot)

// apps/host/src/infrastructure/app-deps.ts
readonly workspaceChanges: WorkspaceChangesReader
```

### Relay callables (`ConversationAgent`)

```ts
@callable() listChanges(): Promise<WorkspaceChanges>
@callable() getChange(params: HostConversationMethodMap['workspace.changes.get']['params']): Promise<ChangePatch>
```

Both are `hostSocket.request(...)` pass-throughs, the shape of `setModel`.

### Browser

```ts
// apps/web/src/features/conversation/hooks/use-conversation-agent.ts
export type ConversationAgentStub = Pick<
  ConversationAgentClient['stub'],
  'cancelTurn' | 'listCommands' | 'setModel' | 'listChanges' | 'getChange'
>

// apps/web/src/features/conversation/hooks/use-workspace-changes.ts
export const changesQueries = {
  all: (conversationId: ConversationId) => ['conversation', 'changes', conversationId] as const,
  list: (conversationId, stub) =>
    queryOptions({ queryKey: [...all, 'list'], queryFn: () => stub.listChanges() }),
  file: (conversationId, stub, path) =>
    queryOptions({ queryKey: [...all, 'file', path], queryFn: () => stub.getChange({ path }) }),
}

export type WorkspaceChangesView =
  | { readonly status: 'pending' }
  | { readonly status: 'failed'; readonly onRetry: () => void }
  | {
      readonly status: 'ready'
      readonly files: readonly ChangedFile[]
      readonly totals: ChangeTotals
    }

/** @param enabled - False while the machine is offline. */
export function useWorkspaceChanges(
  agent: Pick<ConversationAgentConnection, 'name' | 'stub'>,
  enabled: boolean,
): WorkspaceChangesView

export type ChangePatchView =
  | { readonly status: 'pending' }
  | { readonly status: 'failed'; readonly onRetry: () => void }
  | { readonly status: 'ready'; readonly patch: ChangePatch }

export function useChangePatch(agent, path: ChangedFilePath | null): ChangePatchView
```

Freshness: `staleTime: 0` on both. `refetchOnWindowFocus` stays at its default (on). When `state.runningTurnId` goes from set to unset, `useConversation` calls `queryClient.invalidateQueries({ queryKey: changesQueries.all(conversationId) })`. This is the one writer of "the tree may have changed".

### Components

```ts
// apps/web/src/features/conversation/components/conversation-changes.tsx
/** The row above the composer and the sheet it opens. Null when the tree is clean. */
export function ConversationChanges({ agent, enabled }: { agent; enabled: boolean }): ReactNode
/** Sheet body: file list, and a tapped file's diff pushed in. Pure, for stories. */
export function ChangesSheetBody({ files, totals, patch: (path) => ChangePatchView }): ReactNode
```

`DiffBlock` gains `sign: 'context'` (no bar, no tint), `sign: 'hunk'` (muted header row), and `unbounded?: true` (no `max-h-96`, no own scroll; the sheet panel scrolls).

### Seams

| Boundary                 | Crosses                                           | Must not cross            |
| ------------------------ | ------------------------------------------------- | ------------------------- |
| Browser → relay callable | `{ path }`, `WorkspaceChanges`, `ChangePatch`     | Totals, parsed rows       |
| Relay → Host             | `workspace.changes.list`, `workspace.changes.get` | Any cached copy           |
| Host handler → port      | `gitRoot`, `path`                                 | Git arguments, exit codes |
| Port → git               | Argument lists, `cwd`                             | Paths outside `gitRoot`   |
| Web model → `DiffBlock`  | `DiffRow[]`                                       | The patch string          |

## 6. Call stacks

### Row and list (F2, F3)

```text
ConversationChat mounts ConversationChanges({ agent, enabled: canSend })
  -> useWorkspaceChanges -> useQuery(changesQueries.list)
  -> stub.listChanges()
  -> ConversationAgent.listChanges -> hostSocket.request('workspace.changes.list', {})
  -> CONVERSATION_METHOD_HANDLERS -> bus.handle(createQuery('ListWorkspaceChanges'))
  -> listWorkspaceChanges -> deps.workspaceChanges.list(conversation.gitRoot)
  -> GitWorkspaceChanges.list
       base = rev-parse --verify HEAD ? 'HEAD' : EMPTY_TREE
       tracked  = git diff <base> --numstat -z --no-renames        -> ChangedFile[] (status from name-status, see slice 2)
       untracked = git status --porcelain=v2 -z | lines '? '
       for each untracked: git diff --no-index --numstat -z -- /dev/null <path>  (exit 1 ok)
       return { files: [...tracked, ...untracked] }
  <- WorkspaceChangesSchema parses at the relay boundary
  <- browser: changeTotals(files) -> row copy
```

### One file (F4)

```text
tap file row -> setSelected(path) -> useChangePatch(agent, path)
  -> stub.getChange({ path })
  -> ... -> GitWorkspaceChanges.get(gitRoot, path)
       reject path with '..' segments or leading '/' -> WorkspaceNotAllowedError
       untracked ? git diff --no-index -U3 -- /dev/null <path> : git diff <base> -U3 --no-renames -- <path>
       stdout.byteLength > CHANGE_PATCH_MAX_BYTES ? { kind: 'too-large', bytes } : /^Binary files/m ? { kind: 'binary' } : { kind: 'patch', patch }
  <- browser: patchRows(patch) -> <DiffBlock unbounded rows />
```

### Turn ends (F5)

```text
Host turn.finished -> reduceLiveState drops runningTurnId -> SDK broadcasts state
  -> useConversation sees running: true -> false
  -> queryClient.invalidateQueries(changesQueries.all(id))
  -> mounted list query refetches; an open file panel refetches too
```

### Failure

| Failure                                | Behavior                                                                        |
| -------------------------------------- | ------------------------------------------------------------------------------- |
| Host offline                           | Query disabled (F8). If it fires anyway, `HostOfflineError` → `failed` → Retry. |
| `gitRoot` gone, git missing, git error | `WorkspaceNotAllowedError` → `failed` → Retry.                                  |
| Request timeout (60 s)                 | `RequestTimeoutError` → `failed` → Retry.                                       |
| Path outside root in `getChange`       | `WorkspaceNotAllowedError`. Never reaches git.                                  |
| Patch too large                        | Data, not an error (F11).                                                       |
| Binary                                 | Data, not an error (F10).                                                       |

No retry inside the Host or relay: git is local and a failure is not transient. Retry is the person's tap.

## 7. Files

| File                                                                       | Change                                                         |
| -------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `pnpm-workspace.yaml`, `apps/web/package.json`                             | `diff` in the catalog, web depends on it                       |
| `packages/core/src/workspace/workspace-changes.ts`                         | Schemas and types above; export from `client`                  |
| `packages/core/src/relay/host-conversation-methods.ts`                     | Two methods                                                    |
| `apps/host/src/domain/messages/queries.ts`                                 | Two queries                                                    |
| `apps/host/src/application/ports/workspace-changes.ts`                     | `WorkspaceChangesReader`                                       |
| `apps/host/src/application/handlers/list-workspace-changes.ts`             | Handler                                                        |
| `apps/host/src/application/handlers/get-workspace-change.ts`               | Handler                                                        |
| `apps/host/src/application/handlers/registry.ts`                           | Register both                                                  |
| `apps/host/src/infrastructure/node/git-workspace-changes.ts`               | `GitWorkspaceChanges`, `execFileGit`, `EMPTY_TREE`             |
| `apps/host/src/infrastructure/app-deps.ts`                                 | `workspaceChanges`                                             |
| `apps/host/src/entrypoints/websocket/conversation-method-handlers.ts`      | Two entries                                                    |
| `apps/web/src/server/infrastructure/durable-objects/conversation-agent.ts` | `listChanges`, `getChange`                                     |
| `apps/web/src/features/conversation/models/workspace-diff.ts`              | `DiffRow`, `patchRows`, `changeTotals`                         |
| `apps/web/src/ui/components/ai-elements/tool-output.tsx`                   | Import `DiffRow`; `context`, `hunk`, `unbounded`               |
| `apps/web/src/features/conversation/hooks/use-conversation-agent.ts`       | Stub pick                                                      |
| `apps/web/src/features/conversation/hooks/use-workspace-changes.ts`        | `changesQueries`, `useWorkspaceChanges`, `useChangePatch`      |
| `apps/web/src/pages/conversation/use-conversation.ts`                      | Invalidate on turn end                                         |
| `apps/web/src/features/conversation/components/conversation-changes.tsx`   | Row, sheet, file rows, diff panel                              |
| `apps/web/src/features/conversation/components/conversation-chat.tsx`      | Mount the row beside `ConversationPlans`                       |
| `apps/web/.storybook/design-system/conversation-changes.stories.tsx`       | S1, S2, S3, empty, failed, binary, too-large                   |
| `apps/host/tests/integration/git-workspace-changes.test.ts`                | Real temp repo                                                 |
| `apps/host/tests/unit/workspace-changes-handlers.test.ts`                  | Handlers with a fake reader                                    |
| `apps/web/tests/unit/workspace-diff.test.ts`                               | `patchRows`, `changeTotals`                                    |
| `apps/web/tests/unit/use-workspace-changes.test.tsx`                       | Views and invalidation                                         |
| `apps/web/tests/integration/conversation-agent.test.ts`                    | Callable pass-through, offline                                 |
| `apps/web/tests/design/*.spec.ts`                                          | Looks, a11y, reflow for the new stories                        |
| `docs/roadmap.md`                                                          | Item 2 points here; decision 1 replaces the `Collapsible` line |

## 8. RGR slices

1. `patchRows` from a three-hunk patch: line numbers on each side, context rows, hunk rows. `changeTotals` with a binary file. Unit.
2. `GitWorkspaceChanges.list` on a temp repo: one modified, one added, one deleted, one untracked, one binary. Matches `git diff HEAD --stat`. Integration. Status per file comes from `git diff <base> --name-status -z` run beside numstat; the test pins the join.
3. `GitWorkspaceChanges.get`: patch, binary, too-large, untracked, path with `..` rejected. Unborn `HEAD` lists every file as added.
4. Method table + handlers + relay callables: `listChanges` reaches the Host and returns parsed `WorkspaceChanges`; offline throws `HostOfflineError`. Integration, fake Host socket.
5. `DiffBlock` renders context and hunk rows; `unbounded` drops the cap. Story + looks spec.
6. `ConversationChanges` stories S1, S2, S3, empty, failed, binary, too-large. Design specs green.
7. `useWorkspaceChanges` and `useChangePatch` views with a stub fake. Invalidation fires once when `runningTurnId` clears. Unit.
8. Mount in `conversation-chat.tsx`; phone proof from the roadmap: a multi-file turn, the row matches `git diff HEAD --stat`, a tap opens one file.
9. F12 branch diff: base = `git merge-base HEAD <default branch>` when the tree is clean. Separate slice, after open question 2.

## 9. Open questions

1. **Browser-leg frame cap.** Confirm the Agents SDK callable response survives at 512 KiB over the Workers WebSocket. Send a 600 KiB patch in slice 4; lower `CHANGE_PATCH_MAX_BYTES` if it does not.
2. **Default branch for F12.** `git symbolic-ref refs/remotes/origin/HEAD` is unset on many clones. Fall back to `main`, then `master`, or ask? Decide before slice 9.
3. **Turn running (F7).** Counts stay stale until the turn ends. If a demo needs live counts during a long turn, add invalidation on `tool.updated` for edit kinds. Not in v1.
