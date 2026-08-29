import { CameraIcon, FileArrowUpIcon, ImagesIcon, PlusIcon, XIcon } from '@phosphor-icons/react'
import type { ConversationCommand as ConversationCommandFromCore } from '@porte/core/client'
import { cn } from '@web/lib/utils.ts'
import {
  PromptInputActionAddAttachments,
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuItem,
  PromptInputActionMenuTrigger,
  PromptInputButton,
  PromptInputFileInput,
} from '@web/ui/components/ai-elements/prompt-input.tsx'
import { Button } from '@web/ui/components/ui/button.tsx'
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerTitle,
  DrawerTrigger,
} from '@web/ui/components/ui/drawer.tsx'
import { usePhone } from '@web/ui/hooks/use-phone.ts'
import { useRef, useState, type ComponentProps, type ReactNode } from 'react'

type ConversationCommand = ConversationCommandFromCore

export type ComposerAddMenuProps = {
  readonly commands: readonly ConversationCommand[] | undefined
  readonly disabled: boolean
  readonly onCommand: (name: string) => void
}

/**
 * The `+` beside the prompt: files to attach, and commands to send.
 *
 * On a phone it is a sheet from the bottom, the way the OS asks for a photo.
 * From `md` up it is a menu on the button. Both paint the same trigger, so the
 * server render and the first client paint agree before the width is known.
 */
export function ComposerAddMenu(props: ComposerAddMenuProps) {
  const phone = usePhone()
  return phone ? <AddSheet {...props} /> : <AddMenu {...props} />
}

function AddMenu({ commands, disabled, onCommand }: ComposerAddMenuProps) {
  return (
    <PromptInputActionMenu>
      <PromptInputActionMenuTrigger aria-label="Add attachment" disabled={disabled} />
      {/* As wide as its longest row and no wider; the anchor is a 32px circle,
          so without `w-max` the menu takes the circle's width and wraps. Grok
          lists hundreds of commands: a list that scrolls. */}
      <PromptInputActionMenuContent className="max-h-[60svh] w-max min-w-48 max-w-80 overflow-y-auto">
        <PromptInputActionAddAttachments />
        {commands?.map((command) => (
          <PromptInputActionMenuItem
            key={command.name}
            className="font-mono"
            disabled={disabled}
            onClick={() => {
              onCommand(command.name)
            }}
          >
            /{command.name}
          </PromptInputActionMenuItem>
        ))}
      </PromptInputActionMenuContent>
    </PromptInputActionMenu>
  )
}

function AddSheet({ commands, disabled, onCommand }: ComposerAddMenuProps) {
  const [open, setOpen] = useState(false)
  const cameraRef = useRef<HTMLInputElement | null>(null)
  const photosRef = useRef<HTMLInputElement | null>(null)
  const filesRef = useRef<HTMLInputElement | null>(null)
  const close = () => {
    setOpen(false)
  }

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger
        render={
          <PromptInputButton
            aria-label="Add attachment"
            className="rounded-full"
            disabled={disabled}
            size="icon-sm"
            variant="outline"
          />
        }
      >
        <PlusIcon className="size-4" />
      </DrawerTrigger>
      <DrawerContent>
        <div className="relative flex min-h-11 items-center justify-center px-4">
          <DrawerClose
            render={
              <Button
                aria-label="Close"
                className="absolute left-4 rounded-full"
                size="icon"
                variant="outline"
              />
            }
          >
            <XIcon />
          </DrawerClose>
          <DrawerTitle render={<h3>Add context</h3>} />
        </div>

        {/* Camera and library are one picker each on the web; iOS routes `image/*` to Photos. */}
        <div className="grid grid-cols-2 gap-3 px-4">
          <PromptInputFileInput
            ref={cameraRef}
            accept="image/*"
            capture="environment"
            onPicked={close}
          />
          <PromptInputFileInput ref={photosRef} accept="image/*" multiple onPicked={close} />
          <PromptInputFileInput ref={filesRef} multiple onPicked={close} />
          <Tile icon={<CameraIcon />} label="Camera" onClick={() => cameraRef.current?.click()} />
          <Tile icon={<ImagesIcon />} label="Photos" onClick={() => photosRef.current?.click()} />
        </div>

        <div className="px-4">
          <Row
            icon={<FileArrowUpIcon />}
            label="Add files"
            onClick={() => filesRef.current?.click()}
          />
        </div>

        {commands === undefined || commands.length === 0 ? null : (
          <div className="flex flex-col gap-1 px-4">
            <small className="px-4 text-muted-foreground">Commands</small>
            {commands.map((command) => (
              <Row
                key={command.name}
                label={`/${command.name}`}
                mono
                note={command.description}
                onClick={() => {
                  onCommand(command.name)
                  setOpen(false)
                }}
              />
            ))}
          </div>
        )}
      </DrawerContent>
    </Drawer>
  )
}

type ChoiceProps = Omit<ComponentProps<typeof Button>, 'children'> & {
  readonly icon?: ReactNode
  readonly label: string
  readonly note?: string
  readonly mono?: boolean
}

/** A square the thumb lands on: icon over word, the way the phone's own picker draws them. */
function Tile({ icon, label, className, ...props }: ChoiceProps) {
  return (
    <Button
      className={cn(
        'h-auto min-h-28 flex-col gap-2 rounded-xl [&_svg:not([class*=size-])]:size-7',
        className,
      )}
      type="button"
      variant="secondary"
      {...props}
    >
      {icon}
      {label}
    </Button>
  )
}

function Row({ icon, label, note, mono = false, className, ...props }: ChoiceProps) {
  return (
    <Button
      className={cn(
        'h-auto min-h-14 w-full justify-start gap-3 rounded-xl px-4 [&_svg:not([class*=size-])]:size-5',
        className,
      )}
      type="button"
      variant="secondary"
      {...props}
    >
      {icon}
      <span className={cn('truncate', mono && 'font-mono')}>{label}</span>
      {note === undefined ? null : (
        <span className="min-w-0 truncate font-sans text-muted-foreground">{note}</span>
      )}
    </Button>
  )
}
