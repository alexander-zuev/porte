import type { ChangedFilePath, UncommittedChanges } from '@porte/core/client'
import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { useQuery } from '@tanstack/react-query'
import { ConversationChanges } from '@web/features/conversation/components/conversation-changes.tsx'
import type { FileDiffView, ChangesView } from '@web/features/conversation/models/changes.ts'
import { PromptInputProvider } from '@web/ui/components/ai-elements/prompt-input.tsx'
import { AppHeader } from '@web/ui/components/layout/app-header.tsx'
import { AppShell } from '@web/ui/components/layout/app-shell.tsx'
import { useMemo, useState } from 'react'
import { INITIAL_VIEWPORTS } from 'storybook/viewport'

import {
  CHAT_FRAME,
  COMPOSER_QUEUE,
  OG_IMAGE,
  deepChanges,
  fakeChangesServer,
  noChanges,
  uncommittedChanges,
  type FakeChangesServer,
} from '../fixtures/changes.ts'
import { olderTurns, relayState, session } from '../fixtures/transcript.ts'
import { ChatFrame } from '../harnesses/chat-frame.tsx'

/*
 * Diff sheet, low-fi. Spec: docs/diff-sheet.md.
 *
 * - the pill above the composer counts the uncommitted changes
 * - the sheet lists every changed file with its counts
 * - a tapped file pushes its diff in from the right; back returns to the list
 * - the data side is a fake Host: two calls, answered after 400 ms
 *
 * Width comes from the viewport toolbar or the browser's device mode.
 */

const meta = {
  title: 'Design System/AI/Conversation Changes',
  parameters: { layout: 'fullscreen', viewport: { options: INITIAL_VIEWPORTS } },
} satisfies Meta

export default meta

/** The pill, closed. */
export const Changed: StoryObj = { render: () => <ChangesHarness /> }

/** The file list. */
export const SheetOpen: StoryObj = { render: () => <ChangesHarness defaultOpen /> }

/** One file's diff, three hunks, context and hunk rows. */
export const FileOpen: StoryObj = {
  render: () => <ChangesHarness defaultOpen defaultPath={CHAT_FRAME} />,
}

/** A binary file has no diff to show. */
export const BinaryFile: StoryObj = {
  render: () => <ChangesHarness defaultOpen defaultPath={OG_IMAGE} />,
}

/** Above the size cap: the size, not the patch. */
export const TooLarge: StoryObj = {
  render: () => <ChangesHarness defaultOpen defaultPath={COMPOSER_QUEUE} />,
}

/** Twelve segments deep, names wider than a phone, spaces, no extension, six-digit counts. */
export const DeepTree: StoryObj = {
  render: () => <ChangesHarness defaultOpen changes={deepChanges} />,
}

/** A clean tree draws nothing. */
export const Clean: StoryObj = { render: () => <ChangesHarness changes={noChanges} /> }

/** The Host refused: the pill is the retry. */
export const Failed: StoryObj = { render: () => <ChangesHarness fails /> }

function ChangesHarness({
  changes = uncommittedChanges,
  defaultOpen = false,
  defaultPath = null,
  fails = false,
}: {
  readonly changes?: UncommittedChanges
  readonly defaultOpen?: boolean
  readonly defaultPath?: ChangedFilePath | null
  readonly fails?: boolean
}) {
  const server = useMemo(() => fakeChangesServer(changes, { fails }), [changes, fails])
  const [selected, setSelected] = useState<ChangedFilePath | null>(defaultPath)
  const list = useChangesList(server, changes)
  const diff = useFileDiff(server, selected)

  return (
    <PromptInputProvider>
      <AppShell header={<AppHeader />} variant="fill">
        <ChatFrame
          canSend
          changes={
            <ConversationChanges
              changes={list}
              defaultOpen={defaultOpen}
              diff={diff}
              selected={selected}
              onSelect={setSelected}
            />
          }
          messages={[...olderTurns, ...session]}
          permissions={[]}
          placeholder="Message Grok…"
          state={{ ...relayState, plans: [] }}
          status="ready"
        />
      </AppShell>
    </PromptInputProvider>
  )
}

/** The story's stand-in for `useChanges`: one query per fake Host. */
function useChangesList(server: FakeChangesServer, changes: UncommittedChanges): ChangesView {
  const query = useQuery({
    queryKey: ['story', 'changes', 'list', changes.files.length, server],
    queryFn: () => server.list(),
  })
  if (query.status === 'success') {
    return { status: 'ready', files: query.data.files, branch: query.data.branch }
  }
  if (query.status === 'error') {
    return {
      status: 'failed',
      onRetry: () => {
        void query.refetch()
      },
    }
  }
  return { status: 'pending' }
}

/** The story's stand-in for `useFileDiff`: one query per tapped file. */
function useFileDiff(server: FakeChangesServer, path: ChangedFilePath | null): FileDiffView {
  const query = useQuery({
    queryKey: ['story', 'changes', 'file', path, server],
    queryFn: () => server.get(path ?? CHAT_FRAME),
    enabled: path !== null,
  })
  if (query.status === 'success') return { status: 'ready', diff: query.data }
  if (query.status === 'error') {
    return {
      status: 'failed',
      onRetry: () => {
        void query.refetch()
      },
    }
  }
  return { status: 'pending' }
}
