import { FileTextIcon, ImageIcon } from '@phosphor-icons/react'
import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { ComposerAddMenu } from '@web/features/conversation/components/composer-add-menu.tsx'
import {
  PromptInput,
  PromptInputAttachments,
  PromptInputBody,
  PromptInputFooter,
  PromptInputProvider,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  usePromptInputAttachments,
  type PromptInputMessage,
} from '@web/ui/components/ai-elements/prompt-input.tsx'
import { Button } from '@web/ui/components/ui/button.tsx'
import { useState } from 'react'
import { INITIAL_VIEWPORTS } from 'storybook/viewport'

const COMMANDS = [
  { name: 'review', description: 'Review the current changes' },
  { name: 'test', description: 'Run the test suite' },
  { name: 'commit', description: 'Commit staged changes' },
]

const meta = {
  title: 'Design System/AI/Composer',
  parameters: { layout: 'fullscreen', viewport: { options: INITIAL_VIEWPORTS } },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

/**
 * The composer with real files in it.
 *
 * The seed buttons make a file in the browser, so the row fills without a file
 * dialog. `+` opens the real menu, X takes a file out, Enter sends and clears.
 */
export const Interactive: Story = {
  render: () => <Composer />,
}

/** The same composer at phone width: `+` opens the sheet, not the menu. */
export const Phone: Story = {
  globals: { viewport: { value: 'iphone14', isRotated: false } },
  render: () => <Composer />,
}

function Composer() {
  const [sent, setSent] = useState<PromptInputMessage | null>(null)
  const [command, setCommand] = useState<string | null>(null)

  return (
    <PromptInputProvider>
      <main className="container-column shell-x flex min-h-svh flex-col justify-end gap-4 py-6">
        <Seed />
        <output aria-live="polite" className="flex flex-col text-muted-foreground">
          {sent === null ? (
            <small>Nothing sent yet.</small>
          ) : (
            <small>
              Sent “{sent.text}” with {sent.files.length} file{sent.files.length === 1 ? '' : 's'}.
            </small>
          )}
          {command === null ? null : <small>Command /{command}.</small>}
        </output>
        <PromptInput onSubmit={(message) => setSent(message)}>
          <PromptInputBody>
            <PromptInputAttachments />
            <PromptInputTextarea placeholder="Message Grok…" />
            <PromptInputFooter>
              <PromptInputTools>
                <ComposerAddMenu commands={COMMANDS} disabled={false} onCommand={setCommand} />
              </PromptInputTools>
              <PromptInputSubmit className="ml-auto" status="ready" />
            </PromptInputFooter>
          </PromptInputBody>
        </PromptInput>
      </main>
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
