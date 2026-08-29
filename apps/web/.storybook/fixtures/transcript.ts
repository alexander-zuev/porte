import {
  PendingPermissionSchema,
  type ConversationPlan,
  type ConversationLiveState,
  type ConversationUsage,
  type PlanEntry,
} from '@porte/core/client'
import type { UIMessage } from 'ai'

/**
 * One transcript, in every shape the chat can hold.
 *
 * Parts are written as the AI SDK stores them, so a story renders the same
 * objects the socket would deliver. Nothing here is generated: a fixed
 * transcript keeps every screenshot comparable between runs.
 */

/** A short answer with nothing else attached. */
export const plainAnswer: UIMessage = {
  id: 'msg-plain',
  role: 'assistant',
  parts: [
    {
      type: 'text',
      text: 'The relay reconnects, but the frames queued during the deploy are never replayed.',
      state: 'done',
    },
  ],
}

export const askRelay: UIMessage = {
  id: 'msg-ask-relay',
  role: 'user',
  parts: [{ type: 'text', text: 'The relay drops frames after every deploy. Find out why.' }],
}

/** Reasoning, one tool call, then the written answer. */
export const answerRelay: UIMessage = {
  id: 'msg-answer-relay',
  role: 'assistant',
  parts: [
    {
      type: 'reasoning',
      text: 'The socket closes on deploy, so the queue lives in the Durable Object. Check whether the queue is read before the first frame of the new turn.',
      state: 'done',
    },
    {
      type: 'dynamic-tool',
      toolCallId: 'call-read-relay',
      toolName: 'read_file',
      title: 'Read `conversation-relay-state.ts`',
      toolMetadata: {
        kind: 'read',
        locations: [
          { path: '/Users/az/projects/porte/packages/core/src/relay/conversation-relay-state.ts' },
        ],
      },
      state: 'output-available',
      input: { path: 'packages/core/src/relay/conversation-relay-state.ts', limit: 120 },
      output: {
        content: [
          {
            type: 'content',
            content: {
              type: 'text',
              text: 'Read 120 lines from `conversation-relay-state.ts`.',
            },
          },
        ],
        rawOutput: null,
      },
    },
    {
      type: 'text',
      text: [
        'The queue is drained **before** the new socket is registered, so the first frames go nowhere.',
        '',
        '```ts',
        'relay.register(socket)',
        'relay.drain()',
        '```',
        '',
        'Swapping the two lines fixes the gap.',
      ].join('\n'),
      state: 'done',
    },
  ],
}

/** The prompt that starts the next turn. */
export const askFollowUp: UIMessage = {
  id: 'msg-ask-follow-up',
  role: 'user',
  parts: [{ type: 'text', text: 'Swap the two lines and run the core tests.' }],
}

/** A turn still being written: reasoning open, text half-finished. */
export const answerStreaming: UIMessage = {
  id: 'msg-streaming',
  role: 'assistant',
  parts: [
    {
      type: 'reasoning',
      text: 'Both call sites register the socket after the drain. Checking whether the test covers the ordering',
      state: 'streaming',
    },
    {
      type: 'text',
      text: 'The ordering is the whole bug. The test only asserts the queue empties, so it passes either',
      state: 'streaming',
    },
  ],
}

/** A tool call that has not answered yet. */
export const toolRunning: UIMessage = {
  id: 'msg-tool-running',
  role: 'assistant',
  parts: [
    {
      type: 'dynamic-tool',
      toolCallId: 'call-run-tests',
      toolName: 'run_command',
      title: 'Run `pnpm test --filter @porte/core`',
      toolMetadata: { kind: 'execute', locations: [] },
      state: 'input-available',
      input: { command: 'pnpm test --filter @porte/core', cwd: '/Users/az/projects/porte' },
    },
  ],
}

/** A tool call that failed, with the error the Mac reported. */
export const toolFailed: UIMessage = {
  id: 'msg-tool-failed',
  role: 'assistant',
  parts: [
    {
      type: 'dynamic-tool',
      toolCallId: 'call-failed',
      toolName: 'run_command',
      title: 'Run `pnpm typecheck`',
      toolMetadata: { kind: 'execute', locations: [] },
      state: 'output-error',
      input: { command: 'pnpm typecheck', cwd: '/Users/az/projects/porte' },
      errorText: 'Command failed with exit code 2: 4 type errors in apps/web.',
    },
  ],
}

/** A tool call that edited a file. The diff is the replaced span, as Grok sends it. */
export const toolDiff: UIMessage = {
  id: 'msg-tool-diff',
  role: 'assistant',
  parts: [
    {
      type: 'dynamic-tool',
      toolCallId: 'call-edit',
      toolName: 'search_replace',
      title: 'Edit `relay.ts`',
      toolMetadata: {
        kind: 'edit',
        locations: [{ path: '/Users/az/projects/porte/packages/core/src/relay/relay.ts' }],
      },
      state: 'output-available',
      input: {
        path: 'packages/core/src/relay/relay.ts',
        old_string: 'relay.drain()\nrelay.register(socket)',
        new_string: 'relay.register(socket)\nrelay.drain()',
      },
      output: {
        content: [
          {
            type: 'diff',
            path: '/Users/az/projects/porte/packages/core/src/relay/relay.ts',
            oldText: 'relay.drain()\nrelay.register(socket)',
            newText: 'relay.register(socket)\nrelay.drain()',
            _meta: { old_line: 41, new_line: 41 },
          },
        ],
        rawOutput: null,
      },
    },
  ],
}

/** A user turn that carries a file. */
export const askWithFile: UIMessage = {
  id: 'msg-ask-file',
  role: 'user',
  parts: [
    { type: 'text', text: 'Here is the log from the deploy that dropped them.' },
    {
      type: 'file',
      mediaType: 'text/plain',
      filename: 'relay-deploy.log',
      url: 'data:text/plain;base64,cmVsYXk6IHNvY2tldCBjbG9zZWQ=',
    },
    {
      type: 'file',
      mediaType: 'image/svg+xml',
      filename: 'dashboard.svg',
      url: `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 3"><rect width="4" height="3" fill="#2f6f9f"/></svg>')}`,
    },
    {
      type: 'file',
      mediaType: 'image/svg+xml',
      filename: 'logs.svg',
      url: `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 3"><rect width="4" height="3" fill="#8f5f2f"/></svg>')}`,
    },
  ],
}

/** An answer that cites what it read. */
export const answerWithSources: UIMessage = {
  id: 'msg-sources',
  role: 'assistant',
  parts: [
    {
      type: 'source-url',
      sourceId: 'src-do',
      url: 'https://developers.cloudflare.com/durable-objects/',
      title: 'Durable Objects',
    },
    {
      type: 'source-url',
      sourceId: 'src-ws',
      url: 'https://developers.cloudflare.com/durable-objects/best-practices/websockets/',
      title: 'WebSockets in Durable Objects',
    },
    {
      type: 'text',
      text: 'Hibernation drops the in-memory queue, which is why the frames only survive in storage.',
      state: 'done',
    },
  ],
}

/** A finished turn that read, edited, and ran: the calls fold to one line, the answer stays. */
export const toolRunDone: UIMessage = {
  id: 'msg-tool-run-done',
  role: 'assistant',
  parts: [
    {
      type: 'dynamic-tool',
      toolCallId: 'run-read-relay',
      toolName: 'read_file',
      title: 'Read `relay.ts`',
      toolMetadata: {
        kind: 'read',
        locations: [{ path: '/Users/az/projects/porte/packages/core/src/relay/relay.ts' }],
      },
      state: 'output-available',
      input: { path: 'packages/core/src/relay/relay.ts' },
      output: {
        content: [
          {
            type: 'content',
            content: { type: 'text', text: 'Read 88 lines from `relay.ts`.' },
          },
        ],
        rawOutput: null,
      },
    },
    {
      type: 'dynamic-tool',
      toolCallId: 'run-read-test',
      toolName: 'read_file',
      title: 'Read `relay.test.ts`',
      toolMetadata: {
        kind: 'read',
        locations: [{ path: '/Users/az/projects/porte/packages/core/tests/relay.test.ts' }],
      },
      state: 'output-available',
      input: { path: 'packages/core/tests/relay.test.ts' },
      output: {
        content: [
          {
            type: 'content',
            content: { type: 'text', text: 'Read 40 lines from `relay.test.ts`.' },
          },
        ],
        rawOutput: null,
      },
    },
    {
      type: 'dynamic-tool',
      toolCallId: 'run-edit-relay',
      toolName: 'search_replace',
      title: 'Edit `relay.ts`',
      toolMetadata: {
        kind: 'edit',
        locations: [{ path: '/Users/az/projects/porte/packages/core/src/relay/relay.ts' }],
      },
      state: 'output-available',
      input: {
        path: 'packages/core/src/relay/relay.ts',
        old_string: 'relay.drain()\nrelay.register(socket)',
        new_string: 'relay.register(socket)\nrelay.drain()',
      },
      output: {
        content: [
          {
            type: 'diff',
            path: '/Users/az/projects/porte/packages/core/src/relay/relay.ts',
            oldText: 'relay.drain()\nrelay.register(socket)',
            newText: 'relay.register(socket)\nrelay.drain()',
            _meta: { old_line: 41, new_line: 41 },
          },
        ],
        rawOutput: null,
      },
    },
    {
      type: 'dynamic-tool',
      toolCallId: 'run-test',
      toolName: 'run_command',
      title: 'Run `pnpm test --filter @porte/core`',
      toolMetadata: { kind: 'execute', locations: [] },
      state: 'output-available',
      input: { command: 'pnpm test --filter @porte/core', cwd: '/Users/az/projects/porte' },
      output: {
        content: [
          {
            type: 'content',
            content: { type: 'text', text: 'Test Files  3 passed (3)\nTests  12 passed (12)' },
          },
        ],
        rawOutput: null,
      },
    },
    {
      type: 'text',
      text: 'Swapped the two lines. The relay tests pass.',
      state: 'done',
    },
  ],
}

/** The transcript a returning reader opens. */
export const transcript: readonly UIMessage[] = [
  askRelay,
  answerRelay,
  askWithFile,
  answerWithSources,
]

/** Long enough to scroll, so the scroll-to-bottom control has something to do. */
export const longTranscript: readonly UIMessage[] = [
  ...transcript,
  ...transcript.map((message, index) => ({
    ...message,
    id: `${message.id}-again-${String(index)}`,
  })),
  toolDiff,
  toolFailed,
]

const PLAN_ENTRIES: readonly PlanEntry[] = [
  { content: 'Read the relay state reducer', status: 'completed', priority: 'high' },
  { content: 'Find where the queue is drained', status: 'in_progress', priority: 'high' },
  { content: 'Cover the ordering with a test', status: 'pending', priority: 'medium' },
]

export const itemsPlan: ConversationPlan = {
  type: 'items',
  planId: 'plan-relay',
  entries: [...PLAN_ENTRIES],
}

/** The same three steps, all behind it. */
export const donePlan: ConversationPlan = {
  type: 'items',
  planId: 'plan-done',
  entries: PLAN_ENTRIES.map((entry) => ({ ...entry, status: 'completed' })),
}

export const markdownPlan: ConversationPlan = {
  type: 'markdown',
  planId: 'plan-markdown',
  content: '1. Register the socket\n2. Drain the queue\n3. Assert the order in a test',
}

export const filePlan: ConversationPlan = {
  type: 'file',
  planId: 'plan-file',
  uri: 'file:///Users/az/projects/porte/docs/relay-plan.md',
}

export const usage: ConversationUsage = {
  usedTokens: 62_000,
  sizeTokens: 200_000,
  cost: { amount: 1.84, currency: 'USD' },
}

/** The command the agent is stopped on. */
export const runTestsPermission = PendingPermissionSchema.parse({
  turnId: '01a01e5d-e64c-76e2-9c93-ca6958000200',
  permissionId: '01a01e5d-e64c-76e2-9c93-ca6958000201',
  toolCallId: 'call-run-tests',
  title: 'Run `pnpm test --filter @porte/core` in porte',
  options: [
    { optionId: 'allow', name: 'Allow once', kind: 'allow_once' },
    { optionId: 'always', name: 'Always allow', kind: 'allow_always' },
    { optionId: 'reject', name: 'Reject', kind: 'reject_once' },
  ],
})

/** A second request, to show two blocking questions at once. */
export const writeFilePermission = PendingPermissionSchema.parse({
  turnId: '01a01e5d-e64c-76e2-9c93-ca6958000200',
  permissionId: '01a01e5d-e64c-76e2-9c93-ca6958000202',
  toolCallId: 'call-edit',
  title: 'Write `packages/core/src/relay/relay.ts`',
  options: [
    { optionId: 'allow', name: 'Allow once', kind: 'allow_once' },
    { optionId: 'reject', name: 'Reject', kind: 'reject_once' },
  ],
})

/** The relay state of a conversation that has reported everything it can. */
export const relayState: ConversationLiveState = {
  plans: [itemsPlan],
  pending: { permissions: [], elicitations: [] },
  usage,
  configuration: [
    {
      type: 'select',
      id: 'model',
      name: 'Model',
      currentValue: 'grok-code',
      options: [
        { type: 'option', value: 'grok-code', name: 'Grok Code' },
        { type: 'option', value: 'grok-4', name: 'Grok 4' },
      ],
    },
  ],
  modeId: 'code',
}

/** The Host's command list, served by `listCommands`; never part of the live state. */
export const commands = [
  { name: 'review', description: 'Review the current changes' },
  { name: 'test', description: 'Run the test suite' },
]

/** A conversation that has reported nothing yet. */
export const emptyRelayState: ConversationLiveState = {
  plans: [],
  pending: { permissions: [], elicitations: [] },
}
