import { LinkIcon } from '@phosphor-icons/react'

import { Button } from '#/ui/components/ui/button.tsx'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '#/ui/components/ui/field.tsx'
import { InputOTP, InputOTPGroup, InputOTPSlot } from '#/ui/components/ui/input-otp.tsx'

export type PairFormProps = {
  readonly code: string
  readonly pending: boolean
  readonly error: string | undefined
  readonly onCodeChange: (value: string) => void
  readonly onSubmit: () => void
}

export function PairForm({ code, pending, error, onCodeChange, onSubmit }: PairFormProps) {
  const invalid = error !== undefined

  return (
    <form
      className="flex flex-col gap-8"
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit()
      }}
    >
      <header className="flex flex-col gap-2">
        <h1>Pair this phone</h1>
        <p className="text-muted-foreground">Enter the one-time code shown on your Mac.</p>
      </header>
      <FieldGroup className="gap-4">
        <Field data-invalid={invalid || undefined}>
          <FieldLabel htmlFor="pair-code">Pairing code</FieldLabel>
          <InputOTP
            autoComplete="one-time-code"
            containerClassName="w-full justify-center"
            disabled={pending}
            id="pair-code"
            maxLength={6}
            value={code}
            aria-invalid={invalid || undefined}
            onChange={(value) => {
              onCodeChange(value.toUpperCase())
            }}
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
          <FieldDescription>Six characters from the daemon.</FieldDescription>
        </Field>
      </FieldGroup>
      {error ? (
        <p className="text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <Button disabled={pending || code.length !== 6} type="submit">
        <LinkIcon data-icon="inline-start" />
        Pair Mac
      </Button>
    </form>
  )
}
