import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { SpanDiffBlock, ToolDetail } from '@web/features/conversation/components/tool-detail.tsx'
import {
  RunSheetBody,
  ToolCallRow,
  ToolRun,
} from '@web/features/conversation/components/tool-run.tsx'
import { toolCall, type ToolCall } from '@web/features/conversation/models/tool-runs.ts'
import { TitledCodeBlock } from '@web/ui/components/ai-elements/code-block.tsx'
import { Drawer } from '@web/ui/components/ui/drawer.tsx'
import type { DynamicToolUIPart } from 'ai'

import { stopHookDiff } from '../fixtures/transcript.ts'
import { Board, Section, Specimen } from './board.tsx'

/*
 * The tool-rendering review board: every change from the 2026-08-31 redesign,
 * next to a reproduction of what it replaced. The `Before` section is a
 * facsimile — the old components are deleted — and goes with it once approved.
 */

const REPO = '/Users/az/projects/porte'

/** A finished command, with the description Grok sends beside it. */
const RAN: DynamicToolUIPart = {
  type: 'dynamic-tool',
  toolCallId: 'review-run',
  toolName: 'run_terminal_command',
  title: 'Execute `git status`',
  toolMetadata: {
    kind: 'execute',
    locations: [],
    _meta: { 'x.ai/tool': { label: 'Run Command' } },
  },
  state: 'output-available',
  input: { command: 'git status', description: 'Show working tree status' },
  output: {
    content: [
      {
        type: 'content',
        content: {
          type: 'text',
          text: 'On branch main\nnothing to commit, working tree clean',
        },
      },
    ],
    rawOutput: null,
  },
}

const SEARCHED: DynamicToolUIPart = {
  type: 'dynamic-tool',
  toolCallId: 'review-search',
  toolName: 'grep',
  title: 'tool-run',
  toolMetadata: { kind: 'search', locations: [], _meta: { 'x.ai/tool': { label: 'Grep' } } },
  state: 'output-available',
  input: { pattern: 'tool-run' },
  output: {
    content: [
      {
        type: 'content',
        content: {
          type: 'text',
          text: `Found 2 files\n${REPO}/apps/web/src/features/conversation/components/tool-run.tsx\n${REPO}/apps/web/src/features/conversation/components/conversation-messages.tsx`,
        },
      },
    ],
    rawOutput: null,
  },
}

const READ: DynamicToolUIPart = {
  type: 'dynamic-tool',
  toolCallId: 'review-read',
  toolName: 'read_file',
  title: 'Read `use-phone.ts`',
  toolMetadata: {
    kind: 'read',
    locations: [{ path: `${REPO}/apps/web/src/ui/hooks/use-phone.ts` }],
    _meta: { 'x.ai/tool': { label: 'Read' } },
  },
  state: 'output-available',
  input: { target_file: `${REPO}/apps/web/src/ui/hooks/use-phone.ts`, limit: 4 },
  output: {
    content: [
      {
        type: 'content',
        content: {
          type: 'text',
          text: "1→import { useSyncExternalStore } from 'react'\n2→\n3→/** Tailwind's `md`: the app switches layouts here. */\n4→const QUERY = '(width < 48rem)'",
        },
      },
    ],
    rawOutput: null,
  },
}

const EDITED: DynamicToolUIPart = {
  type: 'dynamic-tool',
  toolCallId: 'review-edit',
  toolName: 'search_replace',
  title: `Edit \`${stopHookDiff.path}\``,
  toolMetadata: {
    kind: 'edit',
    locations: [{ path: stopHookDiff.path }],
    _meta: { 'x.ai/tool': { label: 'Edit' } },
  },
  state: 'output-available',
  input: { file_path: stopHookDiff.path },
  output: { content: [stopHookDiff], rawOutput: null },
}

/** A tool Porte has no schema for: a subagent, labeled by Grok, output as JSON. */
const SUBAGENT: DynamicToolUIPart = {
  type: 'dynamic-tool',
  toolCallId: 'review-subagent',
  toolName: 'spawn_subagent',
  title: 'Plan custom domain',
  toolMetadata: { kind: 'other', locations: [], _meta: { 'x.ai/tool': { label: 'Subagent' } } },
  state: 'output-available',
  input: { type: 'plan', description: 'Plan custom domain' },
  output: {
    content: [],
    rawOutput: { subagent_id: '01a05a1e-7e4c-7673', type: 'plan', started: true },
  },
}

const RUNNING: DynamicToolUIPart = {
  type: 'dynamic-tool',
  toolCallId: 'review-running',
  toolName: 'run_terminal_command',
  title: 'Execute `pnpm test`',
  toolMetadata: {
    kind: 'execute',
    locations: [],
    _meta: { 'x.ai/tool': { label: 'Run Command' } },
  },
  state: 'input-available',
  input: { command: 'pnpm test', description: 'Run the test suite' },
}

const FAILED: DynamicToolUIPart = {
  type: 'dynamic-tool',
  toolCallId: 'review-failed',
  toolName: 'read_file',
  title: 'Read `README.md`',
  toolMetadata: {
    kind: 'read',
    locations: [{ path: 'README.md' }],
    _meta: { 'x.ai/tool': { label: 'Read' } },
  },
  state: 'output-error',
  input: { target_file: 'README.md', limit: 5 },
  errorText: 'Failed to read file: README.md, IO Error: path is outside the conversation directory',
}

const call = (part: DynamicToolUIPart): ToolCall => toolCall(part)
const GROUP = [call(RAN), call(SEARCHED), call(READ), call(EDITED)]

/** What the screen showed before: the projector wrapper, dumped as JSON. */
const BEFORE_PARAMETERS = JSON.stringify(
  {
    value: null,
    title: 'Execute `pnpm deploy`',
    kind: 'execute',
    locations: [],
    _meta: { 'x.ai/tool': { version: 1, name: 'run_terminal_command', kind: 'execute' } },
  },
  null,
  2,
)

function ReviewBoard() {
  return (
    <Board
      title="Tool rendering — review"
      summary="The 2026-08-31 redesign, next to what it replaced. Rows are verb lines; a tap opens a sheet on a phone and unfolds in place on a desktop; no JSON anywhere."
    >
      <Section
        title="Before — reproduction"
        note="Deleted code, rebuilt here for the comparison only. Every call opened in place and dumped the projector wrapper as a Parameters JSON block."
      >
        <Specimen label="Parameters block (was under every call)" stack wide>
          <TitledCodeBlock code={BEFORE_PARAMETERS} language="json" title="Parameters" />
        </Specimen>
      </Section>

      <Section
        title="After — collapsed lines"
        note="What sits between two paragraphs of the answer. Muted verb, bright mono subject, counts only when a file changed."
      >
        <Specimen
          label="Command"
          note="The description, not the command: `Ran Show working tree status`."
          stack
        >
          <ToolCallRow call={call(RAN)} />
        </Specimen>
        <Specimen label="Edit" note="Basename and counts on the line." stack>
          <ToolCallRow call={call(EDITED)} />
        </Specimen>
        <Specimen label="Search and read" stack>
          <ToolCallRow call={call(SEARCHED)} />
          <ToolCallRow call={call(READ)} />
        </Specimen>
        <Specimen label="Running" note="The dot moves while the call does." stack>
          <ToolCallRow call={call(RUNNING)} />
        </Specimen>
        <Specimen label="Failed" stack>
          <ToolCallRow call={call(FAILED)} />
        </Specimen>
        <Specimen
          label="Folded run"
          note="Several settled calls in one line, with the run's total counts."
          stack
        >
          <ToolRun calls={GROUP} settled />
        </Specimen>
      </Section>

      <Section
        title="After — the sheet"
        note="The body a phone tap opens, shown inline for review. The list slides to a call's detail; back returns."
      >
        <Specimen label="Run sheet, list state" stack wide>
          {/* A Drawer root only for context: the sheet body renders inline for review. */}
          <Drawer open onOpenChange={() => undefined}>
            <div className="rounded-xl border bg-popover py-3">
              <RunSheetBody calls={GROUP} summary="Ran 1 command, searched, read and edited" />
            </div>
          </Drawer>
        </Specimen>
      </Section>

      <Section
        title="After — detail per tool"
        note="At most two labeled fields. Command/Output, Pattern/Output, File and the diff, the numbered file for a read."
      >
        <Specimen label="Command" stack wide>
          <ToolDetail call={call(RAN)} />
        </Specimen>
        <Specimen label="Search" stack wide>
          <ToolDetail call={call(SEARCHED)} />
        </Specimen>
        <Specimen label="Read" note="The filename is the header; no labels." stack wide>
          <ToolDetail call={call(READ)} />
        </Specimen>
        <Specimen label="Edit" note="File, then the diff: numbered, tinted, gutter bar." stack wide>
          <ToolDetail call={call(EDITED)} />
        </Specimen>
        <Specimen
          label="Edit, inline (desktop)"
          note="The diff card is the whole detail: full path as its header, no File field."
          stack
          wide
        >
          <ToolDetail call={call(EDITED)} variant="inline" />
        </Specimen>
        <Specimen
          label="Command, inline (desktop)"
          note="A `$` pill and borderless output on its own surface."
          stack
          wide
        >
          <ToolDetail call={call(RAN)} variant="inline" />
        </Specimen>
        <Specimen
          label="Unknown tool"
          note="Grok's label names the sheet; machine output stays JSON behind Prettify."
          stack
          wide
        >
          <ToolDetail call={call(SUBAGENT)} />
        </Specimen>
        <Specimen label="Failed" stack wide>
          <ToolDetail call={call(FAILED)} />
        </Specimen>
      </Section>

      <Section title="After — diff block alone" note="The one diff rendering, used everywhere.">
        <Specimen label="Span diff" stack wide>
          <SpanDiffBlock diff={stopHookDiff} named />
        </Specimen>
      </Section>
    </Board>
  )
}

const meta = {
  title: 'Design System/AI/Tool rendering review',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const Review: Story = { render: () => <ReviewBoard /> }
