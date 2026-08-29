import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { ConversationPermissions } from '@web/features/conversation/components/conversation-permission.tsx'
import {
  ConversationChanges,
  ConversationPlans,
} from '@web/features/conversation/components/conversation-progress.tsx'
import {
  ConversationTurnFailed,
  NoMessagesYet,
  TurnPending,
} from '@web/features/conversation/components/conversation-states.tsx'
import { MessageCopy } from '@web/features/conversation/components/message-copy.tsx'
import { MessageFiles } from '@web/features/conversation/components/message-files.tsx'
import { ToolCallRow, ToolRun } from '@web/features/conversation/components/tool-run.tsx'
import { spanDiff } from '@web/features/conversation/models/span-diff.ts'
import {
  toolCall,
  turnChanges,
  type ToolCall,
} from '@web/features/conversation/models/tool-runs.ts'
import { TitledCodeBlock } from '@web/ui/components/ai-elements/code-block.tsx'
import { Context, ContextContent, ContextTrigger } from '@web/ui/components/ai-elements/context.tsx'
import {
  Message,
  MessageContent,
  MessageResponse,
} from '@web/ui/components/ai-elements/message.tsx'
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from '@web/ui/components/ai-elements/reasoning.tsx'
import { isDynamicToolUIPart, isFileUIPart, isTextUIPart, type UIMessage } from 'ai'

import {
  answerStop,
  answerTestsRunning,
  askStop,
  commitPermission,
  donePlan,
  filePlan,
  itemsPlan,
  markdownPlan,
  stopHookDiff,
  writeFilePermission,
} from '../fixtures/transcript.ts'
import { Board, Section, Specimen } from './board.tsx'

/*
 * Every part of a turn, one at a time, at every state it has.
 *
 * Rendered through the feature components (`ToolCallRow`, `MessageFiles`,
 * `ConversationPlans`, …) rather than the AI Elements underneath, so a part
 * here and the same part on the conversation screen can never drift apart.
 * The chat stories show these in context; this board is for looking closely,
 * and for the design suite to check contrast and names on each in isolation.
 */

/** One call out of a message, by the id the fixture gave it. */
function call(message: UIMessage, toolCallId: string): ToolCall {
  const part = message.parts.find(
    (one) => isDynamicToolUIPart(one) && one.toolCallId === toolCallId,
  )
  if (part === undefined || !isDynamicToolUIPart(part)) throw new Error(`No call ${toolCallId}`)
  return toolCall(part)
}

const READ = call(answerStop, 'call-read-stop')
const SEARCH = call(answerStop, 'call-grep-stop')
const EDIT = call(answerStop, 'call-edit-stop')
const EDIT_FAILED = call(answerStop, 'call-edit-stop-stale')
const RUNNING = call(answerTestsRunning, 'call-test-run')
const SETTLED_RUN = [EDIT, call(answerStop, 'call-edit-chat'), call(answerStop, 'call-typecheck')]

const THOUGHT = answerStop.parts.find((part) => part.type === 'reasoning')?.text ?? ''
const ANSWER = answerStop.parts.filter(isTextUIPart).at(-1)?.text ?? ''
const FILES = askStop.parts.filter(isFileUIPart)
const PROMPT = askStop.parts.filter(isTextUIPart)[0]?.text ?? ''

const TS_CODE = `const stop = useStopTurn(agent.stub, state.runningTurnId)

<PromptInputSubmit status={status} onStop={stop.onStop} />`

function PartsBoard() {
  return (
    <Board
      title="AI — parts"
      summary="What one turn is made of, each piece alone. The same components the conversation screen renders, so nothing here can look different there."
    >
      <Section
        title="Message"
        note="The prompt is a bubble that sizes to its words. The answer is the page."
      >
        <Specimen
          label="Prompt with files"
          note="Photos are tiles; anything else is named."
          stack
          wide
        >
          <Message from="user">
            <MessageContent>
              <MessageFiles files={FILES} />
              <MessageResponse>{PROMPT}</MessageResponse>
            </MessageContent>
          </Message>
        </Specimen>

        <Specimen
          label="Answer"
          note="Markdown: bold, a list, a table, inline code, a fence. Copy under it once settled."
          stack
          wide
        >
          <Message from="assistant">
            <MessageContent>
              <MessageResponse>{ANSWER}</MessageResponse>
            </MessageContent>
            <MessageCopy text={ANSWER} />
          </Message>
        </Specimen>
      </Section>

      <Section
        title="Reasoning"
        note="Closed by default, per part. Streaming shows the label moving."
      >
        <Specimen label="Thinking" stack>
          <Reasoning isStreaming>
            <ReasoningTrigger />
            <ReasoningContent>{THOUGHT.slice(0, 96)}</ReasoningContent>
          </Reasoning>
        </Specimen>

        <Specimen
          label="Done"
          note="Open it: the words, and on a phone the calls made inside it."
          stack
        >
          <Reasoning duration={4}>
            <ReasoningTrigger />
            <ReasoningContent steps={<ToolRun calls={[SEARCH, READ]} settled />}>
              {THOUGHT}
            </ReasoningContent>
          </Reasoning>
        </Specimen>
      </Section>

      <Section
        title="Tool call"
        note="One row per call: the kind's glyph, Grok's title, and what went in and came out under it."
      >
        <Specimen label="Read" stack>
          <ToolCallRow call={READ} />
        </Specimen>
        <Specimen label="Search" note="Grok titles a search with its pattern." stack>
          <ToolCallRow call={SEARCH} />
        </Specimen>
        <Specimen label="Edit" note="Lines in and out on the row; the span diff under it." stack>
          <ToolCallRow call={EDIT} />
        </Specimen>
        <Specimen label="Running" note="The dot moves while the call does." stack>
          <ToolCallRow call={RUNNING} />
        </Specimen>
        <Specimen label="Failed" note="Grok's own words for a stale edit." stack>
          <ToolCallRow call={EDIT_FAILED} />
        </Specimen>
        <Specimen
          label="Settled run"
          note="Several finished calls fold to what was done. Open for the rows; a sheet on a phone."
          stack
        >
          <ToolRun calls={SETTLED_RUN} settled />
        </Specimen>
      </Section>

      <Section
        title="Code"
        note="One block for a fence, a tool result, and a diff. Copy and expand in the header."
      >
        <Specimen label="Fence" stack wide>
          <TitledCodeBlock code={TS_CODE} language="tsx" title="tsx" />
        </Specimen>
        <Specimen label="Diff" note="A replaced span, as an edit reports it." stack wide>
          <TitledCodeBlock code={spanDiff(stopHookDiff)} language="diff" title="use-stop-turn.ts" />
        </Specimen>
      </Section>

      <Section
        title="Above the composer"
        note="What the turn is doing to the files, and what it still plans to."
      >
        <Specimen label="Changes line" stack wide>
          <ConversationChanges changes={turnChanges(answerStop)} />
        </Specimen>
        <Specimen
          label="Plan, running"
          note="Done, doing, not yet. Only the current step at full contrast."
          stack
          wide
        >
          <ConversationPlans plans={[itemsPlan]} running />
        </Specimen>
        <Specimen label="Plan, finished" stack wide>
          <ConversationPlans plans={[donePlan]} running={false} />
        </Specimen>
        <Specimen label="Plan as written steps, and as a file" stack wide>
          <ConversationPlans plans={[markdownPlan, filePlan]} running={false} />
        </Specimen>
      </Section>

      <Section
        title="Permission"
        note="The agent stopped to ask. Allowing is neutral; refusing ends the turn."
      >
        <Specimen label="Waiting" stack wide>
          <ConversationPermissions
            waiting={[{ permission: commitPermission, answering: false }]}
            onAnswer={() => undefined}
          />
        </Specimen>
        <Specimen label="Answering" note="Sent, and dead until the Mac replies." stack wide>
          <ConversationPermissions
            waiting={[{ permission: writeFilePermission, answering: true }]}
            onAnswer={() => undefined}
          />
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

      <Section
        title="States"
        note="Nothing yet, nothing back yet, and a turn that stopped on its own."
      >
        <Specimen label="No messages" stack wide>
          <NoMessagesYet />
        </Specimen>
        <Specimen
          label="Waiting for the first token"
          note="The one place a moving label is allowed."
          stack
        >
          <TurnPending />
        </Specimen>
        <Specimen label="Turn failed" stack wide>
          <ConversationTurnFailed
            error={new Error('The Mac closed the connection while the answer was being written.')}
          />
        </Specimen>
      </Section>
    </Board>
  )
}

const meta = {
  title: 'Design System/AI/Parts',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const Parts: Story = { render: () => <PartsBoard /> }
