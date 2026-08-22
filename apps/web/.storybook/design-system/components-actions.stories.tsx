import {
  ArrowRightIcon,
  CheckIcon,
  DotsThreeIcon,
  GearIcon,
  PlusIcon,
  TrashIcon,
  UserIcon,
} from '@phosphor-icons/react'
import type { Meta, StoryObj } from '@storybook/tanstack-react'
import {
  Avatar,
  AvatarBadge,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
} from '@web/ui/components/ui/avatar.tsx'
import { Badge } from '@web/ui/components/ui/badge.tsx'
import {
  ButtonGroup,
  ButtonGroupSeparator,
  ButtonGroupText,
} from '@web/ui/components/ui/button-group.tsx'
import { Button } from '@web/ui/components/ui/button.tsx'
import { Separator } from '@web/ui/components/ui/separator.tsx'
import { Skeleton } from '@web/ui/components/ui/skeleton.tsx'
import { Spinner } from '@web/ui/components/ui/spinner.tsx'

import { Board, Section, Specimen } from './board.tsx'

const BUTTON_VARIANTS = ['default', 'secondary', 'outline', 'ghost', 'destructive', 'link'] as const

const BUTTON_SIZES = ['xs', 'sm', 'default', 'lg'] as const

const ICON_SIZES = ['icon-xs', 'icon-sm', 'icon', 'icon-lg'] as const

const BADGE_VARIANTS = [
  'default',
  'secondary',
  'neutral',
  'outline',
  'success',
  'warning',
  'info',
  'destructive',
  'ghost',
  'link',
] as const

function ActionsBoard() {
  return (
    <Board
      title="Actions"
      summary="Every button, badge, and identity control the product can render, including the states a page reaches only under load or failure."
    >
      <Section
        title="Button variants"
        note="One primary action per view. Everything else is quieter than it."
      >
        {BUTTON_VARIANTS.map((variant) => (
          <Specimen key={variant} label={variant} note={`variant="${variant}"`}>
            <Button variant={variant}>Rest</Button>
            <Button variant={variant} disabled>
              Disabled
            </Button>
            <Button variant={variant} aria-invalid="true">
              Invalid
            </Button>
            <Button variant={variant}>
              <PlusIcon data-icon="inline-start" />
              With icon
            </Button>
          </Specimen>
        ))}
      </Section>

      <Section title="Button sizes" note="Heights step 24, 32, 36, and 40 pixels.">
        <Specimen label="Text sizes" note="xs, sm, default, lg">
          {BUTTON_SIZES.map((size) => (
            <Button key={size} size={size}>
              {size}
            </Button>
          ))}
        </Specimen>
        <Specimen label="Icon sizes" note="Square buttons carry a visible name for screen readers">
          {ICON_SIZES.map((size) => (
            <Button key={size} size={size} variant="outline" aria-label={`Settings ${size}`}>
              <GearIcon />
            </Button>
          ))}
        </Specimen>
        <Specimen label="Icon placement" note="data-icon marks the padding side">
          <Button>
            <PlusIcon data-icon="inline-start" />
            New session
          </Button>
          <Button variant="outline">
            Continue
            <ArrowRightIcon data-icon="inline-end" />
          </Button>
        </Specimen>
        <Specimen
          label="Busy and complete"
          note="Work in flight keeps the label and blocks reentry"
        >
          <Button disabled>
            <Spinner data-icon="inline-start" />
            Pairing
          </Button>
          <Button variant="outline" disabled>
            <CheckIcon data-icon="inline-start" />
            Paired
          </Button>
          <Button variant="destructive">
            <TrashIcon data-icon="inline-start" />
            Delete account
          </Button>
        </Specimen>
        <Specimen label="Full width" note="Phone surfaces stretch the primary action" stack wide>
          <Button className="w-full">Continue with Google</Button>
          <Button className="w-full" variant="outline">
            Enter a code instead
          </Button>
        </Specimen>
      </Section>

      <Section title="Button group" note="Related actions that share one border.">
        <Specimen label="Horizontal">
          <ButtonGroup>
            <Button variant="outline">Day</Button>
            <Button variant="outline">Week</Button>
            <Button variant="outline">Month</Button>
          </ButtonGroup>
        </Specimen>
        <Specimen label="Split action">
          <ButtonGroup>
            <Button variant="outline">Resume</Button>
            <ButtonGroupSeparator />
            <Button variant="outline" size="icon" aria-label="More resume options">
              <DotsThreeIcon />
            </Button>
          </ButtonGroup>
        </Specimen>
        <Specimen label="With text">
          <ButtonGroup>
            <ButtonGroupText>Branch</ButtonGroupText>
            <Button variant="outline">main</Button>
          </ButtonGroup>
        </Specimen>
        <Specimen label="Vertical">
          <ButtonGroup orientation="vertical">
            <Button variant="outline">Approve</Button>
            <Button variant="outline">Reject</Button>
            <Button variant="outline">Ask again</Button>
          </ButtonGroup>
        </Specimen>
      </Section>

      <Section
        title="Badge variants"
        note="A badge labels state. Color repeats the word; it never replaces it."
      >
        <Specimen label="All variants" wide>
          {BADGE_VARIANTS.map((variant) => (
            <Badge key={variant} variant={variant}>
              {variant}
            </Badge>
          ))}
        </Specimen>
        <Specimen label="With icon">
          <Badge variant="success">
            <CheckIcon />
            Online
          </Badge>
          <Badge variant="neutral">
            <UserIcon />
            12 members
          </Badge>
        </Specimen>
        <Specimen label="As a link" note="render swaps the tag, not the look">
          <Badge variant="outline" render={<a href="#projects" />}>
            Open project
          </Badge>
        </Specimen>
      </Section>

      <Section title="Identity" note="Avatars fall back to initials when no image loads.">
        <Specimen label="Sizes">
          <Avatar size="sm">
            <AvatarFallback>AZ</AvatarFallback>
          </Avatar>
          <Avatar>
            <AvatarFallback>AZ</AvatarFallback>
          </Avatar>
          <Avatar size="lg">
            <AvatarFallback>AZ</AvatarFallback>
          </Avatar>
        </Specimen>
        <Specimen label="Presence and group">
          <Avatar>
            <AvatarFallback>JR</AvatarFallback>
            <AvatarBadge className="bg-status-success" />
          </Avatar>
          <AvatarGroup>
            <Avatar>
              <AvatarFallback>AZ</AvatarFallback>
            </Avatar>
            <Avatar>
              <AvatarFallback>JR</AvatarFallback>
            </Avatar>
            <AvatarGroupCount>+3</AvatarGroupCount>
          </AvatarGroup>
        </Specimen>
      </Section>

      <Section
        title="Waiting"
        note="Loading has two shapes: a spinner for an action, bones for a page."
      >
        <Specimen label="Spinner">
          <Spinner />
          <Spinner className="size-6" />
          <small className="text-muted-foreground">Reads as “Loading” to a screen reader</small>
        </Specimen>
        <Specimen label="Skeleton" stack>
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-64" />
          <Skeleton className="h-4 w-24" />
        </Specimen>
        <Specimen label="Separator" stack wide>
          <span>Above</span>
          <Separator />
          <span>Below</span>
        </Specimen>
      </Section>
    </Board>
  )
}

const meta = {
  title: 'Design System/Components/Actions',
  component: ActionsBoard,
} satisfies Meta<typeof ActionsBoard>

export default meta
type Story = StoryObj<typeof meta>

export const All: Story = {}
