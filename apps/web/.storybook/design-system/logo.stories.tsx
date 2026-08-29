import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { Logo, LogoMark } from '@web/ui/components/logo.tsx'

const SIZES = [
  { size: 'sm', note: '18px — page headers, next to 14px nav text' },
  { size: 'md', note: '24px — pairing and sign-in surfaces' },
  { size: 'lg', note: '40px — display lockups' },
] as const

/** Every wordmark size on one board, so the caret can be judged across the scale. */
function LogoBoard() {
  return (
    <main className="flex min-h-svh flex-col justify-center gap-12 bg-background px-10 py-16 text-foreground">
      <h1 className="sr-only">Logo</h1>
      {SIZES.map(({ size, note }) => (
        <div key={size} className="flex flex-col gap-2">
          <Logo size={size} />
          <small className="text-muted-foreground">
            {size} · {note}
          </small>
        </div>
      ))}

      <div className="flex flex-col gap-2 border-t border-border pt-10">
        <div className="flex items-baseline gap-4">
          <Logo size="sm" />
          <span className="text-sm font-medium">Sign in</span>
        </div>
        <small className="text-muted-foreground">
          Against nav text, where the caret is smallest and most likely to break
        </small>
      </div>

      <div className="flex flex-col gap-4 border-t border-border pt-10">
        <div className="flex items-end gap-6">
          <IconTile size={16} />
          <IconTile size={32} />
          <IconTile size={64} />
          <IconTile size={180} />
        </div>
        <small className="text-muted-foreground">
          The mark: favicon at 16 and 32, home-screen tile at 180. Same drawing as the wordmark's
          first letter and caret.
        </small>
      </div>
    </main>
  )
}

/**
 * The app icon: the mark centred on a square of the page background.
 *
 * `maskable` keeps the mark inside the 80% safe circle Android crops to.
 */
function IconTile({
  size,
  maskable = false,
}: {
  readonly size: number
  readonly maskable?: boolean
}) {
  return (
    <div
      className="flex shrink-0 items-center justify-center bg-background text-foreground"
      style={{ width: size, height: size, fontSize: size * (maskable ? 0.44 : 0.62) }}
    >
      <LogoMark className="-translate-y-[0.04em]" />
    </div>
  )
}

const meta = {
  title: 'Design System/Logo',
  component: LogoBoard,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof LogoBoard>

export default meta
type Story = StoryObj<typeof meta>

export const AllSizes: Story = {}

/**
 * The export source for `public/icon-512.png`; the other sizes are downscaled from it:
 * `pnpm exec playwright screenshot --viewport-size=512,512 "http://localhost:6006/iframe.html?id=design-system-logo--icon&viewMode=story&globals=theme:dark" public/icon-512.png`
 */
export const Icon: Story = {
  render: () => <IconTile size={512} />,
}

/** Export source for `public/icon-maskable-512.png`: same URL with `--icon-maskable`. */
export const IconMaskable: Story = {
  render: () => <IconTile maskable size={512} />,
}
