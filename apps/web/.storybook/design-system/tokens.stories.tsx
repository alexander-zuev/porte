import type { Meta, StoryObj } from '@storybook/tanstack-react'

const COLOR_GROUPS = [
  {
    name: 'Foundation',
    description: 'The page canvas, default copy, and structural boundaries.',
    tokens: [
      {
        name: 'background',
        utility: 'bg-background',
        usage: 'Application canvas',
        swatch: 'bg-background',
      },
      {
        name: 'foreground',
        utility: 'text-foreground',
        usage: 'Primary content',
        swatch: 'bg-foreground',
      },
      {
        name: 'border',
        utility: 'border-border',
        usage: 'Structural boundaries',
        swatch: 'bg-border',
      },
      {
        name: 'ring',
        utility: 'ring-ring',
        usage: 'Keyboard focus',
        swatch: 'bg-ring',
      },
    ],
  },
  {
    name: 'Surfaces',
    description: 'Layers that group content without inventing local colors.',
    tokens: [
      {
        name: 'card',
        utility: 'bg-card',
        usage: 'Grouped content',
        swatch: 'bg-card',
      },
      {
        name: 'popover',
        utility: 'bg-popover',
        usage: 'Floating content',
        swatch: 'bg-popover',
      },
      {
        name: 'muted',
        utility: 'bg-muted',
        usage: 'Quiet surfaces',
        swatch: 'bg-muted',
      },
      {
        name: 'overlay',
        utility: 'bg-overlay',
        usage: 'Scrim base',
        swatch: 'bg-overlay',
      },
    ],
  },
  {
    name: 'Actions and feedback',
    description: 'Intent colors reinforce meaning; labels and icons still carry the message.',
    tokens: [
      {
        name: 'primary',
        utility: 'bg-primary',
        usage: 'Primary action',
        swatch: 'bg-primary',
      },
      {
        name: 'destructive',
        utility: 'text-destructive',
        usage: 'Failure or danger',
        swatch: 'bg-destructive',
      },
      {
        name: 'status-info',
        utility: 'text-status-info',
        usage: 'Acknowledged',
        swatch: 'bg-status-info',
      },
      {
        name: 'status-warning',
        utility: 'text-status-warning',
        usage: 'Needs attention',
        swatch: 'bg-status-warning',
      },
      {
        name: 'status-success',
        utility: 'text-status-success',
        usage: 'Completed or online',
        swatch: 'bg-status-success',
      },
    ],
  },
] as const

const RADII = [
  { name: 'Small', token: 'rounded-sm', className: 'rounded-sm' },
  { name: 'Medium', token: 'rounded-md', className: 'rounded-md' },
  { name: 'Large', token: 'rounded-lg', className: 'rounded-lg' },
  { name: 'Extra large', token: 'rounded-xl', className: 'rounded-xl' },
] as const

function TokenReference() {
  return (
    <main className="min-h-svh bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-5 py-10 md:px-8">
          <small className="text-muted-foreground uppercase">Foundation</small>
          <h1>Token reference</h1>
          <p className="max-w-2xl text-muted-foreground">
            Tokens name reusable visual decisions. Components request a role such as background,
            muted, or success; this layer decides how that role looks.
          </p>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-6xl flex-col gap-16 px-5 py-10 md:px-8 md:py-14">
        <section className="flex flex-col gap-8">
          <header className="flex max-w-2xl flex-col gap-2">
            <h2>Color roles</h2>
            <p className="text-muted-foreground">
              Use the utility shown below. Raw palette values belong only in the token stylesheet.
            </p>
          </header>

          <div className="flex flex-col gap-10">
            {COLOR_GROUPS.map((group) => (
              <section className="flex flex-col gap-4" key={group.name}>
                <header className="flex flex-col gap-1">
                  <h3>{group.name}</h3>
                  <p className="text-muted-foreground">{group.description}</p>
                </header>
                <div className="grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
                  {group.tokens.map((token) => (
                    <article className="flex flex-col gap-4 bg-background p-4" key={token.name}>
                      <div
                        aria-label={`${token.name} color sample`}
                        className={`h-16 rounded-lg border border-border ${token.swatch}`}
                      />
                      <div className="flex flex-col gap-1">
                        <h4>{token.name}</h4>
                        <small className="text-muted-foreground">{token.usage}</small>
                      </div>
                      <code className="w-fit">{token.utility}</code>
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </section>

        <section className="grid gap-8 border-t border-border pt-10 md:grid-cols-[minmax(0,1fr)_minmax(18rem,0.7fr)]">
          <div className="flex flex-col gap-6">
            <header className="flex flex-col gap-2">
              <h2>Typography</h2>
              <p className="text-muted-foreground">
                Semantic HTML owns the hierarchy. Display utilities are reserved for expressive
                marketing moments.
              </p>
            </header>
            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-1">
                <h1>Page heading</h1>
                <small className="text-muted-foreground">h1 · one per page</small>
              </div>
              <div className="flex flex-col gap-1">
                <h2>Section heading</h2>
                <small className="text-muted-foreground">h2 · major content group</small>
              </div>
              <div className="flex flex-col gap-1">
                <h3>Component heading</h3>
                <small className="text-muted-foreground">h3 · dialog, card, or panel</small>
              </div>
              <div className="flex flex-col gap-1">
                <p>Body copy carries the primary message at a comfortable reading size.</p>
                <small className="text-muted-foreground">p · default content</small>
              </div>
              <div className="flex flex-col gap-1">
                <p className="text-muted-foreground">
                  Muted copy supports the primary message without competing with it.
                </p>
                <small className="text-muted-foreground">
                  text-muted-foreground · supporting copy
                </small>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-6">
            <header className="flex flex-col gap-2">
              <h2>Shape</h2>
              <p className="text-muted-foreground">
                Radius communicates scale. Elevation uses borders, not shadows.
              </p>
            </header>
            <div className="grid grid-cols-2 gap-3">
              {RADII.map((radius) => (
                <div className="flex flex-col gap-3" key={radius.name}>
                  <div className={`h-20 border border-border bg-muted ${radius.className}`} />
                  <div className="flex flex-col gap-1">
                    <h4>{radius.name}</h4>
                    <code className="w-fit">{radius.token}</code>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}

const meta = {
  title: 'Design System/Tokens',
  component: TokenReference,
} satisfies Meta<typeof TokenReference>

export default meta
type Story = StoryObj<typeof meta>

export const Reference: Story = {}
