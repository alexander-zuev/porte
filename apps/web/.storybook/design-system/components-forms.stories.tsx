import { EyeIcon, MagnifyingGlassIcon, PaperPlaneTiltIcon } from '@phosphor-icons/react'
import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { Button } from '@web/ui/components/ui/button.tsx'
import { Checkbox } from '@web/ui/components/ui/checkbox.tsx'
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
  FieldTitle,
} from '@web/ui/components/ui/field.tsx'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
  InputGroupTextarea,
} from '@web/ui/components/ui/input-group.tsx'
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from '@web/ui/components/ui/input-otp.tsx'
import { Input } from '@web/ui/components/ui/input.tsx'
import { Label } from '@web/ui/components/ui/label.tsx'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@web/ui/components/ui/select.tsx'
import { Textarea } from '@web/ui/components/ui/textarea.tsx'

import { Board, Section, Specimen } from './board.tsx'

const REPOSITORIES = {
  porte: 'porte',
  daemon: 'porte-daemon',
  site: 'marketing-site',
} as const

/** Four boxes, a dash, four boxes. The same shape the daemon prints. */
function CodeGroup({ start }: { readonly start: number }) {
  return (
    <InputOTPGroup className="gap-2">
      {Array.from({ length: 4 }, (_, offset) => (
        <InputOTPSlot
          className="size-10 shrink-0 rounded-md border font-mono"
          index={start + offset}
          key={start + offset}
        />
      ))}
    </InputOTPGroup>
  )
}

function FormsBoard() {
  return (
    <Board
      title="Forms"
      summary="Controls in every state a person can reach: empty, filled, disabled, read-only, and rejected."
    >
      <Section title="Text input" note="Help text sits under the control and is never hover-only.">
        <Specimen label="States" stack>
          <Field>
            <FieldLabel htmlFor="name-rest">Workspace name</FieldLabel>
            <Input id="name-rest" placeholder="Northstar" />
            <FieldDescription>People see this name when you invite them.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="name-filled">Filled</FieldLabel>
            <Input defaultValue="Northstar" id="name-filled" />
          </Field>
          <Field data-disabled="true">
            <FieldLabel htmlFor="name-disabled">Disabled</FieldLabel>
            <Input defaultValue="Northstar" disabled id="name-disabled" />
          </Field>
          <Field data-invalid="true">
            <FieldLabel htmlFor="name-invalid">Rejected</FieldLabel>
            <Input aria-invalid="true" defaultValue="north star" id="name-invalid" />
            <FieldError errors={[{ message: 'Use letters, numbers, and dashes only.' }]} />
          </Field>
        </Specimen>

        <Specimen label="Types" stack>
          <Field>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input id="email" placeholder="you@example.com" type="email" />
          </Field>
          <Field>
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <Input id="password" type="password" />
          </Field>
          <Field>
            <FieldLabel htmlFor="port">Port</FieldLabel>
            <Input defaultValue={3000} id="port" type="number" />
          </Field>
          <Field>
            <FieldLabel htmlFor="readonly-path">Read only</FieldLabel>
            <Input id="readonly-path" readOnly value="/Users/az/projects/porte" />
          </Field>
        </Specimen>

        <Specimen label="Textarea" stack>
          <Field>
            <FieldLabel htmlFor="summary">Summary</FieldLabel>
            <Textarea id="summary" placeholder="What should the agent do?" />
            <FieldDescription>The box grows with the text.</FieldDescription>
          </Field>
          <Field data-invalid="true">
            <FieldLabel htmlFor="summary-invalid">Rejected</FieldLabel>
            <Textarea aria-invalid="true" defaultValue="…" id="summary-invalid" />
            <FieldError errors={[{ message: 'Write at least ten characters.' }]} />
          </Field>
        </Specimen>

        <Specimen label="Multiple errors" stack>
          <Field data-invalid="true">
            <FieldLabel htmlFor="path">Project path</FieldLabel>
            <Input aria-invalid="true" defaultValue="../etc" id="path" />
            <FieldError
              errors={[
                { message: 'The path must be absolute.' },
                { message: 'The Mac cannot reach this folder.' },
              ]}
            />
          </Field>
        </Specimen>
      </Section>

      <Section title="Choice" note="A checkbox states one fact. A select picks one of many.">
        <Specimen label="Checkbox" stack>
          <Field orientation="horizontal">
            <Checkbox id="remember" />
            <FieldLabel htmlFor="remember">Remember this Mac</FieldLabel>
          </Field>
          <Field orientation="horizontal">
            <Checkbox defaultChecked id="notify" />
            <FieldLabel htmlFor="notify">Notify me when a turn needs approval</FieldLabel>
          </Field>
          <Field data-disabled="true" orientation="horizontal">
            <Checkbox disabled id="beta" />
            <FieldLabel htmlFor="beta">Join the beta channel</FieldLabel>
          </Field>
          <Field data-invalid="true" orientation="horizontal">
            <Checkbox aria-invalid="true" id="terms" />
            <FieldContent>
              <FieldLabel htmlFor="terms">Accept the terms</FieldLabel>
              <FieldError errors={[{ message: 'Accept the terms to continue.' }]} />
            </FieldContent>
          </Field>
        </Specimen>

        <Specimen label="Select" stack>
          <Field>
            <FieldTitle>Repository</FieldTitle>
            <Select items={REPOSITORIES}>
              <SelectTrigger aria-label="Repository" className="w-full">
                <SelectValue placeholder="Pick a repository" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="porte">porte</SelectItem>
                <SelectItem value="daemon">porte-daemon</SelectItem>
                <SelectItem value="site">marketing-site</SelectItem>
              </SelectContent>
            </Select>
            <FieldDescription>Only folders the Mac has opened before.</FieldDescription>
          </Field>
          <Field>
            <FieldTitle>Preselected, small</FieldTitle>
            <Select defaultValue="daemon" items={REPOSITORIES}>
              <SelectTrigger aria-label="Preselected repository" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="porte">porte</SelectItem>
                <SelectItem value="daemon">porte-daemon</SelectItem>
                <SelectItem value="site">marketing-site</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field data-disabled="true">
            <FieldTitle>Disabled</FieldTitle>
            <Select disabled items={REPOSITORIES}>
              <SelectTrigger aria-label="Disabled repository">
                <SelectValue placeholder="Host is offline" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="porte">porte</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </Specimen>
      </Section>

      <Section title="Input group" note="An affordance that lives inside the control's border.">
        <Specimen label="Leading icon" stack>
          <InputGroup>
            <InputGroupInput aria-label="Search conversations" placeholder="Search" />
            <InputGroupAddon>
              <MagnifyingGlassIcon />
            </InputGroupAddon>
          </InputGroup>
        </Specimen>
        <Specimen label="Trailing action" stack>
          <InputGroup>
            <InputGroupInput aria-label="Secret" defaultValue="sk-live-0000" type="password" />
            <InputGroupAddon align="inline-end">
              <InputGroupButton aria-label="Show the secret" size="icon-xs">
                <EyeIcon />
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
        </Specimen>
        <Specimen label="Prefix text" stack>
          <InputGroup>
            <InputGroupAddon>
              <InputGroupText>porte.dev/</InputGroupText>
            </InputGroupAddon>
            <InputGroupInput aria-label="Workspace slug" defaultValue="northstar" />
          </InputGroup>
        </Specimen>
        <Specimen label="Composer" stack>
          <InputGroup>
            <InputGroupTextarea aria-label="Message" placeholder="Ask the agent to do something" />
            <InputGroupAddon align="block-end">
              <InputGroupButton className="ml-auto" size="icon-sm" variant="default">
                <PaperPlaneTiltIcon />
                <span className="sr-only">Send</span>
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
        </Specimen>
        <Specimen label="Rejected" stack wide>
          <InputGroup>
            <InputGroupInput aria-invalid="true" aria-label="Repository URL" defaultValue="git@" />
            <InputGroupAddon align="inline-end">
              <InputGroupText>Invalid</InputGroupText>
            </InputGroupAddon>
          </InputGroup>
        </Specimen>
      </Section>

      <Section title="Code entry" note="Eight characters, split so a thumb can find its place.">
        <Specimen label="Empty" wide>
          <InputOTP
            aria-label="Pairing code"
            autoComplete="off"
            containerClassName="w-full justify-between max-sm:flex-wrap max-sm:justify-center max-sm:gap-3"
            maxLength={8}
          >
            <CodeGroup start={0} />
            <InputOTPSeparator />
            <CodeGroup start={4} />
          </InputOTP>
        </Specimen>
        <Specimen label="Rejected" wide>
          <InputOTP
            aria-invalid="true"
            aria-label="Rejected pairing code"
            autoComplete="off"
            containerClassName="w-full justify-between max-sm:flex-wrap max-sm:justify-center max-sm:gap-3"
            defaultValue="4821AB39"
            maxLength={8}
          >
            <CodeGroup start={0} />
            <InputOTPSeparator />
            <CodeGroup start={4} />
          </InputOTP>
          <p className="text-destructive-muted-foreground" role="alert">
            That code has expired. Ask the Mac for a new one.
          </p>
        </Specimen>
      </Section>

      <Section title="Grouped form" note="A fieldset names the group; a legend names the question.">
        <Specimen label="Sign-in form" stack wide>
          <FieldSet>
            <FieldLegend>Connect a Mac</FieldLegend>
            <FieldDescription>
              Porte runs the agent on your machine. The browser only sends instructions.
            </FieldDescription>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="host-name">Machine name</FieldLabel>
                <Input defaultValue="Alexander's MacBook Pro" id="host-name" />
              </Field>
              <Field orientation="horizontal">
                <Checkbox defaultChecked id="trust" />
                <FieldContent>
                  <FieldLabel htmlFor="trust">Trust this browser for 30 days</FieldLabel>
                  <FieldDescription>You can revoke it from the account page.</FieldDescription>
                </FieldContent>
              </Field>
              <FieldSeparator>or</FieldSeparator>
              <Field>
                <Label htmlFor="paste-code">Paste a code from the terminal</Label>
                <Input id="paste-code" placeholder="4821-AB39" />
              </Field>
              <Field orientation="horizontal">
                <Button type="submit">Connect</Button>
                <Button type="button" variant="ghost">
                  Cancel
                </Button>
              </Field>
            </FieldGroup>
          </FieldSet>
        </Specimen>
      </Section>
    </Board>
  )
}

const meta = {
  title: 'Design System/Components/Forms',
  component: FormsBoard,
} satisfies Meta<typeof FormsBoard>

export default meta
type Story = StoryObj<typeof meta>

export const All: Story = {}
