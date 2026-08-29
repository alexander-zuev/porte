import { FileTextIcon, ImageIcon } from '@phosphor-icons/react'
import type { Meta, StoryObj } from '@storybook/tanstack-react'
import {
  PromptInputProvider,
  usePromptInputAttachments,
  type PromptInputMessage,
} from '@web/ui/components/ai-elements/prompt-input.tsx'
import { AppHeader } from '@web/ui/components/layout/app-header.tsx'
import { AppShell } from '@web/ui/components/layout/app-shell.tsx'
import { Button } from '@web/ui/components/ui/button.tsx'
import { useState } from 'react'
import { INITIAL_VIEWPORTS } from 'storybook/viewport'

import {
  commandsFailed,
  commandsPending,
  commandsReady,
  emptyRelayState,
  relayState,
} from '../fixtures/transcript.ts'
import { ChatFrame } from '../harnesses/chat-frame.tsx'

/*
 * The composer, with real files in it and every list the `+` menu can show.
 *
 * - textarea with the placeholder; Enter sends, an empty send is a no-op
 * - attachment row above the words: photo thumbnails, named files, remove
 * - `+`: a menu from md up, a sheet on a phone (Camera, Photos, Add files,
 *   commands with their descriptions); the list is pending, failed, or ready
 * - Model and Mode from live state (md up); context ring with the cost
 * - the submit control; the send lands in the line under the seed buttons
 *
 * Width comes from the viewport toolbar; the phone sheet needs a phone.
 */

const COMMAND_LISTS = { ready: commandsReady, pending: commandsPending, failed: commandsFailed }
type CommandList = keyof typeof COMMAND_LISTS

const meta = {
  title: 'Design System/AI/Composer',
  parameters: { layout: 'fullscreen', viewport: { options: INITIAL_VIEWPORTS } },
} satisfies Meta

export default meta

/**
 * The seed buttons make a file in the browser, so the row fills without a
 * file dialog. `+` opens the real menu or sheet, X takes a file out, Enter
 * sends and clears. `commands` picks what the menu finds when it opens.
 */
export const Interactive: StoryObj<{ commands: CommandList; usage: boolean }> = {
  args: { commands: 'ready', usage: true },
  argTypes: { commands: { control: 'select', options: Object.keys(COMMAND_LISTS) } },
  render: (args) => <Composer commands={args.commands} usage={args.usage} />,
}

function Composer({
  commands,
  usage,
}: {
  readonly commands: CommandList
  readonly usage: boolean
}) {
  const [sent, setSent] = useState<PromptInputMessage | null>(null)
  const [command, setCommand] = useState<string | null>(null)

  return (
    <PromptInputProvider>
      <AppShell header={<AppHeader />} variant="fill">
        <div className="flex flex-col gap-2 px-3">
          <Seed />
          <output aria-live="polite" className="flex flex-col text-muted-foreground">
            {sent === null ? (
              <small>Nothing sent yet.</small>
            ) : (
              <small>
                Sent “{sent.text}” with {sent.files.length} file
                {sent.files.length === 1 ? '' : 's'}.
              </small>
            )}
            {command === null ? null : <small>Command /{command}.</small>}
          </output>
        </div>
        <ChatFrame
          messages={[]}
          state={usage ? { ...relayState, plans: [] } : emptyRelayState}
          commands={COMMAND_LISTS[commands]}
          permissions={[]}
          status="ready"
          canSend
          placeholder="Message Grok…"
          onSend={setSent}
          onCommand={setCommand}
        />
      </AppShell>
    </PromptInputProvider>
  )
}

/** Story-only: puts a file in the set the way the picker would, without the picker. */
function Seed() {
  const attachments = usePromptInputAttachments()

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          void makePhoto().then((photo) => attachments.add([photo]))
        }}
      >
        <ImageIcon aria-hidden />
        Add a photo
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          attachments.add([
            new File(['# Notes\n\nRead the relay first.'], 'notes.md', { type: 'text/markdown' }),
          ])
        }}
      >
        <FileTextIcon aria-hidden />
        Add a document
      </Button>
    </div>
  )
}

/** A different colour each time, so two photos in the row can be told apart. */
async function makePhoto(): Promise<File> {
  const canvas = document.createElement('canvas')
  canvas.width = 320
  canvas.height = 240
  const context = canvas.getContext('2d')
  if (context !== null) {
    const hue = Math.floor(Math.random() * 360)
    const fill = context.createLinearGradient(0, 0, 320, 240)
    fill.addColorStop(0, `hsl(${String(hue)} 70% 55%)`)
    fill.addColorStop(1, `hsl(${String((hue + 60) % 360)} 70% 35%)`)
    context.fillStyle = fill
    context.fillRect(0, 0, 320, 240)
  }
  // oxlint-disable-next-line eslint-plugin-promise(avoid-new) -- toBlob is callback-based.
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/png')
  })
  return new File([blob ?? new Blob()], `photo-${String(Date.now())}.png`, { type: 'image/png' })
}
