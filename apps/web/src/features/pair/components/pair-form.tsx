import { LinkIcon } from '@phosphor-icons/react'
import { PAIRING_CODE_LENGTH } from '@porte/core'

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
            maxLength={PAIRING_CODE_LENGTH}
            value={code}
            aria-invalid={invalid || undefined}
            onChange={(value) => {
              onCodeChange(value.toUpperCase())
            }}
          >
            {/* Slots follow the shared length, so the form cannot drift from the code. */}
            <InputOTPGroup className="justify-center">
              {Array.from({ length: PAIRING_CODE_LENGTH }, (_, index) => (
                <InputOTPSlot index={index} key={index} />
              ))}
            </InputOTPGroup>
          </InputOTP>
          <FieldDescription className="text-center">
            Eight characters from porte pair
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
