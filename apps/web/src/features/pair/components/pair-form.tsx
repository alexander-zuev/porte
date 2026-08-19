import { LinkIcon } from '@phosphor-icons/react'

import { Button } from '#/ui/components/ui/button.tsx'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '#/ui/components/ui/field.tsx'
import { InputOTP, InputOTPGroup, InputOTPSlot } from '#/ui/components/ui/input-otp.tsx'
import { Spinner } from '#/ui/components/ui/spinner.tsx'

/** Controlled fallback-code form for claiming a desktop pairing attempt. */
export type PairFormProps = {
  readonly code: string
  readonly pending: boolean
  readonly error: string | undefined
  readonly onCodeChange: (value: string) => void
  readonly onSubmit: () => void
}

/** OTP submit control used inside the pairing scaffold. */
export function PairForm({ code, pending, error, onCodeChange, onSubmit }: PairFormProps) {
  const invalid = error !== undefined

  return (
    <form
      className="flex w-full flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit()
      }}
    >
      <FieldGroup>
        <Field data-invalid={invalid || undefined}>
          <FieldLabel className="sr-only" htmlFor="pair-code">
            Pairing code
          </FieldLabel>
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
          <FieldDescription className="text-center">
            Six characters from porte pair
          </FieldDescription>
        </Field>
      </FieldGroup>
      {error ? (
        <p className="text-destructive-muted-foreground" role="alert">
          {error}
        </p>
      ) : null}
      <Button className="w-full" disabled={pending || code.length !== 6} type="submit">
        {pending ? <Spinner data-icon="inline-start" /> : <LinkIcon data-icon="inline-start" />}
        Pair Mac
      </Button>
    </form>
  )
}
