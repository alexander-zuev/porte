import {
  ArrowClockwiseIcon,
  FolderSimpleIcon,
  GearIcon,
  SignOutIcon,
  TerminalWindowIcon,
  TrashIcon,
  WarningIcon,
} from '@phosphor-icons/react'
import type { Meta, StoryObj } from '@storybook/tanstack-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@web/ui/components/ui/alert-dialog.tsx'
import { Button } from '@web/ui/components/ui/button.tsx'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@web/ui/components/ui/command.tsx'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@web/ui/components/ui/dialog.tsx'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@web/ui/components/ui/dropdown-menu.tsx'
import { Field, FieldLabel } from '@web/ui/components/ui/field.tsx'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@web/ui/components/ui/hover-card.tsx'
import { Input } from '@web/ui/components/ui/input.tsx'
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@web/ui/components/ui/popover.tsx'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@web/ui/components/ui/sheet.tsx'
import { Tooltip, TooltipContent, TooltipTrigger } from '@web/ui/components/ui/tooltip.tsx'
import type { ReactNode } from 'react'

import { Board, Section, Specimen } from './board.tsx'

/** Every overlay board shares this page behind the layer under test. */
function OverlayBoard({
  title,
  summary,
  children,
}: {
  readonly title: string
  readonly summary: string
  readonly children: ReactNode
}) {
  return (
    <Board summary={summary} title={title}>
      <Section title="Layer" note="Shown open, so the resting layer is judged, not the trigger.">
        {children}
      </Section>
    </Board>
  )
}

function DialogSpecimen() {
  return (
    <OverlayBoard
      summary="A modal asks for something the page cannot ask for in place. It traps focus and names itself."
      title="Dialog"
    >
      <Specimen label="Form dialog" wide>
        <Dialog defaultOpen>
          <DialogTrigger render={<Button variant="outline" />}>Rename conversation</DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Rename conversation</DialogTitle>
              <DialogDescription>
                The name shows in the list and in search. Only you see it.
              </DialogDescription>
            </DialogHeader>
            <Field>
              <FieldLabel htmlFor="dialog-title">Name</FieldLabel>
              <Input defaultValue="Porte account deletion" id="dialog-title" />
            </Field>
            <DialogFooter>
              <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
              <Button>Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </Specimen>
    </OverlayBoard>
  )
}

function AlertDialogSpecimen() {
  return (
    <OverlayBoard
      summary="A confirmation stops one destructive step. The action names what it destroys."
      title="Alert dialog"
    >
      <Specimen label="Destructive confirmation" wide>
        <AlertDialog defaultOpen>
          <AlertDialogTrigger render={<Button variant="destructive" />}>
            Delete account
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogMedia>
                <WarningIcon />
              </AlertDialogMedia>
              <AlertDialogTitle>Delete your account?</AlertDialogTitle>
              <AlertDialogDescription>
                This removes every paired Mac and every conversation. It cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep my account</AlertDialogCancel>
              <AlertDialogAction variant="destructive">
                <TrashIcon data-icon="inline-start" />
                Delete account
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </Specimen>
    </OverlayBoard>
  )
}

function SheetSpecimen() {
  return (
    <OverlayBoard
      summary="A sheet carries long copy or a set of actions on a phone. It comes from an edge."
      title="Sheet"
    >
      <Specimen label="Bottom sheet" wide>
        <Sheet defaultOpen>
          <SheetTrigger render={<Button variant="outline" />}>Open actions</SheetTrigger>
          <SheetContent side="bottom">
            <SheetHeader>
              <SheetTitle>Conversation actions</SheetTitle>
              <SheetDescription>Everything you can do with this conversation.</SheetDescription>
            </SheetHeader>
            <div className="flex flex-col gap-2 px-4">
              <Button className="justify-start" variant="ghost">
                <ArrowClockwiseIcon data-icon="inline-start" />
                Resume on the Mac
              </Button>
              <Button className="justify-start" variant="ghost">
                <FolderSimpleIcon data-icon="inline-start" />
                Reveal the project folder
              </Button>
              <Button
                className="justify-start text-destructive-muted-foreground hover:bg-destructive/20 hover:text-destructive-muted-foreground **:[svg]:text-destructive-muted-foreground"
                variant="ghost"
              >
                <TrashIcon data-icon="inline-start" />
                Delete conversation
              </Button>
            </div>
            <SheetFooter>
              <SheetClose render={<Button variant="outline" />}>Close</SheetClose>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      </Specimen>
    </OverlayBoard>
  )
}

function MenuSpecimen() {
  return (
    <OverlayBoard
      summary="A menu lists actions for one object. A destructive item is the last one and reads red."
      title="Dropdown menu"
    >
      <Specimen label="Account menu" wide>
        <DropdownMenu defaultOpen>
          <DropdownMenuTrigger render={<Button variant="outline" />}>
            <GearIcon data-icon="inline-start" />
            Account
          </DropdownMenuTrigger>
          <DropdownMenuContent className="min-w-56">
            {/* Base UI reads the label from group context, so it cannot sit outside one. */}
            <DropdownMenuGroup>
              <DropdownMenuLabel>azuevpersonal@gmail.com</DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem>
                <TerminalWindowIcon />
                New conversation
                <DropdownMenuShortcut>⌘N</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem>
                <GearIcon />
                Settings
              </DropdownMenuItem>
              <DropdownMenuItem disabled>
                <FolderSimpleIcon />
                Import a project
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem checked>Notify on approval</DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive">
              <SignOutIcon />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </Specimen>
    </OverlayBoard>
  )
}

function HintSpecimen() {
  return (
    <OverlayBoard
      summary="A hint adds a word to a control that already has one. It never carries the only copy."
      title="Hints"
    >
      <Specimen label="Tooltip">
        <Tooltip defaultOpen>
          <TooltipTrigger render={<Button variant="outline" />}>Stop</TooltipTrigger>
          <TooltipContent side="bottom">Stops the current turn</TooltipContent>
        </Tooltip>
      </Specimen>
      <Specimen label="Popover">
        <Popover defaultOpen>
          <PopoverTrigger render={<Button variant="outline" />}>Why offline?</PopoverTrigger>
          <PopoverContent side="bottom">
            <PopoverHeader>
              <PopoverTitle>The Mac is asleep</PopoverTitle>
              <PopoverDescription>
                Porte reaches your machine only while the daemon runs. Wake the Mac and it
                reconnects.
              </PopoverDescription>
            </PopoverHeader>
            <Button size="sm" variant="outline">
              Retry now
            </Button>
          </PopoverContent>
        </Popover>
      </Specimen>
      <Specimen label="Hover card" wide>
        <HoverCard defaultOpen>
          <HoverCardTrigger render={<Button variant="link" />}>porte-daemon</HoverCardTrigger>
          <HoverCardContent side="bottom">
            <p>Runs the agent locally and holds the only copy of your code.</p>
          </HoverCardContent>
        </HoverCard>
      </Specimen>
    </OverlayBoard>
  )
}

function CommandSpecimen() {
  return (
    <OverlayBoard
      summary="Search over everything the person can reach, with the empty result shown as text."
      title="Command"
    >
      <Specimen label="Inline palette" stack wide>
        <div className="w-full max-w-md rounded-xl border border-border">
          <Command>
            <CommandInput
              label="Search conversations and commands"
              placeholder="Search conversations and commands"
            />
            <CommandList>
              <CommandEmpty>Nothing matches that.</CommandEmpty>
              <CommandGroup heading="Conversations">
                <CommandItem>Porte account deletion</CommandItem>
                <CommandItem>Relay reconnect loop</CommandItem>
              </CommandGroup>
              <CommandSeparator />
              <CommandGroup heading="Commands">
                <CommandItem>
                  New conversation
                  <CommandShortcut>⌘N</CommandShortcut>
                </CommandItem>
                <CommandItem>
                  Pair a Mac
                  <CommandShortcut>⌘P</CommandShortcut>
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </div>
      </Specimen>
    </OverlayBoard>
  )
}

const meta = {
  title: 'Design System/Components/Overlays',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const DialogLayer: Story = { render: () => <DialogSpecimen /> }
export const ConfirmationLayer: Story = { render: () => <AlertDialogSpecimen /> }
export const SheetLayer: Story = { render: () => <SheetSpecimen /> }
export const MenuLayer: Story = { render: () => <MenuSpecimen /> }
export const HintLayer: Story = { render: () => <HintSpecimen /> }
export const CommandLayer: Story = { render: () => <CommandSpecimen /> }
