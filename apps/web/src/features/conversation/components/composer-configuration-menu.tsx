import { CaretRightIcon, CheckIcon } from '@phosphor-icons/react'
import type { ConversationConfigurationOption } from '@porte/core/client'
import type { SetModelInput } from '@web/features/conversation/hooks/use-set-model.ts'
import { cn } from '@web/lib/utils.ts'
import { PromptInputButton } from '@web/ui/components/ai-elements/prompt-input.tsx'
import { Badge } from '@web/ui/components/ui/badge.tsx'
import { Button } from '@web/ui/components/ui/button.tsx'
import { Drawer, DrawerContent, DrawerTrigger } from '@web/ui/components/ui/drawer.tsx'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@web/ui/components/ui/dropdown-menu.tsx'
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from '@web/ui/components/ui/popover.tsx'
import { Slider } from '@web/ui/components/ui/slider.tsx'
import { usePhone } from '@web/ui/hooks/use-phone.ts'
import { useState, type ReactNode } from 'react'

import { ComposerSheetBody } from './composer-rows.tsx'
import { SHEET_PANEL, SheetHeader } from './tool-run.tsx'

export type ComposerConfigurationMenuProps = {
  readonly options: readonly ConversationConfigurationOption[]
  readonly disabled: boolean
  readonly pending: boolean
  readonly actions: { readonly onSetModel: (input: SetModelInput) => void }
  /** Placement in the composer row; the menu is one flex item either way. */
  readonly className?: string
}

/** One selectable value, flattened out of the select's groups. */
type Choice = {
  readonly value: string
  readonly name: string
  readonly description?: string
  readonly current: boolean
  /** The provider's default, worn as a badge. */
  readonly default?: boolean
}

type ModelPicker = {
  readonly models: readonly Choice[]
  readonly currentModel: Choice
  /** Absent when the current model has no effort levels. */
  readonly efforts?: readonly Choice[]
  readonly currentEffort?: Choice
}

type SelectOption = Extract<ConversationConfigurationOption, { type: 'select' }>

function choiceOf(
  option: SelectOption['options'][number] & { type: 'option' },
  currentValue: string,
): Choice {
  const base: Choice = {
    value: option.value,
    name: option.name,
    current: option.value === currentValue,
  }
  const described =
    option.description === undefined ? base : { ...base, description: option.description }
  return option.default === true ? { ...described, default: true } : described
}

function choicesOf(select: SelectOption): Choice[] {
  return select.options
    .flatMap((option) => (option.type === 'group' ? option.options : [option]))
    .map((option) => choiceOf(option, select.currentValue))
}

function findSelect(
  options: readonly ConversationConfigurationOption[],
  id: string,
): SelectOption | undefined {
  const found = options.find((option) => option.type === 'select' && option.id === id)
  return found?.type === 'select' ? found : undefined
}

/** What the picker shows, or nothing while the machine has not advertised models. */
function modelPicker(options: readonly ConversationConfigurationOption[]): ModelPicker | undefined {
  const modelSelect = findSelect(options, 'model')
  if (modelSelect === undefined) return undefined
  const models = choicesOf(modelSelect)
  const currentModel = models.find((model) => model.current)
  if (currentModel === undefined) return undefined
  const effortSelect = findSelect(options, 'effort')
  if (effortSelect === undefined) return { models, currentModel }
  const efforts = choicesOf(effortSelect)
  const currentEffort = efforts.find((effort) => effort.current)
  if (currentEffort === undefined) return { models, currentModel }
  return { models, currentModel, efforts, currentEffort }
}

/**
 * The model and effort on the composer: two small controls from `md` up, a
 * drawer on a phone.
 *
 * Rendered entirely from the advertised options — the UI invents no rows. A
 * click sends the pair the person is looking at; the check mark moves only
 * when the machine's `configuration.updated` broadcast confirms it.
 */
export function ComposerConfigurationMenu({ className, ...props }: ComposerConfigurationMenuProps) {
  const phone = usePhone()
  const picker = modelPicker(props.options)
  if (picker === undefined) return null
  return (
    <div className={cn('flex min-w-0 items-center gap-1', className)}>
      {phone ? (
        <ConfigurationDrawer {...props} picker={picker} />
      ) : (
        <>
          <ModelMenu {...props} picker={picker} />
          <EffortPopover {...props} picker={picker} />
        </>
      )}
    </div>
  )
}

type PickerProps = Omit<ComposerConfigurationMenuProps, 'className'> & {
  readonly picker: ModelPicker
}

/** "High Effort" reads as "High" on a control that already says Effort. */
function shortEffortName(effort: Choice): string {
  const short = effort.name.replace(/\s+effort$/i, '')
  return short === '' ? effort.name : short
}

function ModelMenu({ picker, disabled, pending, actions }: PickerProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<PromptInputButton aria-label="Model" disabled={disabled} size="sm" />}
      >
        {picker.currentModel.name}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-max min-w-40 max-w-80">
        {/* Base UI mounts a group label only inside a group. */}
        <DropdownMenuGroup>
          <DropdownMenuLabel>Model</DropdownMenuLabel>
          {picker.models.map((model) => (
            <DropdownMenuItem
              key={model.value}
              disabled={disabled || pending}
              onClick={() => {
                actions.onSetModel({ modelId: model.value })
              }}
            >
              {model.name}
              {model.current ? <CheckIcon className="ml-auto" /> : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function EffortPopover({ picker, disabled, pending, actions }: PickerProps) {
  const { efforts, currentEffort, currentModel } = picker
  if (efforts === undefined || currentEffort === undefined) return null
  // Grok advertises smartest first; the slider reads faster → smarter left to right.
  const ordered = [...efforts].reverse()
  const at = ordered.findIndex((effort) => effort.current)

  return (
    <Popover>
      <PopoverTrigger
        render={<PromptInputButton aria-label="Effort" disabled={disabled} size="sm" />}
      >
        {shortEffortName(currentEffort)}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64">
        <div className="flex items-baseline gap-2">
          <PopoverTitle render={<h4>Effort</h4>} />
          <span className="text-muted-foreground">{currentEffort.name}</span>
        </div>
        <div className="mt-2 flex justify-between text-muted-foreground">
          <small>Faster</small>
          <small>Smarter</small>
        </div>
        <Slider
          key={currentEffort.value}
          defaultValue={at}
          disabled={disabled || pending}
          max={ordered.length - 1}
          min={0}
          step={1}
          onValueCommitted={(value) => {
            const chosen = ordered[Array.isArray(value) ? (value[0] ?? at) : value]
            if (chosen === undefined || chosen.current) return
            actions.onSetModel({ modelId: currentModel.value, reasoningEffort: chosen.value })
          }}
        />
        {currentEffort.description === undefined ? null : (
          <small className="text-muted-foreground">{currentEffort.description}</small>
        )}
      </PopoverContent>
    </Popover>
  )
}

function ConfigurationDrawer({ picker, disabled, pending, actions }: PickerProps) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<'model' | 'effort'>('model')
  const busy = disabled || pending
  const openChanged = (next: boolean) => {
    setOpen(next)
    if (!next) setView('model')
  }
  const pick = (input: SetModelInput) => {
    actions.onSetModel(input)
    openChanged(false)
  }
  // Faster first, the order a person reads the scale; grok advertises smartest first.
  const efforts = [...(picker.efforts ?? [])].reverse()

  return (
    <Drawer open={open} onOpenChange={openChanged}>
      <DrawerTrigger
        render={
          <PromptInputButton
            aria-label="Model and effort"
            className="min-w-0 rounded-full"
            disabled={disabled}
            size="sm"
            variant="outline"
          />
        }
      >
        <span className="min-w-0 truncate">{picker.currentModel.name}</span>
        {/* The effort rides along muted, the way the Claude app labels its pill. */}
        {picker.currentEffort === undefined ? null : (
          <span className="text-muted-foreground">{shortEffortName(picker.currentEffort)}</span>
        )}
      </DrawerTrigger>
      <DrawerContent>
        <SheetHeader
          title={view === 'model' ? 'Select model' : 'Effort'}
          onBack={
            view === 'model'
              ? undefined
              : () => {
                  setView('model')
                }
          }
        />

        {/* One fixed frame; the effort page slides in from the right, iOS-style. */}
        <ComposerSheetBody className="relative overflow-hidden px-0 pt-0">
          <div
            inert={view !== 'model'}
            className={cn(
              SHEET_PANEL,
              'flex flex-col gap-3 pt-3',
              view !== 'model' && '-translate-x-1/3',
            )}
          >
            <ChoiceGroup>
              {picker.models.map((model, index) => (
                <ChoiceRow
                  key={model.value}
                  choice={model}
                  disabled={busy}
                  divided={index > 0}
                  note={model.description}
                  onPick={() => {
                    pick({ modelId: model.value })
                  }}
                />
              ))}
            </ChoiceGroup>
            {picker.efforts === undefined ? null : (
              <ChoiceGroup>
                <Button
                  className="min-h-14 w-full justify-between gap-3 px-0 hover:bg-transparent"
                  variant="ghost"
                  onClick={() => {
                    setView('effort')
                  }}
                >
                  Effort
                  <CaretRightIcon aria-hidden className="text-muted-foreground" />
                </Button>
              </ChoiceGroup>
            )}
          </div>
          <div
            inert={view === 'model'}
            className={cn(
              SHEET_PANEL,
              'flex flex-col gap-3 pt-3',
              view === 'model' && 'translate-x-full',
            )}
          >
            <ChoiceGroup>
              {efforts.map((effort, index) => (
                <ChoiceRow
                  key={effort.value}
                  choice={effort}
                  disabled={busy}
                  divided={index > 0}
                  label={shortEffortName(effort)}
                  onPick={() => {
                    pick({ modelId: picker.currentModel.value, reasoningEffort: effort.value })
                  }}
                />
              ))}
            </ChoiceGroup>
            {/* The scale explained once, under the list, the way the desktop popover does. */}
            {picker.currentEffort?.description === undefined ? null : (
              <small className="px-4 text-muted-foreground">
                {picker.currentEffort.description}
              </small>
            )}
          </div>
        </ComposerSheetBody>
      </DrawerContent>
    </Drawer>
  )
}

/** One card holding a list of choices, the way the phone's own settings draw them. */
function ChoiceGroup({ children }: { readonly children: ReactNode }) {
  return <div className="rounded-2xl bg-secondary px-4">{children}</div>
}

function ChoiceRow({
  choice,
  label,
  note,
  divided,
  disabled,
  onPick,
}: {
  readonly choice: Choice
  readonly label?: string
  readonly note?: string
  readonly divided: boolean
  readonly disabled: boolean
  readonly onPick: () => void
}) {
  return (
    <Button
      className={cn(
        'h-auto min-h-14 w-full justify-start gap-3 rounded-none px-0 py-3 text-left hover:bg-transparent',
        divided && 'border-t',
      )}
      disabled={disabled}
      variant="ghost"
      onClick={onPick}
    >
      <span className="flex min-w-0 flex-col gap-0.5">
        <p className="flex items-center gap-2">
          {label ?? choice.name}
          {/* Outline, because the card already sits on the badge's secondary gray. */}
          {choice.default === true ? <Badge variant="outline">Default</Badge> : null}
        </p>
        {note === undefined ? null : <small className="text-muted-foreground">{note}</small>}
      </span>
      {choice.current ? (
        <CheckIcon aria-hidden className="ml-auto size-5 shrink-0 text-primary" weight="bold" />
      ) : null}
    </Button>
  )
}
