import {
  PendingPermissionSchema,
  type ConversationCommand,
  type ConversationLiveState,
  type ConversationPlan,
  type ConversationUsage,
  type PlanEntry,
} from '@porte/core/client'
import type { ConversationCommands } from '@web/features/conversation/hooks/use-conversation-commands.ts'
import type { SpanDiff } from '@web/features/conversation/models/span-diff.ts'
import type { DynamicToolUIPart, UIMessage } from 'ai'

/**
 * One Grok session in the porte repo, cut into the slices a story needs.
 *
 * Every part is written the way the socket delivers it: Grok's own tool names,
 * its titles (`Execute \`…\``, `Edit \`/abs/path\``, a search titled by its
 * pattern), `1→` line-numbered read results, span diffs with `old_line`, and
 * the exact wording of a failed edit. The shapes were copied from
 * `~/.grok/sessions` captures, so what a story shows is what the screen gets.
 *
 * The session: the reader asks for Stop to be wired to the Host's cancel
 * command, Grok reads and edits its way there, then is asked to run the tests
 * and commit. Nothing is generated at render time, so screenshots compare.
 */

const REPO = '/Users/az/projects/porte'
const STOP_HOOK = `${REPO}/apps/web/src/features/conversation/hooks/use-stop-turn.ts`
const AGENT = `${REPO}/apps/web/src/server/infrastructure/durable-objects/conversation-agent.ts`
const CHAT = `${REPO}/apps/web/src/features/conversation/components/conversation-chat.tsx`

/** A read that answered, the way Grok reports one: the lines it read, numbered. */
function readFile(id: string, path: string, lines: readonly string[], from = 1): DynamicToolUIPart {
  const name = path.slice(path.lastIndexOf('/') + 1)
  return {
    type: 'dynamic-tool',
    toolCallId: id,
    toolName: 'read_file',
    title: `Read \`${name}\``,
    toolMetadata: { kind: 'read', locations: [{ path, line: from }] },
    state: 'output-available',
    input: { target_file: path, ...(from === 1 ? {} : { offset: from }), limit: 120 },
    output: {
      content: [
        {
          type: 'content',
          content: {
            type: 'text',
            text: lines.map((line, index) => `${String(from + index)}→${line}`).join('\n'),
          },
        },
      ],
      rawOutput: null,
    },
  }
}

/** A search. Grok titles it with the pattern itself. */
function grep(
  id: string,
  pattern: string,
  glob: string,
  hits: readonly string[],
): DynamicToolUIPart {
  return {
    type: 'dynamic-tool',
    toolCallId: id,
    toolName: 'grep',
    title: pattern,
    toolMetadata: { kind: 'search', locations: [] },
    state: 'output-available',
    input: { pattern, glob },
    output: {
      content: [{ type: 'content', content: { type: 'text', text: hits.join('\n') } }],
      rawOutput: null,
    },
  }
}

/** The replaced span, as Grok reports an edit. */
function span(path: string, oldText: string, newText: string, line: number): SpanDiff {
  return { type: 'diff', path, oldText, newText, _meta: { old_line: line, new_line: line } }
}

/** An edit that landed. */
function edit(id: string, diff: SpanDiff): DynamicToolUIPart {
  return {
    type: 'dynamic-tool',
    toolCallId: id,
    toolName: 'search_replace',
    title: `Edit \`${diff.path}\``,
    toolMetadata: { kind: 'edit', locations: [{ path: diff.path }] },
    state: 'output-available',
    input: { file_path: diff.path, old_string: diff.oldText, new_string: diff.newText },
    output: { content: [diff], rawOutput: null },
  }
}

/** A command that ran to the end. */
function run(id: string, command: string, description: string, output: string): DynamicToolUIPart {
  return {
    type: 'dynamic-tool',
    toolCallId: id,
    toolName: 'run_terminal_command',
    title: `Execute \`${command}\``,
    toolMetadata: { kind: 'execute', locations: [] },
    state: 'output-available',
    input: { command, description },
    output: {
      content: [{ type: 'content', content: { type: 'text', text: output } }],
      rawOutput: null,
    },
  }
}

const SVG_PHOTO = (fill: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 3"><rect width="4" height="3" fill="${fill}"/></svg>`,
  )}`

// ---------------------------------------------------------------------------
// Turn 1: wire Stop to the Host

/** The prompt that opens the session, with two screenshots and a log from the phone. */
export const askStop: UIMessage = {
  id: 'msg-ask-stop',
  role: 'user',
  parts: [
    {
      type: 'file',
      mediaType: 'image/svg+xml',
      filename: 'IMG_4821.png',
      url: SVG_PHOTO('#2f6f9f'),
    },
    {
      type: 'file',
      mediaType: 'image/svg+xml',
      filename: 'IMG_4822.png',
      url: SVG_PHOTO('#8f5f2f'),
    },
    {
      type: 'file',
      mediaType: 'text/plain',
      filename: 'wrangler-tail.log',
      url: 'data:text/plain;base64,dHVybi5zdGFydGVkIDAxYTA0YjJhCg==',
    },
    {
      type: 'text',
      text: 'Stop still calls `chat.stop()` after the turn redesign, so the Mac keeps running. Wire it to the Host cancel command, and make sure a reload mid-turn still shows Stop.',
    },
  ],
}

const STOP_HOOK_LINES = [
  "import { useMutation } from '@tanstack/react-query'",
  '',
  '/** Stop the running turn. */',
  'export function useStopTurn(chat: { stop: () => void }) {',
  '  return { onStop: () => chat.stop(), stopping: false }',
  '}',
]

const OLD_STOP = `export function useStopTurn(chat: { stop: () => void }) {
  return { onStop: () => chat.stop(), stopping: false }
}`

const NEW_STOP = `export function useStopTurn(stub: ConversationAgentStub, turnId: TurnId | undefined) {
  const cancel = useMutation({ mutationFn: (id: TurnId) => stub.cancelTurn({ turnId: id }) })
  return {
    onStop: () => {
      if (turnId !== undefined) cancel.mutate(turnId)
    },
    stopping: cancel.isPending,
  }
}`

/** The edit the first turn is about. Exported so the parts board can show the diff alone. */
export const stopHookDiff = span(STOP_HOOK, OLD_STOP, NEW_STOP, 4)

/** The first answer: a thought with its reads inside, a failed edit, then the edit that landed. */
export const answerStop: UIMessage = {
  id: 'msg-answer-stop',
  role: 'assistant',
  parts: [
    {
      type: 'reasoning',
      text: 'Stop goes through the AI SDK, which only closes the browser stream. The Host owns the turn, so the button has to send the cancel command over the stub and read `runningTurnId` from live state. Let me see what calls `chat.stop()` today and what the stub exposes.',
      state: 'done',
    },
    grep('call-grep-stop', 'chat\\.stop|cancelTurn', '*.{ts,tsx}', [
      `${STOP_HOOK}:5:  return { onStop: () => chat.stop(), stopping: false }`,
      `${AGENT}:212:  async cancelTurn(input: { turnId: TurnId }): Promise<void> {`,
      `${CHAT}:58:  const stop = useStopTurn(chat)`,
    ]),
    readFile('call-read-stop', STOP_HOOK, STOP_HOOK_LINES),
    readFile(
      'call-read-agent',
      AGENT,
      [
        '  /** Ask the Host to stop the running turn. Idempotent: a finished turn is a no-op. */',
        '  async cancelTurn(input: { turnId: TurnId }): Promise<void> {',
        "    await this.host.send({ type: 'cancel-turn', turnId: input.turnId })",
        '  }',
      ],
      211,
    ),
    {
      type: 'text',
      text: 'The stub already has `cancelTurn`, so the hook only needs the stub and the running turn id instead of the SDK chat. Editing the hook.',
      state: 'done',
    },
    {
      type: 'dynamic-tool',
      toolCallId: 'call-edit-stop-stale',
      toolName: 'search_replace',
      title: `Edit \`${STOP_HOOK}\``,
      toolMetadata: { kind: 'edit', locations: [{ path: STOP_HOOK }] },
      state: 'output-error',
      input: {
        file_path: STOP_HOOK,
        old_string: 'return { onStop: () => chat.stop() }',
        new_string: NEW_STOP,
      },
      errorText:
        'The string to replace was not found in the file, use the read_file tool to see the correct string. The user may have changed the file since you last read it.\n\nNearest match: line 5:   return { onStop: () => chat.stop(), stopping: false }',
    },
    {
      type: 'text',
      text: 'The file has a `stopping` flag I missed. Matching the whole function this time.',
      state: 'done',
    },
    edit('call-edit-stop', stopHookDiff),
    edit(
      'call-edit-chat',
      span(
        CHAT,
        '  const stop = useStopTurn(chat)',
        '  const stop = useStopTurn(agent.stub, state.runningTurnId)',
        58,
      ),
    ),
    run(
      'call-typecheck',
      'pnpm --filter @porte/web typecheck',
      'Check the web app types after the hook change',
      '> @porte/web@0.1.0 typecheck\n> tsc --noEmit\n',
    ),
    {
      type: 'source-url',
      sourceId: 'src-acp-cancel',
      url: 'https://agentclientprotocol.com/protocol/prompt-turn#cancellation',
      title: 'ACP: cancelling a prompt turn',
    },
    {
      type: 'text',
      text: [
        'Stop now sends the Host cancel command instead of closing the browser stream.',
        '',
        '**What changed**',
        '',
        '- `useStopTurn` takes the agent stub and `state.runningTurnId`, and calls `stub.cancelTurn` through a mutation.',
        '- `stopping` is the mutation\'s pending flag, so the placeholder reads "Stopping…" until the Host confirms.',
        '- A reload mid-turn still shows Stop, because `runningTurnId` comes from live state, not from the SDK stream.',
        '',
        '```ts',
        'const stop = useStopTurn(agent.stub, state.runningTurnId)',
        '// …',
        '<PromptInputSubmit status={status} onStop={stop.onStop} />',
        '```',
        '',
        'Per the ACP spec the agent answers a cancelled turn with `stopReason: "cancelled"`, and `turn-policy.ts` already maps that to a settled turn. Typecheck is clean.',
      ].join('\n'),
      state: 'done',
    },
  ],
}

// ---------------------------------------------------------------------------
// Turn 2: run the tests and commit, at every point between sent and done

export const askTests: UIMessage = {
  id: 'msg-ask-tests',
  role: 'user',
  parts: [{ type: 'text', text: 'Run the web integration tests and commit if they pass.' }],
}

const TESTS_THOUGHT =
  'The integration project needs the Host running; `pnpm dev up` is already listening on 4100, so the suite can go straight away. Commit only the two files this turn touched.'

const TEST_COMMAND = 'pnpm --filter @porte/web test:integration'

/** The prompt is on the Mac and the first token has not come back. */
export const answerTestsThinking: UIMessage = {
  id: 'msg-answer-tests',
  role: 'assistant',
  parts: [{ type: 'reasoning', text: TESTS_THOUGHT.slice(0, 96), state: 'streaming' }],
}

/** The thought is done and the tests are running. */
export const answerTestsRunning: UIMessage = {
  id: 'msg-answer-tests',
  role: 'assistant',
  parts: [
    { type: 'reasoning', text: TESTS_THOUGHT, state: 'done' },
    {
      type: 'dynamic-tool',
      toolCallId: 'call-test-run',
      toolName: 'run_terminal_command',
      title: `Execute \`${TEST_COMMAND}\``,
      toolMetadata: { kind: 'execute', locations: [] },
      state: 'input-available',
      input: { command: TEST_COMMAND, description: 'Run the web integration suite' },
    },
  ],
}

const TEST_OUTPUT = [
  ' ✓ tests/integration/conversation-agent.test.ts (9 tests) 4218ms',
  ' ✓ tests/integration/host-relay.test.ts (6 tests) 1902ms',
  '',
  ' Test Files  2 passed (2)',
  '      Tests  15 passed (15)',
].join('\n')

/** The tests passed and the answer is being written. */
export const answerTestsStreaming: UIMessage = {
  id: 'msg-answer-tests',
  role: 'assistant',
  parts: [
    { type: 'reasoning', text: TESTS_THOUGHT, state: 'done' },
    run('call-test-run', TEST_COMMAND, 'Run the web integration suite', TEST_OUTPUT),
    {
      type: 'text',
      text: '15 tests pass, including the two that cover a reload mid-turn. Committing the hook and the chat component as',
      state: 'streaming',
    },
  ],
}

/** The turn is over: tests, commit, and the line that says so. */
export const answerTestsDone: UIMessage = {
  id: 'msg-answer-tests',
  role: 'assistant',
  parts: [
    { type: 'reasoning', text: TESTS_THOUGHT, state: 'done' },
    run('call-test-run', TEST_COMMAND, 'Run the web integration suite', TEST_OUTPUT),
    run(
      'call-commit',
      'git add apps/web/src/features/conversation/hooks/use-stop-turn.ts apps/web/src/features/conversation/components/conversation-chat.tsx && git commit -m "fix: stop sends the host cancel command"',
      'Commit the two files from this turn',
      '[main 9c1e4f2] fix: stop sends the host cancel command\n 2 files changed, 11 insertions(+), 3 deletions(-)',
    ),
    {
      type: 'text',
      text: '15 tests pass, including the two that cover a reload mid-turn. Committed as `9c1e4f2` — `fix: stop sends the host cancel command`.',
      state: 'done',
    },
  ],
}

/** The Mac closed the socket while the answer was being written. */
export const answerTestsInterrupted: UIMessage = {
  id: 'msg-answer-tests',
  role: 'assistant',
  parts: [
    { type: 'reasoning', text: TESTS_THOUGHT, state: 'done' },
    run('call-test-run', TEST_COMMAND, 'Run the web integration suite', TEST_OUTPUT),
    {
      type: 'text',
      text: '15 tests pass, including the two that cover a reload',
      state: 'streaming',
    },
  ],
}

// ---------------------------------------------------------------------------
// Earlier in the session, read back on request

/** The turn before `askStop`, fetched when the reader asks for earlier messages. */
export const olderTurns: readonly UIMessage[] = [
  {
    id: 'msg-ask-older',
    role: 'user',
    parts: [{ type: 'text', text: 'What is left of the turn redesign after step 3?' }],
  },
  {
    id: 'msg-answer-older',
    role: 'assistant',
    parts: [
      readFile('older-read-doc', `${REPO}/docs/turn-stream-interrupt-review.md`, [
        '# Turn, stream, interrupt: first-principles review',
        '',
        'Scope: send a message → see the stream → reload → see the stream; interrupt a turn.',
      ]),
      run(
        'older-git',
        'git log --oneline origin/main..HEAD',
        'List unpushed commits',
        '9b2b97a feat(relay): ordered projection with host-wins reconcile\nb397892 fix: green design suite',
      ),
      {
        type: 'text',
        text: 'Steps 0–2 are on `main`. Step 3 (relay `seq`, snapshot reconcile) is in the working tree. Step 4 is still skeletons: Stop calls `chat.stop()`, and the composer reads `state.commands`, which live state no longer carries.',
        state: 'done',
      },
    ],
  },
]

// ---------------------------------------------------------------------------
// Transcripts

/** The session as a returning reader opens it: two finished turns. */
export const session: readonly UIMessage[] = [askStop, answerStop, askTests, answerTestsDone]

// ---------------------------------------------------------------------------
// Live state

const PLAN_ENTRIES: readonly PlanEntry[] = [
  { content: 'Read the stop hook and the agent stub', status: 'completed', priority: 'high' },
  { content: 'Send cancel-turn through the stub', status: 'completed', priority: 'high' },
  { content: 'Run the web integration suite', status: 'in_progress', priority: 'medium' },
  { content: 'Commit the two files', status: 'pending', priority: 'medium' },
]

export const itemsPlan: ConversationPlan = {
  type: 'items',
  planId: 'plan-stop',
  entries: [...PLAN_ENTRIES],
}

/** The same steps, all behind it. */
export const donePlan: ConversationPlan = {
  type: 'items',
  planId: 'plan-stop-done',
  entries: PLAN_ENTRIES.map((entry) => ({ ...entry, status: 'completed' })),
}

export const markdownPlan: ConversationPlan = {
  type: 'markdown',
  planId: 'plan-markdown',
  content:
    '1. Read `use-stop-turn.ts` and the agent stub\n2. Replace `chat.stop()` with `stub.cancelTurn`\n3. Run the integration suite\n4. Commit',
}

export const filePlan: ConversationPlan = {
  type: 'file',
  planId: 'plan-file',
  uri: `file://${REPO}/docs/turn-stream-interrupt-review.md`,
}

export const usage: ConversationUsage = {
  usedTokens: 62_000,
  sizeTokens: 200_000,
  cost: { amount: 1.84, currency: 'USD' },
}

/** The command Grok is stopped on: the commit needs a yes. */
export const commitPermission = PendingPermissionSchema.parse({
  turnId: '01a04b2a-ca04-74e2-9cae-188cb64987cf',
  permissionId: '01a04b2a-ca04-74e2-9cae-188cb6498701',
  toolCallId: 'call-commit',
  title: 'Run `git commit -m "fix: stop sends the host cancel command"` in porte',
  options: [
    { optionId: 'allow', name: 'Allow once', kind: 'allow_once' },
    { optionId: 'always', name: 'Always allow', kind: 'allow_always' },
    { optionId: 'reject', name: 'Reject', kind: 'reject_once' },
  ],
})

/** A second question in the same turn, so two can block at once. */
export const writeFilePermission = PendingPermissionSchema.parse({
  turnId: '01a04b2a-ca04-74e2-9cae-188cb64987cf',
  permissionId: '01a04b2a-ca04-74e2-9cae-188cb6498702',
  toolCallId: 'call-edit-chat',
  title: 'Write `apps/web/src/features/conversation/components/conversation-chat.tsx`',
  options: [
    { optionId: 'allow', name: 'Allow once', kind: 'allow_once' },
    { optionId: 'reject', name: 'Reject', kind: 'reject_once' },
  ],
})

/** A conversation that has reported everything it can. */
export const relayState: ConversationLiveState = {
  plans: [itemsPlan],
  pending: { permissions: [], elicitations: [] },
  usage,
  configuration: [
    {
      type: 'select',
      id: 'model',
      name: 'Model',
      currentValue: 'grok-4.6',
      options: [
        { type: 'option', value: 'grok-4.6', name: 'Grok 4.6' },
        { type: 'option', value: 'grok-code', name: 'Grok Code' },
      ],
    },
  ],
  modeId: 'auto',
}

/** A conversation that has reported nothing yet. */
export const emptyRelayState: ConversationLiveState = {
  plans: [],
  pending: { permissions: [], elicitations: [] },
}

/** The Host's command list, read once when the `+` menu opens. Grok's real list is ~100 KB. */
const COMMAND_LIST: readonly ConversationCommand[] = [
  { name: 'review', description: 'Review the current changes' },
  { name: 'test', description: 'Run the test suite' },
  { name: 'commit', description: 'Commit staged changes' },
  { name: 'compact', description: 'Compact the conversation' },
  { name: 'resume-claude', description: 'Continue from a recent Claude Code session' },
]

export const commandsReady: ConversationCommands = { status: 'ready', commands: COMMAND_LIST }
export const commandsPending: ConversationCommands = { status: 'pending' }
export const commandsFailed: ConversationCommands = { status: 'failed', onRetry: () => undefined }
