import {
  ArrowRightIcon,
  BellIcon,
  CheckCircleIcon,
  ClockIcon,
  DotsThreeIcon,
  FolderSimpleIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  ShieldCheckIcon,
  TrendUpIcon,
  WarningCircleIcon,
} from '@phosphor-icons/react'
import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { Alert, AlertDescription, AlertTitle } from '@web/ui/components/ui/alert.tsx'
import { Avatar, AvatarFallback } from '@web/ui/components/ui/avatar.tsx'
import { Badge } from '@web/ui/components/ui/badge.tsx'
import { Button } from '@web/ui/components/ui/button.tsx'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@web/ui/components/ui/card.tsx'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@web/ui/components/ui/field.tsx'
import { Input } from '@web/ui/components/ui/input.tsx'
import { Separator } from '@web/ui/components/ui/separator.tsx'
import { Textarea } from '@web/ui/components/ui/textarea.tsx'

const PROJECTS = [
  { name: 'Atlas', owner: 'Product', updated: '2 min ago', status: 'On track' },
  { name: 'Signal', owner: 'Research', updated: 'Yesterday', status: 'Review' },
  { name: 'Relay', owner: 'Engineering', updated: 'Mon', status: 'On track' },
] as const

const ACTIVITY = [
  { person: 'AM', action: 'Published the weekly review', time: '09:42' },
  { person: 'JR', action: 'Approved the launch checklist', time: '08:16' },
  { person: 'SK', action: 'Added three research notes', time: 'Yesterday' },
] as const

function WorkspacePattern() {
  return (
    <main className="min-h-svh bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-5 md:px-8">
          <div className="flex items-center gap-8">
            <h1>Northstar</h1>
            <nav className="hidden items-center gap-6 md:flex" aria-label="Primary navigation">
              <a href="#overview">Overview</a>
              <a className="text-muted-foreground" href="#projects">
                Projects
              </a>
              <a className="text-muted-foreground" href="#people">
                People
              </a>
            </nav>
          </div>
          <div className="flex items-center gap-2">
            <Button aria-label="Notifications" size="icon" variant="ghost">
              <BellIcon />
            </Button>
            <Avatar>
              <AvatarFallback>AK</AvatarFallback>
            </Avatar>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-5 py-8 md:px-8 md:py-12">
        <header className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div className="flex flex-col gap-2">
            <small className="text-muted-foreground">Monday, August 19</small>
            <h2>Good morning, Alex</h2>
            <p className="text-muted-foreground">Here is what changed across your workspace.</p>
          </div>
          <Button>
            <PlusIcon data-icon="inline-start" />
            New project
          </Button>
        </header>

        <section className="grid gap-4 sm:grid-cols-3" aria-label="Workspace metrics">
          <Card size="sm">
            <CardHeader>
              <CardDescription>Active projects</CardDescription>
              <CardAction>
                <FolderSimpleIcon className="text-muted-foreground" />
              </CardAction>
            </CardHeader>
            <CardContent>
              <p className="text-display">12</p>
              <small className="text-muted-foreground">Across four teams</small>
            </CardContent>
          </Card>
          <Card size="sm">
            <CardHeader>
              <CardDescription>Completed this week</CardDescription>
              <CardAction>
                <CheckCircleIcon className="text-status-success" />
              </CardAction>
            </CardHeader>
            <CardContent>
              <p className="text-display">28</p>
              <small className="text-muted-foreground">Eight ahead of last week</small>
            </CardContent>
          </Card>
          <Card size="sm">
            <CardHeader>
              <CardDescription>Cycle time</CardDescription>
              <CardAction>
                <TrendUpIcon className="text-status-info" />
              </CardAction>
            </CardHeader>
            <CardContent>
              <p className="text-display">3.2 days</p>
              <small className="text-muted-foreground">Improved by half a day</small>
            </CardContent>
          </Card>
        </section>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(20rem,0.6fr)]">
          <Card>
            <CardHeader>
              <CardTitle>Recent projects</CardTitle>
              <CardDescription>Work with activity in the last seven days.</CardDescription>
              <CardAction>
                <Button size="sm" variant="outline">
                  View all
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <MagnifyingGlassIcon className="text-muted-foreground" />
                <Input aria-label="Search projects" placeholder="Search projects" />
              </div>
              <ul className="flex flex-col">
                {PROJECTS.map((project, index) => (
                  <li key={project.name}>
                    {index > 0 ? <Separator /> : null}
                    <div className="flex items-center justify-between gap-4 py-4">
                      <div className="flex min-w-0 flex-col gap-1">
                        <h3>{project.name}</h3>
                        <small className="truncate text-muted-foreground">
                          {project.owner}, updated {project.updated}
                        </small>
                      </div>
                      <Badge variant={project.status === 'Review' ? 'outline' : 'secondary'}>
                        {project.status}
                      </Badge>
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Activity</CardTitle>
              <CardDescription>Latest changes from your team.</CardDescription>
              <CardAction>
                <Button aria-label="Activity options" size="icon-sm" variant="ghost">
                  <DotsThreeIcon />
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col gap-5">
                {ACTIVITY.map((item) => (
                  <li className="flex items-start gap-3" key={`${item.person}-${item.time}`}>
                    <Avatar size="sm">
                      <AvatarFallback>{item.person}</AvatarFallback>
                    </Avatar>
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <p>{item.action}</p>
                      <small className="text-muted-foreground">{item.time}</small>
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
            <CardFooter className="border-t">
              <Button className="w-full" variant="ghost">
                Open activity log
                <ArrowRightIcon data-icon="inline-end" />
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>
    </main>
  )
}

function SettingsPattern() {
  return (
    <main className="min-h-svh bg-background px-5 py-8 text-foreground md:py-14">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-8">
        <header className="flex flex-col gap-2">
          <small className="text-muted-foreground">Workspace settings</small>
          <h1>Profile and identity</h1>
          <p className="max-w-2xl text-muted-foreground">
            A focused form pattern with clear grouping, help text, validation, and stable actions.
          </p>
        </header>

        <div className="grid gap-6 md:grid-cols-[14rem_minmax(0,1fr)]">
          <nav className="flex gap-2 overflow-x-auto md:flex-col" aria-label="Settings sections">
            <Button className="justify-start" variant="secondary">
              Profile
            </Button>
            <Button className="justify-start" variant="ghost">
              Notifications
            </Button>
            <Button className="justify-start" variant="ghost">
              Security
            </Button>
            <Button className="justify-start" variant="ghost">
              Billing
            </Button>
          </nav>

          <Card>
            <CardHeader>
              <CardTitle>Public profile</CardTitle>
              <CardDescription>Shown to collaborators across shared workspaces.</CardDescription>
            </CardHeader>
            <CardContent>
              <form
                onSubmit={(event) => {
                  event.preventDefault()
                }}
              >
                <FieldSet>
                  <FieldLegend className="sr-only">Public profile</FieldLegend>
                  <FieldGroup>
                    <Field>
                      <FieldLabel htmlFor="action-name">Display name</FieldLabel>
                      <Input defaultValue="Alex Kim" id="action-name" />
                      <FieldDescription>
                        Use the name your collaborators know you by.
                      </FieldDescription>
                    </Field>
                    <Field data-invalid>
                      <FieldLabel htmlFor="action-handle">Workspace handle</FieldLabel>
                      <Input
                        defaultValue="alex kim"
                        id="action-handle"
                        aria-invalid
                        aria-describedby="action-handle-error"
                      />
                      <FieldError id="action-handle-error">
                        Handles cannot contain spaces.
                      </FieldError>
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="action-role">Role</FieldLabel>
                      <Input defaultValue="Product lead" id="action-role" />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="action-bio">About</FieldLabel>
                      <Textarea
                        defaultValue="Building thoughtful tools for teams that care about the details."
                        id="action-bio"
                      />
                      <FieldDescription>Keep this short and useful.</FieldDescription>
                    </Field>
                  </FieldGroup>
                </FieldSet>
              </form>
            </CardContent>
            <CardFooter className="justify-end gap-2 border-t">
              <Button variant="ghost">Cancel</Button>
              <Button>Save changes</Button>
            </CardFooter>
          </Card>
        </div>
      </div>
    </main>
  )
}

function OperationsPattern() {
  return (
    <main className="min-h-svh bg-background px-5 py-8 text-foreground md:py-14">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-8">
        <header className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div className="flex flex-col gap-2">
            <small className="text-muted-foreground">Operations</small>
            <h1>Release readiness</h1>
            <p className="text-muted-foreground">
              Prioritize attention without relying on color alone.
            </p>
          </div>
          <Button variant="outline">Review history</Button>
        </header>

        <Alert>
          <ShieldCheckIcon />
          <AlertTitle>All required checks are configured</AlertTitle>
          <AlertDescription>
            Two checks still need a human decision before the release can proceed.
          </AlertDescription>
        </Alert>

        <Card>
          <CardHeader>
            <CardTitle>Checks</CardTitle>
            <CardDescription>Automated and manual gates for version 2.4.</CardDescription>
            <CardAction>
              <Badge variant="secondary">4 of 6 complete</Badge>
            </CardAction>
          </CardHeader>
          <CardContent>
            {/* A ul takes only li, so rows divide with a border rather than a Separator. */}
            <ul className="flex flex-col [&>li+li]:border-t [&>li+li]:border-border">
              <li className="flex items-start gap-3 py-4">
                <CheckCircleIcon className="text-status-success" />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <h2>Security scan</h2>
                  <small className="text-muted-foreground">Completed 12 minutes ago</small>
                </div>
                <Badge variant="outline">Passed</Badge>
              </li>
              <li className="flex items-start gap-3 py-4">
                <ClockIcon className="text-status-info" />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <h2>Performance budget</h2>
                  <small className="text-muted-foreground">Running against production data</small>
                </div>
                <Badge variant="secondary">Running</Badge>
              </li>
              <li className="flex items-start gap-3 py-4">
                <WarningCircleIcon className="text-status-warning" />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <h2>Customer communication</h2>
                  <small className="text-muted-foreground">Copy needs final approval</small>
                </div>
                <Button size="sm">Review</Button>
              </li>
            </ul>
          </CardContent>
          <CardFooter className="justify-between gap-4 border-t">
            <small className="text-muted-foreground">Last updated just now</small>
            <Button disabled>Start release</Button>
          </CardFooter>
        </Card>
      </div>
    </main>
  )
}

const meta = {
  title: 'Design System/In Action',
  component: WorkspacePattern,
} satisfies Meta<typeof WorkspacePattern>

export default meta
type Story = StoryObj<typeof meta>

export const Workspace: Story = {}

export const Settings: Story = {
  render: () => <SettingsPattern />,
}

export const Operations: Story = {
  render: () => <OperationsPattern />,
}
