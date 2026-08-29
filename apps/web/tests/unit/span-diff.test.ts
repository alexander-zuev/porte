import { fileName, spanDiff } from '@web/features/conversation/models/span-diff.ts'
import { describe, expect, it } from 'vitest'

describe('spanDiff', () => {
  it('writes old lines out and new lines in, with the hunk Grok located', () => {
    expect(
      spanDiff({
        type: 'diff',
        path: '/repo/hello.txt',
        oldText: 'hello',
        newText: 'hello world',
        _meta: { old_line: 1, new_line: 1 },
      }),
    ).toBe('@@ -1,1 +1,1 @@\n-hello\n+hello world')
  })

  it('has no old lines for a created file, and no hunk without a position', () => {
    expect(spanDiff({ type: 'diff', path: '/repo/notes.md', oldText: '', newText: 'spike\n' })).toBe(
      '+spike',
    )
  })

  it('treats a null old text like an empty one', () => {
    expect(spanDiff({ type: 'diff', path: '/repo/a', oldText: null, newText: 'a\nb' })).toBe(
      '+a\n+b',
    )
  })
})

describe('fileName', () => {
  it('is the last segment', () => {
    expect(fileName('/Users/az/repo/src/relay.ts')).toBe('relay.ts')
    expect(fileName('relay.ts')).toBe('relay.ts')
  })
})
