import { PAIRING_CODE_LENGTH } from '@porte/core/client'
import { Button } from '@web/ui/components/ui/button.tsx'
import { Field, FieldGroup, FieldLabel } from '@web/ui/components/ui/field.tsx'
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from '@web/ui/components/ui/input-otp.tsx'
import { Spinner } from '@web/ui/components/ui/spinner.tsx'

/** Half the code. The terminal prints the dash in the same place. */
const GROUP_LENGTH = PAIRING_CODE_LENGTH / 2

/** Controlled code form for claiming a pairing attempt. */
export type PairFormProps = {
  readonly code: string
  readonly pending: boolean
  readonly error: string | undefined
  readonly onCodeChange: (value: string) => void
  readonly onSubmit: () => void
}

/** Code entry and its submit control, sized to be typed on a phone. */
export function PairForm({ code, pending, error, onCodeChange, onSubmit }: PairFormProps) {
  const invalid = error !== undefined

  return (
    <form
      className="flex w-full flex-col gap-4"
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
            autoComplete="off"
            // Eight 40px boxes need ~380px. Only a phone is short of that, so
            // only a phone stacks the two groups; shrinking them instead would
            // put a digit under the thumb size it exists for.
            containerClassName="w-full justify-between max-sm:flex-wrap max-sm:justify-center max-sm:gap-3"
            data-1p-ignore
            data-lpignore="true"
            disabled={pending}
            id="pair-code"
            maxLength={PAIRING_CODE_LENGTH}
            value={code}
            aria-invalid={invalid || undefined}
            // Runs before the length check, so a pasted dash cannot cost the last character.
            pasteTransformer={(pasted) => pasted.replace(/-/g, '')}
            onChange={onCodeChange}
          >
            <CodeGroup start={0} />
            {/* Stacked groups need no divider between them. */}
            <InputOTPSeparator className="max-sm:hidden" />
            <CodeGroup start={GROUP_LENGTH} />
          </InputOTP>
        </Field>
      </FieldGroup>
      {error ? (
        <p className="text-destructive-muted-foreground" role="alert">
          {error}
        </p>
      ) : null}
      <Button
        className="w-full"
        disabled={pending || code.length !== PAIRING_CODE_LENGTH}
        type="submit"
      >
        {pending ? <Spinner data-icon="inline-start" /> : null}
        Continue
      </Button>
    </form>
  )
}

/** Four separated boxes, large enough for a thumb. */
function CodeGroup({ start }: { readonly start: number }) {
  return (
    <InputOTPGroup className="gap-2">
      {Array.from({ length: GROUP_LENGTH }, (_, offset) => (
        <InputOTPSlot
          className="size-10 shrink-0 rounded-md border font-mono"
          index={start + offset}
          key={start + offset}
        />
      ))}
    </InputOTPGroup>
  )
}
