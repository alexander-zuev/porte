import { CameraIcon, FileArrowUpIcon, ImagesIcon, PlusIcon } from '@phosphor-icons/react'
import {
  PromptInputActionAddAttachments,
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuTrigger,
  PromptInputButton,
  PromptInputFileInput,
} from '@web/ui/components/ai-elements/prompt-input.tsx'
import {
  Drawer,
  DrawerCloseButton,
  DrawerContent,
  DrawerTitle,
  DrawerTrigger,
} from '@web/ui/components/ui/drawer.tsx'
import { usePhone } from '@web/ui/hooks/use-phone.ts'
import { useRef, useState } from 'react'

import { ComposerSheetBody, Row, Tile } from './composer-rows.tsx'

export type ComposerAddMenuProps = {
  readonly disabled: boolean
}

/**
 * The `+` beside the prompt: files to attach. Commands live behind `/` in the
 * composer, not here.
 *
 * On a phone it is a sheet from the bottom, the way the OS asks for a photo.
 * From `md` up it is a menu on the button. Both paint the same trigger, so the
 * server render and the first client paint agree before the width is known.
 */
export function ComposerAddMenu(props: ComposerAddMenuProps) {
  const phone = usePhone()
  return phone ? <AddSheet {...props} /> : <AddMenu {...props} />
}

function AddMenu({ disabled }: ComposerAddMenuProps) {
  return (
    <PromptInputActionMenu>
      <PromptInputActionMenuTrigger aria-label="Add attachment" disabled={disabled} />
      {/* As wide as its longest row and no wider; the anchor is a 32px circle,
          so without `w-max` the menu takes the circle's width and wraps. */}
      <PromptInputActionMenuContent className="w-max min-w-48 max-w-80">
        <PromptInputActionAddAttachments />
      </PromptInputActionMenuContent>
    </PromptInputActionMenu>
  )
}

function AddSheet({ disabled }: ComposerAddMenuProps) {
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
          <DrawerCloseButton className="absolute left-4" />
          <DrawerTitle render={<h3>Add context</h3>} />
        </div>

        <ComposerSheetBody className="pt-3">
          {/* Camera and library are one picker each on the web; iOS routes `image/*` to Photos. */}
          <div className="grid grid-cols-2 gap-3">
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

          <div className="pt-3">
            <Row
              icon={<FileArrowUpIcon />}
              label="Add files"
              onClick={() => filesRef.current?.click()}
            />
          </div>
        </ComposerSheetBody>
      </DrawerContent>
    </Drawer>
  )
}
