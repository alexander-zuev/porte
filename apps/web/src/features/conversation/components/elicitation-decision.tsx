import { ArrowSquareOutIcon, QuestionIcon, WarningCircleIcon } from '@phosphor-icons/react'
import type { ElicitationAnswer, FormField } from '@porte/core/client'
import type {
  ElicitationDecision as ElicitationDecisionState,
  ElicitationDraftValue,
} from '@web/entities/conversation/conversation-control.ts'
import type { ConversationConnection } from '@web/features/conversation/components/conversation-header.tsx'
import { Alert, AlertDescription, AlertTitle } from '@web/ui/components/ui/alert.tsx'
import { Button } from '@web/ui/components/ui/button.tsx'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@web/ui/components/ui/card.tsx'
import { Checkbox } from '@web/ui/components/ui/checkbox.tsx'
import { Field, FieldError, FieldGroup, FieldLabel } from '@web/ui/components/ui/field.tsx'
import { Input } from '@web/ui/components/ui/input.tsx'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@web/ui/components/ui/select.tsx'
import { Separator } from '@web/ui/components/ui/separator.tsx'
import { Spinner } from '@web/ui/components/ui/spinner.tsx'

/** Actions for one elicitation decision. */
export type ElicitationDecisionActions = {
  readonly onAnswer: (answer: ElicitationAnswer) => void
  readonly onOpenUrl: (url: string) => void
  readonly onSubmit: () => void
  readonly onStop: () => void
  readonly onValueChange: (fieldId: string, value: ElicitationDraftValue) => void
}

/** Props for one persistent elicitation decision. */
export type ElicitationDecisionProps = {
  readonly connection: ConversationConnection
  readonly decision: ElicitationDecisionState
  readonly actions: ElicitationDecisionActions
}

/** Render a form or explicit external URL request from the coding agent. */
export function ElicitationDecision({ connection, decision, actions }: ElicitationDecisionProps) {
  const pending = decision.response.state === 'pending'
  return (
    <Card className="mx-4 mb-3 gap-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <QuestionIcon />
          {decision.request.request.type === 'form' ? 'Grok needs input' : 'Continue in browser'}
        </CardTitle>
        <CardDescription>
          {decision.request.request.type === 'form'
            ? 'Complete the requested fields before Grok can continue.'
            : 'Review the destination before you leave Porte.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {pending ? (
          <PendingElicitation connection={connection} decision={decision} actions={actions} />
        ) : (
          <ElicitationResponse decision={decision} actions={actions} />
        )}
      </CardContent>
      <CardFooter className="flex-col items-stretch gap-3">
        <Separator />
        <Button
          className="min-h-11 self-start"
          disabled={decision.response.state === 'submitting'}
          variant="destructive"
          onClick={actions.onStop}
        >
          Stop turn
        </Button>
      </CardFooter>
    </Card>
  )
}

function PendingElicitation({ connection, decision, actions }: ElicitationDecisionProps) {
  if (decision.request.request.type === 'url') {
    const url = decision.request.request.url
    return (
      <div className="flex flex-col gap-4">
        <code className="break-all">{url}</code>
        <div className="flex flex-wrap gap-2">
          <Button
            className="min-h-11"
            disabled={connection !== 'online'}
            onClick={() => {
              actions.onOpenUrl(url)
              actions.onAnswer({ type: 'accept' })
            }}
          >
            <ArrowSquareOutIcon data-icon="inline-start" />
            Open link
          </Button>
          <Button
            className="min-h-11"
            disabled={connection !== 'online'}
            variant="outline"
            onClick={() => {
              actions.onAnswer({ type: 'decline' })
            }}
          >
            Decline
          </Button>
        </div>
      </div>
    )
  }
  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault()
        actions.onSubmit()
      }}
    >
      <FieldGroup>
        {decision.request.request.fields.map((field) => (
          <ElicitationField
            error={decision.errors[field.id]}
            field={field}
            key={field.id}
            value={decision.values[field.id]}
            onChange={actions.onValueChange}
          />
        ))}
      </FieldGroup>
      <div className="flex flex-wrap gap-2">
        <Button className="min-h-11" disabled={connection !== 'online'} type="submit">
          Submit
        </Button>
        <Button
          className="min-h-11"
          disabled={connection !== 'online'}
          type="button"
          variant="outline"
          onClick={() => {
            actions.onAnswer({ type: 'decline' })
          }}
        >
          Decline
        </Button>
      </div>
    </form>
  )
}

function ElicitationField({
  field,
  value,
  error,
  onChange,
}: {
  readonly field: FormField
  readonly value: ElicitationDraftValue | undefined
  readonly error: string | undefined
  readonly onChange: (fieldId: string, value: ElicitationDraftValue) => void
}) {
  const id = `elicitation-${field.id}`
  if (field.type === 'boolean') {
    return (
      <Field data-invalid={error === undefined ? undefined : true} orientation="horizontal">
        <Checkbox
          aria-invalid={error === undefined ? undefined : true}
          checked={value === true}
          id={id}
          onCheckedChange={(checked) => {
            onChange(field.id, checked)
          }}
        />
        <FieldLabel htmlFor={id}>{field.label}</FieldLabel>
        <FieldError>{error}</FieldError>
      </Field>
    )
  }
  if (field.type === 'text' && field.options !== undefined) {
    const items = field.options.map((option) => ({ value: option, label: option }))
    const selected = field.options.includes(String(value)) ? String(value) : null
    return (
      <Field data-invalid={error === undefined ? undefined : true}>
        <FieldLabel>{field.label}</FieldLabel>
        <Select
          items={items}
          value={selected}
          onValueChange={(next) => {
            if (next !== null) onChange(field.id, next)
          }}
        >
          <SelectTrigger aria-invalid={error === undefined ? undefined : true} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {field.options.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <FieldError>{error}</FieldError>
      </Field>
    )
  }
  const inputValue = value === true || value === false || value === undefined ? '' : value
  return (
    <Field data-invalid={error === undefined ? undefined : true}>
      <FieldLabel htmlFor={id}>{field.label}</FieldLabel>
      <Input
        aria-invalid={error === undefined ? undefined : true}
        id={id}
        required={field.required}
        type={field.type}
        value={inputValue}
        // A half-typed number ("-", "1e") has no numeric value, so the draft stays text.
        onChange={(event) => {
          onChange(field.id, event.target.value)
        }}
      />
      <FieldError>{error}</FieldError>
    </Field>
  )
}

function ElicitationResponse({
  decision,
  actions,
}: Pick<ElicitationDecisionProps, 'decision' | 'actions'>) {
  const response = decision.response
  if (response.state === 'submitting') return <Status title="Sending response" icon={<Spinner />} />
  if (response.state === 'failed') {
    return (
      <Status title="Response was not sent" icon={<WarningCircleIcon />}>
        <Button
          variant="outline"
          onClick={() => {
            actions.onAnswer(response.answer)
          }}
        >
          Try again
        </Button>
      </Status>
    )
  }
  if (response.state === 'delivery-unknown') {
    return (
      <Status title="Delivery status is unknown" icon={<WarningCircleIcon />}>
        Porte will check the current request state after reconnection.
      </Status>
    )
  }
  if (response.state === 'completed') return <Status title="Response completed" />
  if (response.state === 'declined') return <Status title="Request declined" />
  if (response.state === 'cancelled') return <Status title="Request cancelled" />
  return null
}

function Status({
  title,
  icon,
  children,
}: {
  readonly title: string
  readonly icon?: React.ReactNode
  readonly children?: React.ReactNode
}) {
  return (
    <Alert>
      {icon}
      <AlertTitle>{title}</AlertTitle>
      {children ? <AlertDescription>{children}</AlertDescription> : null}
    </Alert>
  )
}
