import { LinkIcon } from '@phosphor-icons/react'

import { Button } from '#/components/ui/button.tsx'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '#/components/ui/field.tsx'
import { InputOTP, InputOTPGroup, InputOTPSlot } from '#/components/ui/input-otp.tsx'
import { AppFrame } from '#/ui/app-frame.tsx'

export type PairPageProps = {
  readonly code: string
  readonly pending: boolean
  readonly error: string | undefined
  readonly onCodeChange: (value: string) => void
  readonly onSubmit: () => void
}

export function PairPage({ code, pending, error, onCodeChange, onSubmit }: PairPageProps) {
  const invalid = error !== undefined

  return (
    <AppFrame className="justify-center px-5 py-10">
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
              id="pair-code"
              maxLength={6}
              value={code}
              disabled={pending}
              aria-invalid={invalid || undefined}
              autoComplete="one-time-code"
              containerClassName="w-full justify-center"
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
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        <Button type="submit" disabled={pending || code.length !== 6}>
          <LinkIcon data-icon="inline-start" />
          Pair Mac
        </Button>
      </form>
    </AppFrame>
  )
}
