import { ArrowLeftIcon, FolderSimpleIcon, WarningCircleIcon } from '@phosphor-icons/react'

import { repoName } from '#/entities/session/group-sessions.ts'
import { HostStatus } from '#/ui/components/host-status.tsx'
import { Alert, AlertDescription, AlertTitle } from '#/ui/components/ui/alert.tsx'
import { Button } from '#/ui/components/ui/button.tsx'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '#/ui/components/ui/empty.tsx'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '#/ui/components/ui/field.tsx'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/ui/components/ui/select.tsx'
import { Skeleton } from '#/ui/components/ui/skeleton.tsx'
import { Spinner } from '#/ui/components/ui/spinner.tsx'
import { Textarea } from '#/ui/components/ui/textarea.tsx'

type SessionFormState =
  | { readonly status: 'ready' }
  | { readonly status: 'offline' }
  | { readonly status: 'creating' }
  | { readonly status: 'opening' }
  | { readonly status: 'failed' }
  | { readonly status: 'unknown' }

type SessionForm = {
  readonly state: SessionFormState
  readonly hostName: string
  readonly repositories: readonly string[]
  readonly cwd: string
  readonly prompt: string
  readonly onBack: () => void
  readonly onRepositoryChange: (cwd: string) => void
  readonly onPromptChange: (prompt: string) => void
  readonly onSubmit: () => void
  readonly onCheckSessions: () => void
}

/** Presentational states for repository selection and session creation. */
export type NewSessionProps =
  | { readonly view: 'loading'; readonly hostName: string; readonly onBack: () => void }
  | { readonly view: 'empty'; readonly hostName: string; readonly onBack: () => void }
  | ({ readonly view: 'form' } & SessionForm)

/** Render the complete new-session flow without server effects. */
export function NewSession(props: NewSessionProps) {
  const hostStatus =
    props.view === 'form' && props.state.status === 'offline' ? 'offline' : 'online'
  return (
    <div className="flex min-h-svh flex-col bg-background text-foreground">
      <NewSessionHeader hostName={props.hostName} status={hostStatus} onBack={props.onBack} />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-5 py-8 md:py-12">
        {props.view === 'loading' ? <LoadingRepositories /> : null}
        {props.view === 'empty' ? <NoRepositories /> : null}
        {props.view === 'form' ? <SessionFormView {...props} /> : null}
      </main>
    </div>
  )
}

function NewSessionHeader({
  hostName,
  status,
  onBack,
}: {
  readonly hostName: string
  readonly status: 'online' | 'offline'
  readonly onBack: () => void
}) {
  return (
    <header className="border-b border-border pt-[max(0.75rem,env(safe-area-inset-top))]">
      <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-4 px-4 py-3">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeftIcon data-icon="inline-start" />
          Sessions
        </Button>
        <div className="flex min-w-0 flex-col items-end gap-1">
          <strong className="max-w-44 truncate">{hostName}</strong>
          <HostStatus status={status} />
        </div>
      </div>
    </header>
  )
}

function LoadingRepositories() {
  return (
    <output aria-label="Loading repositories" className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <Skeleton className="h-9 w-44" />
        <Skeleton className="h-5 w-72 max-w-full" />
      </header>
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-11 w-full" />
    </output>
  )
}

function NoRepositories() {
  return (
    <Empty className="flex-1 border-0">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <FolderSimpleIcon />
        </EmptyMedia>
        <EmptyTitle>No known repositories</EmptyTitle>
        <EmptyDescription>
          Open Porte from a repository on the Mac before you start a remote session.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <code>cd your-repository &amp;&amp; porte start</code>
      </EmptyContent>
    </Empty>
  )
}

function SessionFormView(props: Extract<NewSessionProps, { view: 'form' }>) {
  const pending = props.state.status === 'creating' || props.state.status === 'opening'
  const blocked = props.state.status === 'offline' || props.state.status === 'unknown'
  const canSubmit = !pending && !blocked && props.prompt.trim().length > 0
  const items = props.repositories.map((cwd) => ({ value: cwd, label: repoName(cwd) }))

  return (
    <form
      className="flex flex-1 flex-col gap-8"
      onSubmit={(event) => {
        event.preventDefault()
        if (canSubmit) props.onSubmit()
      }}
    >
      <header className="flex flex-col gap-2">
        <h1>New session</h1>
        <p className="text-muted-foreground">Choose where Grok works and describe the first task.</p>
      </header>
      <SessionCreationFeedback state={props.state} onCheckSessions={props.onCheckSessions} />
      <FieldGroup>
        <Field data-disabled={pending || undefined}>
          <FieldLabel>Repository</FieldLabel>
          <Select
            disabled={pending}
            items={items}
            value={props.cwd}
            onValueChange={(value) => {
              if (value !== null) props.onRepositoryChange(value)
            }}
          >
            <SelectTrigger className="h-auto min-h-11 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              <SelectGroup>
                {props.repositories.map((cwd) => (
                  <SelectItem key={cwd} value={cwd}>
                    <span className="flex min-w-0 flex-col items-start">
                      <strong>{repoName(cwd)}</strong>
                      <small className="text-muted-foreground">{cwd}</small>
                    </span>
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <FieldDescription className="break-all">{props.cwd}</FieldDescription>
        </Field>
        <Field data-disabled={pending || undefined}>
          <FieldLabel htmlFor="initial-prompt">First prompt</FieldLabel>
          <Textarea
            className="min-h-40 resize-none"
            disabled={pending}
            id="initial-prompt"
            placeholder="What should Grok work on?"
            value={props.prompt}
            onChange={(event) => {
              props.onPromptChange(event.target.value)
            }}
          />
          <FieldDescription>Required to start the session</FieldDescription>
        </Field>
      </FieldGroup>
      <div className="mt-auto pb-[max(0rem,env(safe-area-inset-bottom))]">
        <Button className="w-full" disabled={!canSubmit} type="submit">
          {pending ? <Spinner data-icon="inline-start" /> : null}
          Start session
        </Button>
      </div>
    </form>
  )
}

function SessionCreationFeedback({
  state,
  onCheckSessions,
}: {
  readonly state: SessionFormState
  readonly onCheckSessions: () => void
}) {
  if (state.status === 'ready') return null
  if (state.status === 'creating') return <InlineProgress>Creating the session</InlineProgress>
  if (state.status === 'opening') return <InlineProgress>Session created and opening</InlineProgress>
  if (state.status === 'offline') {
    return (
      <Alert>
        <WarningCircleIcon />
        <AlertTitle>Mac is offline</AlertTitle>
        <AlertDescription>Your prompt remains here. Start Porte on the Mac to continue.</AlertDescription>
      </Alert>
    )
  }
  if (state.status === 'failed') {
    return (
      <Alert variant="destructive">
        <WarningCircleIcon />
        <AlertTitle>Session was not created</AlertTitle>
        <AlertDescription>Review the repository and try again.</AlertDescription>
      </Alert>
    )
  }
  return (
    <div className="flex flex-col gap-3">
      <Alert>
        <WarningCircleIcon />
        <AlertTitle>Creation status is unknown</AlertTitle>
        <AlertDescription>
          The connection ended before Porte confirmed the result. Check sessions before you retry.
        </AlertDescription>
      </Alert>
      <Button className="w-fit" variant="outline" onClick={onCheckSessions}>
        Check sessions
      </Button>
    </div>
  )
}

function InlineProgress({ children }: { readonly children: string }) {
  return (
    <output className="flex items-center gap-3 text-muted-foreground">
      <Spinner />
      <p>{children}</p>
    </output>
  )
}
