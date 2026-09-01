import {
  ChangedFilePathSchema,
  type ChangePatch,
  type ChangedFile,
  type ChangedFilePath,
  type WorkspaceChanges,
} from '@porte/core/client'

/*
 * Real output of `git diff HEAD -U3 --no-renames` on this repository,
 * captured 2026-09-01. The untracked file comes from
 * `git diff --no-index -U3 -- /dev/null <path>`.
 */

const path = (value: string): ChangedFilePath => ChangedFilePathSchema.parse(value)

export const CHAT_FRAME = path('apps/web/.storybook/harnesses/chat-frame.tsx')
export const NOTIFICATIONS = path('apps/web/src/features/notifications/models/notifications.ts')
export const ROADMAP = path('docs/roadmap.md')
export const VERSION_AWARENESS = path('docs/version-awareness.md')
export const MESSAGE_QUEUE = path('apps/web/src/features/conversation/models/message-queue.ts')
export const COMPOSER_QUEUE = path(
  'apps/web/src/features/conversation/components/composer-queue.tsx',
)
export const OG_IMAGE = path('apps/web/public/og.png')

const CHAT_FRAME_PATCH = `diff --git a/apps/web/.storybook/harnesses/chat-frame.tsx b/apps/web/.storybook/harnesses/chat-frame.tsx
index bf5ef9b..4fdec79 100644
--- a/apps/web/.storybook/harnesses/chat-frame.tsx
+++ b/apps/web/.storybook/harnesses/chat-frame.tsx
@@ -18,9 +18,11 @@ import {
   PromptInputSubmit,
   PromptInputTextarea,
   PromptInputTools,
+  usePromptInputController,
   type PromptInputMessage,
 } from '@web/ui/components/ai-elements/prompt-input.tsx'
 import type { ChatStatus, UIMessage } from 'ai'
+import type { ReactNode } from 'react'

 export type ChatFrameProps = {
   readonly messages: readonly UIMessage[]
@@ -40,6 +42,10 @@ export type ChatFrameProps = {
   readonly readingOlder?: boolean
   /** Where a send lands. The real screen has a machine; a story has a line of text. */
   readonly onSend?: (message: PromptInputMessage) => void
+  /** While a turn runs, Enter queues instead of sending. Absent: the composer sends. */
+  readonly onQueue?: (message: PromptInputMessage) => void
+  /** The queue pill, drawn above the composer. */
+  readonly queue?: ReactNode
 }

 /**
@@ -64,8 +70,11 @@ export function ChatFrame({
   onReadOlder = null,
   readingOlder = false,
   onSend = () => undefined,
+  onQueue,
+  queue,
 }: ChatFrameProps) {
   const running = status === 'streaming' || status === 'submitted'
+  const queues = running && onQueue !== undefined

   return (
     <div className="flex min-h-0 flex-1 flex-col gap-3">
@@ -81,11 +90,14 @@ export function ChatFrame({

       <ConversationPermissions onAnswer={onAnswer} waiting={permissions} />

+      {queue}
+
       <PromptInput
         className="mb-[max(0.5rem,env(safe-area-inset-bottom))]"
         onSubmit={(message) => {
           if (message.text.trim() === '' && message.files.length === 0) return
-          onSend(message)
+          if (queues) onQueue(message)
+          else onSend(message)
         }}
       >
         <PromptInputBody>
@@ -121,7 +133,15 @@ export function ChatFrame({
                   </ContextContent>
                 </Context>
               )}
-              <PromptInputSubmit disabled={!canSend || stopping} status={status} onStop={onStop} />
+              {queues ? (
+                <QueueOrStop disabled={!canSend || stopping} onStop={onStop} />
+              ) : (
+                <PromptInputSubmit
+                  disabled={!canSend || stopping}
+                  status={status}
+                  onStop={onStop}
+                />
+              )}
             </div>
           </PromptInputFooter>
         </PromptInputBody>
@@ -129,3 +149,19 @@ export function ChatFrame({
     </div>
   )
 }
+
+/** One button while a turn runs, as Grok draws it: Stop when empty, the send arrow (which queues) once there is text. */
+function QueueOrStop({
+  disabled,
+  onStop,
+}: {
+  readonly disabled: boolean
+  readonly onStop: () => void
+}) {
+  const controller = usePromptInputController()
+  const empty =
+    controller.textInput.value.trim() === '' && controller.attachments.files.length === 0
+  return (
+    <PromptInputSubmit disabled={disabled} status={empty ? 'streaming' : 'ready'} onStop={onStop} />
+  )
+}
`

const NOTIFICATIONS_PATCH = `diff --git a/apps/web/src/features/notifications/models/notifications.ts b/apps/web/src/features/notifications/models/notifications.ts
index 166f4c1..a2faabd 100644
--- a/apps/web/src/features/notifications/models/notifications.ts
+++ b/apps/web/src/features/notifications/models/notifications.ts
@@ -8,7 +8,7 @@ import {
 /**
  * One thing that needs the person. Derived from facts the app already holds —
  * nothing is stored; a notification disappears when its fact stops being true.
- * Web Push (roadmap §7) lands on this same shape later.
+ * Web Push (roadmap §8) lands on this same shape later.
  */
 export type PorteNotification = {
   /** Stable per fact, so a dismissal outlives reloads and dies with the fact. */
`

const ROADMAP_PATCH = `diff --git a/docs/roadmap.md b/docs/roadmap.md
index 2c4a434..1a70867 100644
--- a/docs/roadmap.md
+++ b/docs/roadmap.md
@@ -30,13 +30,29 @@ order, without an error toast; a killed host mid-turn recovers without restart.
 ### 2. Changes pane — working-tree diff on demand

 One view per conversation: the machine's current \`git diff\` (uncommitted, or
-branch diff when the tree is clean), per-file +/− counts, rendered with the
-existing diff components. Fetched from the host on request, never cached.
+branch diff when the tree is clean). Fetched from the host on request, never
+cached.

-Proof: after a multi-file turn, the pane shows every changed file and matches
-\`git diff --stat\` on the machine.
+Hunks only — never the whole file. Each file is one row with +/− counts. A
+tap opens that file's diff: \`Collapsible\` on desktop, \`Drawer\` on phone, the
+same split as \`Reasoning\` and \`ToolRun\`. Render with \`DiffBlock\`.

-### 3. Read-only share links
+Proof: after a multi-file turn, the pane shows every changed file, matches
+\`git diff --stat\` on the machine, and a phone tap opens one file in a sheet.
+
+### 3. \`@\` file select in the composer
+
+\`@\` in the composer opens a search over the conversation's workspace, the way
+a CLI file picker works. Pick a file; the prompt carries it as a
+\`resource-link\`. Device attachments stay on \`+\`; this is the machine's tree.
+
+Reuse \`ComposerCommandSuggestions\` (cmdk). The host answers a file search
+(\`git ls-files\` plus the query). No file list rides on live state.
+
+Proof: type \`@span-d\` on the phone, pick \`span-diff.ts\`, send; Grok's next
+turn reads that path.
+
+### 4. Read-only share links

 A conversation can be shared as a public read-only transcript URL. The
 transcript is the landing page: every demo post ends with a live link.
@@ -44,7 +60,7 @@ transcript is the landing page: every demo post ends with a live link.
 Proof: an incognito browser opens the link and scrolls the full transcript;
 composer, permissions, and machine identity are absent.

-### 4. Mission control
+### 5. Mission control

 Each conversation row shows live state instead of a spinner: current activity
 ("Running \`pnpm test\` · 34s"), "Needs permission", or last outcome
@@ -53,21 +69,19 @@ Each conversation row shows live state instead of a spinner: current activity
 Proof: with three conversations in different states, the list tells them apart
 without opening any of them.

-### 5. Outcome cards
+### 6. Outcome cards

 Commit and PR URLs in tool output render as link cards. One composer action
 sends a canned "commit and open a PR" prompt.

 Proof: a turn that pushes a PR ends with a tappable card that opens GitHub.

-### 6. Model and effort from the phone
-
-Device-side model and effort selection applies to the local session, matching
-both competitors. Depends on what Grok exposes over ACP session modes.
+### 7. Model and effort from the phone — shipped

-Proof: switching on the phone changes the model Grok reports for the next turn.
+Phone and desktop pickers write \`conversation.model.set\`. Grok takes the pair
+on \`session/set_model\`.

-### 7. Notifications
+### 8. Notifications

 Web Push for permission requests and turn completion, sent only when no client
 watches the conversation. Works uninstalled on desktop browsers and Android
`

const VERSION_AWARENESS_PATCH = `diff --git a/docs/version-awareness.md b/docs/version-awareness.md
index 6350352..77b52a7 100644
--- a/docs/version-awareness.md
+++ b/docs/version-awareness.md
@@ -29,7 +29,7 @@ command that keeps the CLI version, the plugin version, and every pin identical.

 - Backwards compatibility for old hosts beyond the nudge. An old host keeps failing
   new operations with the existing toast; nothing is gated or hidden.
-- Web Push delivery (roadmap §7). This route is its future landing surface only.
+- Web Push delivery (roadmap §8). This route is its future landing surface only.
 - Auto-updating the plugin or CLI. The nudge names the command; the person runs it.

 ## Invariants
@@ -90,7 +90,7 @@ The CLI compares against its own version once per \`up\`/\`rc\`:
 ### Web notifications

 \`\`\`ts
-// One derived notification kind today; Push lands here later (roadmap §7).
+// One derived notification kind today; Push lands here later (roadmap §8).
 export type PorteNotification = {
   readonly id: string // stable: \`cli-update:\${hostId}:\${latest}\`
   readonly kind: 'cli-update'
`

const MESSAGE_QUEUE_PATCH = `diff --git a/apps/web/src/features/conversation/models/message-queue.ts b/apps/web/src/features/conversation/models/message-queue.ts
new file mode 100644
index 0000000..bd9bd0a
--- /dev/null
+++ b/apps/web/src/features/conversation/models/message-queue.ts
@@ -0,0 +1,17 @@
+import type { MessageId } from '@porte/core/client'
+
+/** One message waiting for the running turn to end. Position is 1-based run order. */
+export type QueuedMessage = {
+  readonly id: MessageId
+  readonly position: number
+  readonly text: string
+  readonly files: number
+}
+
+/** What the queue surface can do. Every handler is required: a story passes fakes. */
+export type QueueActions = {
+  readonly sendNow: (id: MessageId) => void
+  readonly remove: (id: MessageId) => void
+  /** Move one message to a 1-based position; the others shift. */
+  readonly reorder: (id: MessageId, position: number) => void
+}
`

/** What `git diff HEAD --numstat` plus the untracked files said. */
export const changedFiles: readonly ChangedFile[] = [
  { kind: 'text', path: CHAT_FRAME, status: 'modified', added: 27, removed: 2 },
  { kind: 'text', path: NOTIFICATIONS, status: 'modified', added: 1, removed: 1 },
  { kind: 'text', path: ROADMAP, status: 'modified', added: 27, removed: 13 },
  { kind: 'text', path: VERSION_AWARENESS, status: 'modified', added: 2, removed: 2 },
  { kind: 'binary', path: OG_IMAGE, status: 'modified' },
  { kind: 'text', path: MESSAGE_QUEUE, status: 'untracked', added: 17, removed: 0 },
  { kind: 'text', path: COMPOSER_QUEUE, status: 'untracked', added: 4120, removed: 0 },
]

export const workspaceChanges: WorkspaceChanges = { branch: 'main', files: [...changedFiles] }
export const noChanges: WorkspaceChanges = { branch: 'main', files: [] }

const text = (
  value: string,
  status: ChangedFile['status'] = 'modified',
  added = 3,
  removed = 1,
): ChangedFile => ({ kind: 'text', path: path(value), status, added, removed })

/**
 * What the tree must survive: a twelve-segment path with siblings at every
 * level so nothing compacts, a root file, a file beside a folder, a lone deep
 * chain that does compact, names longer than a phone, a folder name longer
 * than a phone, spaces and non-ASCII, no extension, a dotfile, and counts in
 * the hundreds of thousands.
 */
export const deepChanges: WorkspaceChanges = {
  branch: 'feat/conversation-changes-pane-with-a-branch-name-nobody-would-type',
  files: [
    text('package.json', 'modified', 1, 0),
    text('.env.example', 'untracked', 4, 0),
    text('LICENSE', 'deleted', 0, 21),
    text(
      'apps/web/src/features/conversation/components/composer/menu/items/model/effort/reasoning-effort-item.tsx',
    ),
    text(
      'apps/web/src/features/conversation/components/composer/menu/items/model/effort/reasoning-effort-item.test.tsx',
      'untracked',
      12,
      0,
    ),
    text('apps/web/src/features/conversation/components/composer/menu/items/model/model-item.tsx'),
    text('apps/web/src/features/conversation/components/composer/menu/items/effort-item.tsx'),
    text('apps/web/src/features/conversation/components/composer/menu/menu.tsx'),
    text('apps/web/src/features/conversation/components/composer/composer.tsx'),
    text(
      'apps/web/src/features/conversation/components/use-conversation-changes-layout-preference-with-persistence.stories.tsx',
      'untracked',
      240,
      0,
    ),
    text('apps/web/src/features/conversation/hooks/use-composer.ts', 'untracked', 40, 0),
    text('apps/web/src/features/notifications/models/notifications.ts'),
    text('apps/web/src/ui/components/ui/dropdown-menu.tsx', 'modified', 120_345, 98_765),
    text('apps/web/tests/unit/composer.test.ts', 'untracked', 22, 0),
    text('apps/host/src/infrastructure/node/git-workspace-changes.ts', 'untracked', 90, 0),
    text('packages/core/src/workspace/workspace-changes.ts', 'untracked', 45, 0),
    text(
      'packages/core/src/a-single-folder-whose-name-is-longer-than-any-phone-is-wide-and-keeps-going/index.ts',
    ),
    text('docs/Über Plan — 2026 (draft) with spaces.md', 'untracked', 8, 0),
    text('docs/changes-pane.md', 'deleted', 0, 300),
  ],
}

/** One answer per file, as the Host would give it. */
export const patches: ReadonlyMap<ChangedFilePath, ChangePatch> = new Map([
  [CHAT_FRAME, { kind: 'patch', patch: CHAT_FRAME_PATCH }],
  [NOTIFICATIONS, { kind: 'patch', patch: NOTIFICATIONS_PATCH }],
  [ROADMAP, { kind: 'patch', patch: ROADMAP_PATCH }],
  [VERSION_AWARENESS, { kind: 'patch', patch: VERSION_AWARENESS_PATCH }],
  [OG_IMAGE, { kind: 'binary' }],
  [MESSAGE_QUEUE, { kind: 'patch', patch: MESSAGE_QUEUE_PATCH }],
  [COMPOSER_QUEUE, { kind: 'too-large', bytes: 1_437_212 }],
])

/** The two Host calls, answered after a short wait, or refused. */
export type FakeChangesServer = {
  readonly list: () => Promise<WorkspaceChanges>
  readonly get: (path: ChangedFilePath) => Promise<ChangePatch>
}

const wait = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })

export function fakeChangesServer(
  changes: WorkspaceChanges,
  { delayMs = 400, fails = false }: { readonly delayMs?: number; readonly fails?: boolean } = {},
): FakeChangesServer {
  return {
    list: async () => {
      await wait(delayMs)
      if (fails) throw new Error('That repository is not available on this machine')
      return changes
    },
    get: async (target) => {
      await wait(delayMs)
      const patch = patches.get(target)
      if (patch === undefined) throw new Error('That repository is not available on this machine')
      return patch
    },
  }
}
