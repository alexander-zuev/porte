import { ArrowClockwiseIcon, CopyIcon, ThumbsDownIcon, ThumbsUpIcon } from '@phosphor-icons/react'
import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { ConversationPlans } from '@web/features/conversation/components/conversation-progress.tsx'
import { NoMessagesYet } from '@web/features/conversation/components/conversation-states.tsx'
import {
  Attachment,
  AttachmentInfo,
  AttachmentPreview,
  Attachments,
} from '@web/ui/components/ai-elements/attachments.tsx'
import {
  CodeBlock,
  CodeBlockActions,
  CodeBlockCopyButton,
  CodeBlockFilename,
  CodeBlockHeader,
  CodeBlockLanguageSelector,
  CodeBlockLanguageSelectorContent,
  CodeBlockLanguageSelectorItem,
  CodeBlockLanguageSelectorTrigger,
  CodeBlockLanguageSelectorValue,
  CodeBlockTitle,
} from '@web/ui/components/ai-elements/code-block.tsx'
import {
  Confirmation,
  ConfirmationAccepted,
  ConfirmationAction,
  ConfirmationActions,
  ConfirmationRejected,
  ConfirmationRequest,
  ConfirmationTitle,
} from '@web/ui/components/ai-elements/confirmation.tsx'
import { Context, ContextContent, ContextTrigger } from '@web/ui/components/ai-elements/context.tsx'
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from '@web/ui/components/ai-elements/conversation.tsx'
import {
  Message,
  MessageAction,
  MessageActions,
  MessageBranch,
  MessageBranchContent,
  MessageBranchNext,
  MessageBranchPage,
  MessageBranchPrevious,
  MessageBranchSelector,
  MessageContent,
  MessageResponse,
  MessageToolbar,
} from '@web/ui/components/ai-elements/message.tsx'
import {
  PromptInput,
  PromptInputActionAddAttachments,
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuItem,
  PromptInputActionMenuTrigger,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from '@web/ui/components/ai-elements/prompt-input.tsx'
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from '@web/ui/components/ai-elements/reasoning.tsx'
import { Shimmer } from '@web/ui/components/ai-elements/shimmer.tsx'
import {
  Source,
  Sources,
  SourcesContent,
  SourcesTrigger,
} from '@web/ui/components/ai-elements/sources.tsx'
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from '@web/ui/components/ai-elements/tool.tsx'
import type { ChatStatus, ToolUIPart } from 'ai'

import { donePlan, filePlan, itemsPlan, markdownPlan } from '../fixtures/transcript.ts'
import { Board, Section, Specimen } from './board.tsx'

const REASONING = [
  'The socket closes on deploy, so the queue has to live in storage.',
  'Both call sites drain before they register, which loses the first frames.',
].join(' ')

const ANSWER = [
  'The queue is drained **before** the new socket is registered.',
  '',
  '- `relay.drain()` runs first',
  '- the socket registers after it',
  '',
  'Swap the two lines and the gap closes.',
].join('\n')

const TS_CODE = [
  'export function register(socket: WebSocket): void {',
  '  relay.register(socket)',
  '  relay.drain()',
  '}',
].join('\n')

const DIFF_CODE = [
  '-relay.drain()',
  '-relay.register(socket)',
  '+relay.register(socket)',
  '+relay.drain()',
].join('\n')

const TOOL_INPUT = { command: 'pnpm test --filter @porte/core', cwd: '/Users/az/projects/porte' }

/** Every state a tool call can be read in, in the order one turn moves through. */
const TOOL_STATES: readonly ToolUIPart['state'][] = [
  'input-streaming',
  'input-available',
  'approval-requested',
  'approval-responded',
  'output-available',
  'output-denied',
  'output-error',
]

/** A one-pixel square, so an image attachment needs no network. */
const PIXEL =
  'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCI+PHJlY3Qgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiBmaWxsPSIjNjM2NmYxIi8+PC9zdmc+'

const LANGUAGES = { typescript: 'TypeScript', json: 'JSON', diff: 'Diff' } as const

/** Every state the one send control can be read in, in the order a turn hits them. */
const SUBMIT_STATES: readonly {
  label: string
  status?: ChatStatus
  disabled?: boolean
}[] = [
  { label: 'Nothing typed', status: 'ready', disabled: true },
  { label: 'Ready to send', status: 'ready' },
  { label: 'Sent', status: 'submitted' },
  { label: 'Answering — stops', status: 'streaming' },
  { label: 'Mac offline', disabled: true },
]

/** Enough turns to push the last one out of a 16rem frame. */
const SCROLL_TURNS = Array.from({ length: 12 }, (_, index) => ({
  from: index % 2 === 0 ? ('user' as const) : ('assistant' as const),
  label: `Turn ${String(index + 1)}`,
}))

function TranscriptBoard() {
  return (
    <Board
      title="AI elements — transcript"
      summary="What one turn is made of. Every part here is rendered by the same component the conversation screen uses."
    >
      <Section title="Message" note="The prompt is a bubble. The answer is not: it is the page.">
        <Specimen label="Prompt" stack wide>
          <Message from="user">
            <MessageContent>
              <MessageResponse>The relay drops frames after every deploy.</MessageResponse>
            </MessageContent>
          </Message>
        </Specimen>

        <Specimen label="Answer" stack wide>
          <Message from="assistant">
            <MessageContent>
              <MessageResponse>{ANSWER}</MessageResponse>
            </MessageContent>
          </Message>
        </Specimen>

        <Specimen label="Answer with actions" note="Copy, retry, and a verdict." stack wide>
          <Message from="assistant">
            <MessageContent>
              <MessageResponse>Swapped the two lines and the queue survives.</MessageResponse>
            </MessageContent>
            <MessageToolbar>
              <MessageActions>
                <MessageAction tooltip="Copy">
                  <CopyIcon className="size-4" />
                </MessageAction>
                <MessageAction tooltip="Retry">
                  <ArrowClockwiseIcon className="size-4" />
                </MessageAction>
                <MessageAction tooltip="Good answer">
                  <ThumbsUpIcon className="size-4" />
                </MessageAction>
                <MessageAction tooltip="Bad answer">
                  <ThumbsDownIcon className="size-4" />
                </MessageAction>
              </MessageActions>
            </MessageToolbar>
          </Message>
        </Specimen>

        <Specimen label="Branches" note="One prompt, two answers kept side by side." stack wide>
          <MessageBranch defaultBranch={0}>
            <MessageBranchContent>
              <Message from="assistant" key="branch-order">
                <MessageContent>
                  <MessageResponse>Swap the two lines.</MessageResponse>
                </MessageContent>
              </Message>
              <Message from="assistant" key="branch-storage">
                <MessageContent>
                  <MessageResponse>Keep the queue in storage instead.</MessageResponse>
                </MessageContent>
              </Message>
            </MessageBranchContent>
            <MessageBranchSelector>
              <MessageBranchPrevious />
              <MessageBranchPage />
              <MessageBranchNext />
            </MessageBranchSelector>
          </MessageBranch>
        </Specimen>
      </Section>

      <Section
        title="Reasoning"
        note="Open while it is being written, closed once it is done. Per part, never per turn."
      >
        <Specimen label="Thinking" stack>
          <Reasoning isStreaming>
            <ReasoningTrigger />
            <ReasoningContent>{REASONING}</ReasoningContent>
          </Reasoning>
        </Specimen>

        <Specimen label="Finished" note="Collapsed, with how long it took." stack>
          <Reasoning duration={12}>
            <ReasoningTrigger />
            <ReasoningContent>{REASONING}</ReasoningContent>
          </Reasoning>
        </Specimen>
      </Section>

      <Section title="Tool" note="One call, read at every point between asked and answered.">
        {TOOL_STATES.map((state) => (
          <Specimen key={state} label={state} stack wide={state === 'output-available'}>
            <Tool defaultOpen={state === 'output-available' || state === 'output-error'}>
              <ToolHeader state={state} toolName="run_command" type="dynamic-tool" />
              <ToolContent>
                <ToolInput input={TOOL_INPUT} />
                {state === 'output-available' ? (
                  <ToolOutput errorText={undefined} output="4 files changed, 12 tests passed." />
                ) : null}
                {state === 'output-error' ? (
                  <ToolOutput
                    errorText="Command failed with exit code 2: 4 type errors in apps/web."
                    output={undefined}
                  />
                ) : null}
              </ToolContent>
            </Tool>
          </Specimen>
        ))}
      </Section>

      <Section title="Sources" note="What the answer read, folded away until it is asked for.">
        <Specimen label="Closed" stack wide>
          <Sources>
            <SourcesTrigger count={2} />
            <SourcesContent>
              <Source href="https://developers.cloudflare.com/durable-objects/">
                Durable Objects
              </Source>
              <Source href="https://developers.cloudflare.com/durable-objects/best-practices/websockets/">
                WebSockets in Durable Objects
              </Source>
            </SourcesContent>
          </Sources>
        </Specimen>
      </Section>

      <Section
        title="Attachments"
        note="A preview when there is one, a media icon when there is not."
      >
        <Specimen label="Every media type" stack wide>
          <Attachments>
            <Attachment
              data={{
                id: 'a1',
                type: 'file',
                mediaType: 'image/svg+xml',
                filename: 'graph.svg',
                url: PIXEL,
              }}
            >
              <AttachmentPreview />
              <AttachmentInfo />
            </Attachment>
            <Attachment
              data={{
                id: 'a2',
                type: 'file',
                mediaType: 'application/pdf',
                filename: 'spec.pdf',
                url: '#',
              }}
            >
              <AttachmentPreview />
              <AttachmentInfo />
            </Attachment>
            <Attachment
              data={{
                id: 'a3',
                type: 'file',
                mediaType: 'audio/mpeg',
                filename: 'standup.mp3',
                url: '#',
              }}
            >
              <AttachmentPreview />
              <AttachmentInfo />
            </Attachment>
            <Attachment
              data={{
                id: 'a4',
                type: 'source-document',
                sourceId: 'doc-1',
                mediaType: 'text/markdown',
                title: 'relay-plan.md',
              }}
            >
              <AttachmentPreview />
              <AttachmentInfo />
            </Attachment>
          </Attachments>
        </Specimen>
      </Section>

      <Section
        title="Code"
        note="Highlighted on the client. The header carries the file and the copy."
      >
        <Specimen label="Plain" stack wide>
          <CodeBlock code={TS_CODE} language="typescript" />
        </Specimen>

        <Specimen label="With header and line numbers" stack wide>
          <CodeBlock code={TS_CODE} language="typescript" showLineNumbers>
            <CodeBlockHeader>
              <CodeBlockTitle>
                <CodeBlockFilename>packages/core/src/relay/relay.ts</CodeBlockFilename>
              </CodeBlockTitle>
              <CodeBlockActions>
                <CodeBlockLanguageSelector defaultValue="typescript" items={LANGUAGES}>
                  <CodeBlockLanguageSelectorTrigger aria-label="Language">
                    <CodeBlockLanguageSelectorValue />
                  </CodeBlockLanguageSelectorTrigger>
                  <CodeBlockLanguageSelectorContent>
                    <CodeBlockLanguageSelectorItem value="typescript">
                      TypeScript
                    </CodeBlockLanguageSelectorItem>
                    <CodeBlockLanguageSelectorItem value="json">JSON</CodeBlockLanguageSelectorItem>
                    <CodeBlockLanguageSelectorItem value="diff">Diff</CodeBlockLanguageSelectorItem>
                  </CodeBlockLanguageSelectorContent>
                </CodeBlockLanguageSelector>
                <CodeBlockCopyButton />
              </CodeBlockActions>
            </CodeBlockHeader>
          </CodeBlock>
        </Specimen>

        <Specimen label="Diff" note="What one tool call wrote." stack wide>
          <CodeBlock code={DIFF_CODE} language="diff" />
        </Specimen>
      </Section>

      <Section
        title="Shimmer"
        note="The one place a moving label is allowed: nothing has arrived yet."
      >
        <Specimen label="Waiting">
          <Shimmer>Reading the relay…</Shimmer>
        </Specimen>
      </Section>
    </Board>
  )
}

function ControlsBoard() {
  return (
    <Board
      title="AI elements — controls"
      summary="What is asked of the reader, and what the reader sends back. Every one of these blocks the turn or starts it."
    >
      <Section title="Confirmation" note="The agent stopped. Nothing moves until this is answered.">
        <Specimen label="Asked" stack wide>
          <Confirmation approval={{ id: 'ask-1' }} state="approval-requested">
            <ConfirmationTitle>Run `pnpm test --filter @porte/core` in porte</ConfirmationTitle>
            <ConfirmationRequest>
              <ConfirmationActions>
                <ConfirmationAction>Allow once</ConfirmationAction>
                <ConfirmationAction>Always allow</ConfirmationAction>
                <ConfirmationAction variant="destructive">Reject</ConfirmationAction>
              </ConfirmationActions>
            </ConfirmationRequest>
          </Confirmation>
        </Specimen>

        <Specimen label="Allowed" stack wide>
          <Confirmation approval={{ id: 'ask-2', approved: true }} state="approval-responded">
            <ConfirmationTitle>Run `pnpm test --filter @porte/core` in porte</ConfirmationTitle>
            <ConfirmationAccepted>
              <small className="text-muted-foreground">Allowed once</small>
            </ConfirmationAccepted>
          </Confirmation>
        </Specimen>

        <Specimen label="Rejected" stack wide>
          <Confirmation approval={{ id: 'ask-3', approved: false }} state="approval-responded">
            <ConfirmationTitle>Write `packages/core/src/relay/relay.ts`</ConfirmationTitle>
            <ConfirmationRejected>
              <small className="text-muted-foreground">Rejected — the turn stopped here</small>
            </ConfirmationRejected>
          </Confirmation>
        </Specimen>
      </Section>

      {/* Through `ConversationPlans` rather than the parts, so a plan here and a
          plan on the conversation screen can never drift apart. */}
      <Section title="Plan" note="What the agent said it would do, and how far along it is.">
        <Specimen label="Running" note="Done, doing, and not started yet." stack wide>
          <ConversationPlans plans={[itemsPlan]} running />
        </Specimen>

        <Specimen label="Finished" stack wide>
          <ConversationPlans plans={[donePlan]} running={false} />
        </Specimen>

        <Specimen label="Written steps and a file" stack wide>
          <ConversationPlans plans={[markdownPlan, filePlan]} running={false} />
        </Specimen>
      </Section>

      <Section
        title="Context"
        note="How much of the window is spent. Hover for the count and the cost."
      >
        <Specimen label="Early">
          <Context maxTokens={200_000} usedTokens={14_000}>
            <ContextTrigger aria-label="Show context usage" />
            <ContextContent>
              <small className="text-muted-foreground">Cost $0.42</small>
            </ContextContent>
          </Context>
        </Specimen>

        <Specimen label="Nearly full">
          <Context maxTokens={200_000} usedTokens={184_000}>
            <ContextTrigger aria-label="Show context usage" />
            <ContextContent>
              <small className="text-muted-foreground">Cost $6.10</small>
            </ContextContent>
          </Context>
        </Specimen>
      </Section>

      <Section title="Prompt" note="The composer, in every state the socket can put it in.">
        <Specimen
          label="Send control"
          note="One button carries the whole turn: send it, stop it, or say it cannot go."
          wide
        >
          {SUBMIT_STATES.map((state) => (
            <div className="flex flex-col items-center gap-2" key={state.label}>
              <PromptInputSubmit
                disabled={state.disabled}
                status={state.status}
                onStop={state.status === 'streaming' ? () => undefined : undefined}
              />
              <small className="text-muted-foreground">{state.label}</small>
            </div>
          ))}
        </Specimen>

        <Specimen label="Ready" stack wide>
          <PromptInput onSubmit={() => undefined}>
            <PromptInputBody>
              <PromptInputTextarea placeholder="Message Grok…" />
              <PromptInputFooter>
                <PromptInputTools>
                  <PromptInputActionMenu>
                    <PromptInputActionMenuTrigger aria-label="Add attachment" />
                    <PromptInputActionMenuContent>
                      <PromptInputActionAddAttachments />
                      <PromptInputActionMenuItem>
                        /review — Review the current changes
                      </PromptInputActionMenuItem>
                    </PromptInputActionMenuContent>
                  </PromptInputActionMenu>
                  <small className="text-muted-foreground">Model: Grok Code</small>
                </PromptInputTools>
                <PromptInputSubmit className="ml-auto" status="ready" />
              </PromptInputFooter>
            </PromptInputBody>
          </PromptInput>
        </Specimen>

        <Specimen label="Sent" note="Waiting for the first token." stack wide>
          <PromptInput onSubmit={() => undefined}>
            <PromptInputBody>
              <PromptInputTextarea placeholder="Message Grok…" />
              <PromptInputFooter>
                <PromptInputTools>
                  <PromptInputActionMenu>
                    <PromptInputActionMenuTrigger aria-label="Add attachment" />
                    <PromptInputActionMenuContent>
                      <PromptInputActionAddAttachments />
                    </PromptInputActionMenuContent>
                  </PromptInputActionMenu>
                </PromptInputTools>
                <PromptInputSubmit className="ml-auto" status="submitted" />
              </PromptInputFooter>
            </PromptInputBody>
          </PromptInput>
        </Specimen>

        <Specimen label="Answering" note="The same control stops the turn." stack wide>
          <PromptInput onSubmit={() => undefined}>
            <PromptInputBody>
              <PromptInputTextarea placeholder="Message Grok…" />
              <PromptInputFooter>
                <PromptInputTools>
                  <PromptInputActionMenu>
                    <PromptInputActionMenuTrigger aria-label="Add attachment" />
                    <PromptInputActionMenuContent>
                      <PromptInputActionAddAttachments />
                    </PromptInputActionMenuContent>
                  </PromptInputActionMenu>
                </PromptInputTools>
                <PromptInputSubmit
                  className="ml-auto"
                  status="streaming"
                  onStop={() => undefined}
                />
              </PromptInputFooter>
            </PromptInputBody>
          </PromptInput>
        </Specimen>

        <Specimen label="Failed" stack wide>
          <PromptInput onSubmit={() => undefined}>
            <PromptInputBody>
              <PromptInputTextarea placeholder="Message Grok…" />
              <PromptInputFooter>
                <PromptInputTools />
                <PromptInputSubmit className="ml-auto" status="error" />
              </PromptInputFooter>
            </PromptInputBody>
          </PromptInput>
        </Specimen>

        <Specimen label="Offline" note="Nothing can be sent, and the box says why." stack wide>
          <PromptInput onSubmit={() => undefined}>
            <PromptInputBody>
              <PromptInputTextarea disabled placeholder="Your Mac is offline" />
              <PromptInputFooter>
                <PromptInputTools>
                  <PromptInputActionMenu>
                    <PromptInputActionMenuTrigger aria-label="Add attachment" disabled />
                    <PromptInputActionMenuContent>
                      <PromptInputActionAddAttachments />
                    </PromptInputActionMenuContent>
                  </PromptInputActionMenu>
                </PromptInputTools>
                <PromptInputSubmit className="ml-auto" disabled />
              </PromptInputFooter>
            </PromptInputBody>
          </PromptInput>
        </Specimen>
      </Section>

      <Section title="Conversation" note="The scroller the transcript lives in.">
        <Specimen label="Empty" stack wide>
          <div className="flex h-64 flex-col rounded-md border border-border">
            <Conversation>
              <ConversationContent>
                <NoMessagesYet />
              </ConversationContent>
              <ConversationScrollButton />
            </Conversation>
          </div>
        </Specimen>

        <Specimen
          label="Scrolled up"
          note="The control appears once the last turn is off-screen."
          stack
          wide
        >
          <div className="flex h-64 flex-col rounded-md border border-border">
            <Conversation initial={false} resize="instant">
              <ConversationContent>
                {SCROLL_TURNS.map((turn) => (
                  <Message from={turn.from} key={turn.label}>
                    <MessageContent>
                      <MessageResponse>{turn.label}</MessageResponse>
                    </MessageContent>
                  </Message>
                ))}
              </ConversationContent>
              <ConversationScrollButton />
            </Conversation>
          </div>
        </Specimen>
      </Section>
    </Board>
  )
}

const meta = {
  title: 'Design System/AI/Elements',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const Transcript: Story = { render: () => <TranscriptBoard /> }
export const Controls: Story = { render: () => <ControlsBoard /> }
