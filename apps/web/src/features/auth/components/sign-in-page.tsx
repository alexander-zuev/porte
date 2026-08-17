import { SignInIcon } from '@phosphor-icons/react'

import { Button } from '#/components/ui/button.tsx'
import { Field, FieldGroup, FieldLabel } from '#/components/ui/field.tsx'
import { Input } from '#/components/ui/input.tsx'
import { AppFrame } from '#/ui/app-frame.tsx'

export type SignInPageProps = {
  readonly email: string
  readonly password: string
  readonly pending: boolean
  readonly error: string | undefined
  readonly onEmailChange: (value: string) => void
  readonly onPasswordChange: (value: string) => void
  readonly onSubmit: () => void
}

export function SignInPage({
  email,
  password,
  pending,
  error,
  onEmailChange,
  onPasswordChange,
  onSubmit,
}: SignInPageProps) {
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
          <p className="text-sm text-muted-foreground">LRAS</p>
          <h1>Sign in</h1>
          <p className="text-muted-foreground">
            Use your app account. This is not your Grok login.
          </p>
        </header>
        <FieldGroup className="gap-4">
          <Field>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => {
                onEmailChange(event.target.value)
              }}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => {
                onPasswordChange(event.target.value)
              }}
            />
          </Field>
        </FieldGroup>
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        <Button type="submit" disabled={pending}>
          <SignInIcon data-icon="inline-start" />
          Sign in
        </Button>
      </form>
    </AppFrame>
  )
}
