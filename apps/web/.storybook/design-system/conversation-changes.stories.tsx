import type { ChangedFilePath, UncommittedChanges } from '@porte/core/client'
import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { ConversationChanges } from '@web/features/conversation/components/conversation-changes.tsx'
import { useChangesSheet } from '@web/features/conversation/hooks/use-changes-sheet.ts'
import { PromptInputProvider } from '@web/ui/components/ai-elements/prompt-input.tsx'
import { AppHeader } from '@web/ui/components/layout/app-header.tsx'
import { AppShell } from '@web/ui/components/layout/app-shell.tsx'
import { useEffect, useMemo } from 'react'
import { INITIAL_VIEWPORTS } from 'storybook/viewport'

import {
  CHAT_FRAME,
  COMPOSER_QUEUE,
  OG_IMAGE,
  deepChanges,
  fakeChangesStub,
  noChanges,
  uncommittedChanges,
} from '../fixtures/changes.ts'
import { olderTurns, relayState, session } from '../fixtures/transcript.ts'
import { ChatFrame } from '../harnesses/chat-frame.tsx'

/*
 * Diff sheet, low-fi. Spec: docs/diff-sheet.md.
 *
 * - the pill above the composer counts the uncommitted changes
 * - the sheet lists every changed file with its counts
 * - a tapped file pushes its diff in from the right; back returns to the list
 * - the data side is the real hook over a fake stub: two calls, answered after 400 ms
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

/** One file's diff, three hunks, context and gap rows. */
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
  // One stub per story instance, so each story's cache is its own.
  const agent = useMemo(
    () => ({
      name: `story-${String(changes.files.length)}-${String(fails)}`,
      stub: fakeChangesStub(changes, { fails }),
    }),
    [changes, fails],
  )
  const sheet = useChangesSheet(agent, { enabled: true, runningTurnId: undefined })
  // Story-only: land on a file, the way a tap would.
  useEffect(() => {
    sheet.onSelect(defaultPath)
  }, [defaultPath, sheet.onSelect])

  return (
    <PromptInputProvider>
      <AppShell header={<AppHeader />} variant="fill">
        <ChatFrame
          canSend
          changes={<ConversationChanges {...sheet} defaultOpen={defaultOpen} />}
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
