import {
  CaretDownIcon,
  ChatCircleIcon,
  CheckCircleIcon,
  InfoIcon,
  PlusIcon,
  WarningCircleIcon,
} from '@phosphor-icons/react'
import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { HostStatus } from '@web/ui/components/host-status.tsx'
import { HoverOrTap } from '@web/ui/components/hover-or-tap.tsx'
import { TerminalCommand } from '@web/ui/components/terminal-command.tsx'
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@web/ui/components/ui/alert.tsx'
import { Badge } from '@web/ui/components/ui/badge.tsx'
import { Button } from '@web/ui/components/ui/button.tsx'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@web/ui/components/ui/card.tsx'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@web/ui/components/ui/collapsible.tsx'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@web/ui/components/ui/empty.tsx'
import { ScrollArea } from '@web/ui/components/ui/scroll-area.tsx'
import { Separator } from '@web/ui/components/ui/separator.tsx'
import { Skeleton } from '@web/ui/components/ui/skeleton.tsx'
import { Toaster, toast } from '@web/ui/components/ui/sonner.tsx'
import { useEffect } from 'react'

import { Board, Section, Specimen } from './board.tsx'

const LOG_LINES = Array.from(
  { length: 12 },
  (_, index) => `[14:0${index % 10}] relay: frame ${index + 1} delivered`,
)

function SurfacesBoard() {
  return (
    <Board
      title="Surfaces"
      summary="Containers and messages. Elevation comes from a border and a step change in gray, never from a shadow."
    >
      <Section title="Card" note="A card groups one object. Its title says which object.">
        <Specimen label="With action and footer" stack>
          <Card>
            <CardHeader>
              <CardTitle>Alexander's MacBook Pro</CardTitle>
              <CardDescription>Paired on 19 August 2026</CardDescription>
              <CardAction>
                <Badge variant="success">Online</Badge>
              </CardAction>
            </CardHeader>
            <CardContent>
              <HostStatus detail="Last seen 2 minutes ago" status="online" />
            </CardContent>
            <CardFooter className="gap-2">
              <Button size="sm" variant="outline">
                Rename
              </Button>
              <Button size="sm" variant="destructive">
                Unpair
              </Button>
            </CardFooter>
          </Card>
        </Specimen>

        <Specimen label="Compact" stack>
          <Card size="sm">
            <CardHeader>
              <CardDescription>Conversations today</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-display">7</p>
              <small className="text-muted-foreground">Three still open</small>
            </CardContent>
          </Card>
        </Specimen>

        <Specimen label="Loading" stack>
          <Card>
            <CardHeader>
              <Skeleton className="h-4 w-40" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </CardContent>
          </Card>
        </Specimen>

        <Specimen label="As a list row" stack>
          <Card size="sm">
            <CardHeader>
              <CardTitle>Relay reconnect loop</CardTitle>
              <CardDescription>/Users/az/projects/porte · 4 minutes ago</CardDescription>
              <CardAction>
                <Button aria-label="Open conversation" size="icon-sm" variant="ghost">
                  <ChatCircleIcon />
                </Button>
              </CardAction>
            </CardHeader>
          </Card>
        </Specimen>
      </Section>

      <Section
        title="Alert"
        note="An alert states one condition and what to do next. Color repeats the words."
      >
        <Specimen label="Default" stack>
          <Alert>
            <InfoIcon />
            <AlertTitle>Host is offline</AlertTitle>
            <AlertDescription>Open the daemon on the Mac, then retry.</AlertDescription>
          </Alert>
        </Specimen>
        <Specimen label="Warning" stack>
          <Alert variant="warning">
            <WarningCircleIcon />
            <AlertTitle>Pairing expires in two minutes</AlertTitle>
            <AlertDescription>Approve it on the Mac or start again.</AlertDescription>
          </Alert>
        </Specimen>
        <Specimen label="Destructive" stack>
          <Alert variant="destructive">
            <WarningCircleIcon />
            <AlertTitle>We could not delete your account</AlertTitle>
            <AlertDescription>
              The relay refused the request. Try again, or <a href="#support">contact support</a>.
            </AlertDescription>
          </Alert>
        </Specimen>
        <Specimen label="With an action" stack>
          <Alert>
            <CheckCircleIcon />
            <AlertTitle>Reconnected</AlertTitle>
            <AlertDescription>The Mac answered after 12 seconds.</AlertDescription>
            <AlertAction>
              <Button size="xs" variant="ghost">
                Dismiss
              </Button>
            </AlertAction>
          </Alert>
        </Specimen>
        <Specimen label="Title only" stack wide>
          <Alert>
            <AlertTitle>Read-only: this conversation ended on the Mac.</AlertTitle>
          </Alert>
        </Specimen>
      </Section>

      <Section
        title="Empty"
        note="Nothing here yet is a state, not an error. It offers the next step."
      >
        <Specimen label="First run" stack wide>
          <Empty className="border border-border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ChatCircleIcon />
              </EmptyMedia>
              <EmptyTitle>No conversations yet</EmptyTitle>
              <EmptyDescription>
                Start one from the browser and it runs on your Mac.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button>
                <PlusIcon data-icon="inline-start" />
                New conversation
              </Button>
            </EmptyContent>
          </Empty>
        </Specimen>
      </Section>

      <Section title="Disclosure and overflow" note="Long content collapses or scrolls in place.">
        <Specimen label="Collapsible" stack>
          <Collapsible className="flex flex-col gap-2" defaultOpen>
            <CollapsibleTrigger render={<Button className="w-fit" size="sm" variant="ghost" />}>
              <CaretDownIcon data-icon="inline-start" />
              Reasoning
            </CollapsibleTrigger>
            <CollapsibleContent className="rounded-md border border-border p-3">
              <p className="text-muted-foreground">
                The relay dropped the line, so the turn replays from the last delivered frame.
              </p>
            </CollapsibleContent>
          </Collapsible>
        </Specimen>
        <Specimen label="Scroll area" stack>
          <ScrollArea className="h-40 w-full rounded-md border border-border p-3">
            <div className="flex flex-col gap-1">
              {LOG_LINES.map((line) => (
                <code className="bg-transparent p-0" key={line}>
                  {line}
                </code>
              ))}
            </div>
          </ScrollArea>
        </Specimen>
      </Section>

      <Section title="Product surfaces" note="Small compositions the product repeats everywhere.">
        <Specimen label="Host status" stack>
          <HostStatus status="online" detail="Last seen just now" />
          <HostStatus status="reconnecting" />
          <HostStatus status="offline" detail="Since 13:40" />
          <HostStatus status="loading" />
        </Specimen>
        <Specimen label="Hint on a control" note="Tooltip with a pointer, popover on tap">
          <HoverOrTap label="Stops the current turn">
            <Button variant="outline">Stop</Button>
          </HoverOrTap>
        </Specimen>
        <Specimen label="Terminal command" stack wide>
          <TerminalCommand command="npx porte@latest pair" />
          <Separator />
          <TerminalCommand command="curl -fsSL https://porte.dev/install.sh | sh" />
        </Specimen>
      </Section>
    </Board>
  )
}

/** Toasts need a host and an event, so this board raises them on mount. */
function ToastBoard() {
  useEffect(() => {
    toast('Conversation resumed', {
      description: 'The Mac answered after 12 seconds.',
      duration: Number.POSITIVE_INFINITY,
    })
    toast.success('Paired with Alexander’s MacBook Pro', {
      duration: Number.POSITIVE_INFINITY,
    })
    toast.error('The relay refused the request', {
      description: 'Nothing was deleted. Try again.',
      duration: Number.POSITIVE_INFINITY,
    })
    return () => {
      toast.dismiss()
    }
  }, [])

  return (
    <Board
      title="Toast"
      summary="A toast reports something that already happened. It never holds the only way to recover."
    >
      <Section title="Raised messages" note="Neutral, success, and failure, held open for review.">
        <Specimen label="Host" wide>
          <p className="text-muted-foreground">Three toasts sit in the bottom corner.</p>
        </Specimen>
      </Section>
      <Toaster />
    </Board>
  )
}

/** Copy nobody planned for: the case that decides whether the box wraps or tears. */
function LongToastBoard() {
  useEffect(() => {
    toast('Reconnecting to Alexander’s MacBook Pro over the Porte relay', {
      description:
        'The daemon stopped answering while the turn was running. Porte keeps the transcript and retries on its own; nothing you typed was lost, and the conversation reopens where it stopped.',
      duration: Number.POSITIVE_INFINITY,
    })
    toast.error(
      'The relay refused the request because the credential for this Mac was revoked somewhere else',
      { duration: Number.POSITIVE_INFINITY },
    )
    toast.success('Paired', {
      description:
        'porte-daemon@1.4.0 on macOS 15.2, /Users/az/projects/porte-with-a-very-long-directory-name',
      duration: Number.POSITIVE_INFINITY,
    })
    return () => {
      toast.dismiss()
    }
  }, [])

  return (
    <Board
      title="Toast"
      summary="The same three toasts carrying copy longer than the box. Nothing may clip, and no word may run past the edge."
    >
      <Section title="Long copy" note="A long title, a long description, and an unbreakable path.">
        <Specimen label="Host" wide>
          <p className="text-muted-foreground">Three toasts sit in the bottom corner.</p>
        </Specimen>
      </Section>
      <Toaster />
    </Board>
  )
}

const meta = {
  title: 'Design System/Components/Surfaces',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const All: Story = { render: () => <SurfacesBoard /> }
export const Toasts: Story = { render: () => <ToastBoard /> }
export const ToastsLongCopy: Story = { render: () => <LongToastBoard /> }
