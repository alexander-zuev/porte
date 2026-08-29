import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { PAIR_COMMAND } from '@web/lib/product.ts'

/**
 * The 1200×630 share card behind `og:image`.
 *
 * Not app UI: it is photographed once into `public/og.png` (see the story
 * notes), so it lives here with the other pages and follows their tokens.
 * The wordmark is redrawn at card scale rather than through `Logo`, whose
 * sizes are for screens.
 */
function SocialCard() {
  return (
    <div className="flex h-[630px] w-[1200px] flex-col justify-between bg-background p-20 text-foreground">
      <span className="font-brand text-[96px] leading-none font-bold tracking-[var(--tracking-display)]">
        Porte
        <span
          aria-hidden
          className="ml-[0.12em] inline-block h-[1em] w-[0.4em] translate-y-[0.14em] bg-current"
        />
      </span>
      <p className="text-[56px] leading-[1.1] font-bold tracking-[var(--tracking-display)]">
        Grok stays on your machine.
        <br />
        <span className="text-muted-foreground">You do not have to.</span>
      </p>
      <div className="flex items-end justify-between text-[28px]">
        <code className="rounded-xl border border-border bg-surface px-6 py-3 font-mono">
          $ {PAIR_COMMAND}
        </code>
        <span className="font-mono text-muted-foreground">useporte.dev</span>
      </div>
    </div>
  )
}

const meta = {
  title: 'Pages/Social card',
  component: SocialCard,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof SocialCard>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Regenerate the file: with Storybook running,
 * `pnpm exec playwright screenshot --viewport-size=1200,630 "http://localhost:6006/iframe.html?id=pages-social-card--card&viewMode=story" public/og.png`
 */
export const Card: Story = {}
