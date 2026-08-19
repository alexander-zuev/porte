import { LinkIcon, WarningCircleIcon } from '@phosphor-icons/react'

import { Alert, AlertDescription } from '#/ui/components/ui/alert.tsx'
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
        <h1>Pair this Mac</h1>
        <p className="text-muted-foreground">Enter the one-time code shown by Porte on your Mac.</p>
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
          <FieldDescription>
            Six characters from the <code>porte pair</code> command.
          </FieldDescription>
        </Field>
      </FieldGroup>
      {error ? (
        <Alert variant="destructive">
          <WarningCircleIcon />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <Button disabled={pending || code.length !== 6} type="submit">
        {pending ? <Spinner data-icon="inline-start" /> : <LinkIcon data-icon="inline-start" />}
        Pair Mac
      </Button>
    </form>
  )
}
