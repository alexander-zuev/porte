import {
  describeRun,
  groupParts,
  toolCall,
  turnChanges,
} from '@web/features/conversation/models/tool-runs.ts'
import type { DynamicToolUIPart, UIMessage } from 'ai'
import { describe, expect, it } from 'vitest'

type Part = UIMessage['parts'][number]

function call(id: string, kind: string, state: DynamicToolUIPart['state'], extra = {}): Part {
  return {
    type: 'dynamic-tool',
    toolCallId: id,
    toolName: `raw_${id}`,
    title: `Title ${id}`,
    toolMetadata: { kind, locations: [{ path: `/repo/${id}.ts` }] },
    input: {},
    ...(state === 'output-available' ? { output: { content: [] } } : {}),
    state,
    ...extra,
  } as Part
}

const text: Part = { type: 'text', text: 'Done.' }

describe('groupParts', () => {
  it('cuts a message into parts and runs, settled when every call answered', () => {
    const stretches = groupParts([
      text,
      call('a', 'read', 'output-available'),
      call('b', 'edit', 'output-available'),
      text,
      call('c', 'execute', 'input-available'),
    ])
    expect(stretches.map((one) => one.type)).toEqual(['part', 'run', 'part', 'run'])
    expect(stretches[1]).toMatchObject({ settled: true })
    expect(stretches[3]).toMatchObject({ settled: false })
  })
})

describe('groupParts with reasoning', () => {
  it('gives a run to the thought right before it', () => {
    const thought: Part = { type: 'reasoning', text: 'Check the queue first.', state: 'done' }
    const stretches = groupParts([thought, call('a', 'read', 'output-available'), text])
    expect(stretches.map((one) => one.type)).toEqual(['thought', 'part'])
    expect(stretches[0]).toMatchObject({ settled: true })
  })
})

describe('turnChanges', () => {
  it('sums lines over every edit and counts files once', () => {
    const edit = (id: string, path: string) =>
      call(id, 'edit', 'output-available', {
        toolMetadata: { kind: 'edit', locations: [{ path }] },
        output: { content: [{ type: 'diff', path, oldText: 'a', newText: 'a\nb', _meta: {} }] },
      })
    const message: UIMessage = {
      id: 'm',
      role: 'assistant',
      parts: [edit('x', '/r/x.ts'), edit('y', '/r/x.ts'), edit('z', '/r/z.ts')],
    }
    expect(turnChanges(message)).toEqual({ files: 2, added: 6, removed: 3 })
    expect(turnChanges({ id: 'n', role: 'assistant', parts: [text] })).toBeUndefined()
  })
})

describe('toolCall', () => {
  it("reads Grok's title and kind, and counts an edit's lines", () => {
    const one = toolCall(
      call('e', 'edit', 'output-available', {
        output: {
          content: [
            { type: 'diff', path: '/repo/e.ts', oldText: 'a\nb', newText: 'a\nb\nc', _meta: {} },
          ],
        },
      }) as DynamicToolUIPart,
    )
    expect(one).toMatchObject({ kind: 'edit', title: 'Title e', path: '/repo/e.ts' })
    expect(one.change).toEqual({ added: 3, removed: 2 })
  })

  it('falls back to the raw name and "other" without metadata', () => {
    const part = {
      type: 'dynamic-tool',
      toolCallId: 'x',
      toolName: 'mystery',
      state: 'input-available',
      input: {},
    }
    expect(toolCall(part as DynamicToolUIPart)).toMatchObject({ kind: 'other', title: 'mystery' })
  })
})

describe('describeRun', () => {
  it('counts files once per path and words each kind', () => {
    const calls = [
      call('a', 'read', 'output-available'),
      call('a', 'read', 'output-available'),
      call('b', 'edit', 'output-available'),
      call('c', 'execute', 'output-available'),
      call('d', 'search', 'output-available'),
      call('d', 'search', 'output-available'),
    ].map((part) => toolCall(part as DynamicToolUIPart))
    expect(describeRun(calls)).toBe('Edited 1 file, read 1 file, ran 2 searches, ran 1 command')
  })
})
