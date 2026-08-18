import { PlusIcon } from '@phosphor-icons/react'
import type { Meta, StoryObj } from '@storybook/tanstack-react'

import { HostStatus } from '#/ui/components/host-status.tsx'
import { Alert, AlertDescription, AlertTitle } from '#/ui/components/ui/alert.tsx'
import { Badge } from '#/ui/components/ui/badge.tsx'
import { Button } from '#/ui/components/ui/button.tsx'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '#/ui/components/ui/card.tsx'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '#/ui/components/ui/empty.tsx'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '#/ui/components/ui/field.tsx'
import { InputOTP, InputOTPGroup, InputOTPSlot } from '#/ui/components/ui/input-otp.tsx'
import { Input } from '#/ui/components/ui/input.tsx'
import { Separator } from '#/ui/components/ui/separator.tsx'
import { Textarea } from '#/ui/components/ui/textarea.tsx'

const COLOR_TOKENS = [
  { name: 'background', swatch: 'bg-background' },
  { name: 'foreground', swatch: 'bg-foreground' },
  { name: 'card', swatch: 'bg-card' },
  { name: 'card-foreground', swatch: 'bg-card-foreground' },
  { name: 'popover', swatch: 'bg-popover' },
  { name: 'popover-foreground', swatch: 'bg-popover-foreground' },
  { name: 'primary', swatch: 'bg-primary' },
  { name: 'primary-foreground', swatch: 'bg-primary-foreground' },
  { name: 'secondary', swatch: 'bg-secondary' },
  { name: 'secondary-foreground', swatch: 'bg-secondary-foreground' },
  { name: 'muted', swatch: 'bg-muted' },
  { name: 'muted-foreground', swatch: 'bg-muted-foreground' },
  { name: 'accent', swatch: 'bg-accent' },
  { name: 'accent-foreground', swatch: 'bg-accent-foreground' },
  { name: 'destructive', swatch: 'bg-destructive' },
  { name: 'border', swatch: 'bg-border' },
  { name: 'input', swatch: 'bg-input' },
  { name: 'ring', swatch: 'bg-ring' },
  { name: 'status-online', swatch: 'bg-status-online' },
  { name: 'status-offline', swatch: 'bg-status-offline' },
] as const

const TEXT_PAIRS = [
  { fg: 'text-foreground', bg: 'bg-background', label: 'body on page' },
  { fg: 'text-foreground', bg: 'bg-card', label: 'body on card' },
  { fg: 'text-muted-foreground', bg: 'bg-background', label: 'secondary on page' },
  { fg: 'text-muted-foreground', bg: 'bg-muted', label: 'secondary on muted' },
  { fg: 'text-primary-foreground', bg: 'bg-primary', label: 'primary button' },
  { fg: 'text-destructive', bg: 'bg-background', label: 'error copy' },
] as const

const RADII = [
  { name: 'sm', className: 'rounded-sm' },
  { name: 'md', className: 'rounded-md' },
  { name: 'lg', className: 'rounded-lg' },
  { name: 'xl', className: 'rounded-xl' },
] as const

function Tokens() {
  return (
    <main className="dark mx-auto flex max-w-3xl flex-col gap-12 bg-background px-5 py-10 text-foreground">
      <header className="flex flex-col gap-2">
        <h1>Design system</h1>
        <p className="text-muted-foreground">
          Inter + grok.com dark. Colors and type live in ui/stylesheets. Use the HTML element. Do
          not set size, leading, or tracking on the component.
        </p>
      </header>

      <section className="flex flex-col gap-4">
        <h2>Color</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {COLOR_TOKENS.map((token) => (
            <div className="flex flex-col gap-2" key={token.name}>
              <div className={`h-14 rounded-lg border border-border ${token.swatch}`} />
              <small className="text-muted-foreground">{token.name}</small>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2>Contrast</h2>
        <div className="flex flex-col gap-2">
          {TEXT_PAIRS.map((pair) => (
            <p className={`rounded-md px-3 py-2 ${pair.bg} ${pair.fg}`} key={pair.label}>
              {pair.label}
            </p>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2>Type</h2>
        <p className="text-display-hero">Display hero</p>
        <h1>Heading 1</h1>
        <h2>Heading 2</h2>
        <h3>Heading 3</h3>
        <h4>Heading 4</h4>
        <h5>Heading 5</h5>
        <h6>Heading 6</h6>
        <p>Body. One size for copy. Muted for secondary.</p>
        <p className="text-muted-foreground">Muted. Paths, status, help text.</p>
        <small>Caption. Timestamps, metadata, legal.</small>
      </section>

      <section className="flex flex-col gap-4">
        <h2>Radius</h2>
        <div className="flex flex-wrap items-end gap-3">
          {RADII.map((radius) => (
            <div className="flex flex-col items-center gap-2" key={radius.name}>
              <div className={`size-14 border border-border bg-muted ${radius.className}`} />
              <small className="text-muted-foreground">{radius.name}</small>
            </div>
          ))}
        </div>
        <p className="text-muted-foreground">Shadows are none. Elevation is border only.</p>
      </section>

      <section className="flex flex-col gap-4">
        <h2>Status</h2>
        <div className="flex flex-col gap-3">
          <HostStatus online />
          <HostStatus online={false} />
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2>Buttons</h2>
        <div className="flex flex-wrap items-center gap-3">
          <Button>Primary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm">
            <PlusIcon data-icon="inline-start" />
            Small
          </Button>
          <Button size="lg">Large</Button>
          <Button disabled>Disabled</Button>
          <Button aria-label="Add" size="icon">
            <PlusIcon />
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2>Badge</h2>
        <div className="flex flex-wrap gap-2">
          <Badge>Default</Badge>
          <Badge variant="secondary">Secondary</Badge>
          <Badge variant="outline">Outline</Badge>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2>Forms</h2>
        <FieldGroup className="max-w-md gap-4">
          <Field>
            <FieldLabel htmlFor="ds-message">Message</FieldLabel>
            <Input aria-label="Message" defaultValue="Resume yesterday" id="ds-message" />
            <FieldDescription>Visible help. Do not hide this in a tooltip.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="ds-note">Note</FieldLabel>
            <Textarea aria-label="Note" defaultValue="Optional context" id="ds-note" />
          </Field>
          <Field>
            <FieldLabel htmlFor="ds-otp">Pairing code</FieldLabel>
            <InputOTP
              containerClassName="w-full justify-center"
              defaultValue="7K2M9Q"
              id="ds-otp"
              maxLength={6}
            >
              <InputOTPGroup className="justify-center">
                <InputOTPSlot index={0} />
                <InputOTPSlot index={1} />
                <InputOTPSlot index={2} />
                <InputOTPSlot index={3} />
                <InputOTPSlot index={4} />
                <InputOTPSlot index={5} />
              </InputOTPGroup>
            </InputOTP>
          </Field>
        </FieldGroup>
      </section>

      <section className="flex flex-col gap-4">
        <h2>Feedback</h2>
        <Alert>
          <AlertTitle>Host is offline</AlertTitle>
          <AlertDescription>Open the daemon on the Mac, then retry.</AlertDescription>
        </Alert>
        <Alert variant="destructive">
          <AlertTitle>That code is expired.</AlertTitle>
          <AlertDescription>Ask the daemon for a new six-character code.</AlertDescription>
        </Alert>
        <Empty className="border border-border">
          <EmptyHeader>
            <EmptyTitle>No conversations yet</EmptyTitle>
            <EmptyDescription>Pair a host, then start a session in a known repo.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </section>

      <section className="flex flex-col gap-4">
        <h2>Surface</h2>
        <Card className="max-w-md" size="sm">
          <CardHeader>
            <CardTitle>Card</CardTitle>
            <CardDescription>Border #374151. Radius 8px. No shadow.</CardDescription>
          </CardHeader>
          <CardContent>Use for grouped content. Chat uses Conversation, not Card.</CardContent>
        </Card>
        <Separator />
      </section>
    </main>
  )
}

const meta = {
  title: 'Design System/Tokens',
  component: Tokens,
} satisfies Meta<typeof Tokens>

export default meta
type Story = StoryObj<typeof meta>

export const Dark: Story = {}
