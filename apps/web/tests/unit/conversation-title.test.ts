import { conversationDisplayTitle } from '@web/entities/conversation/conversation-title.ts'
import { describe, expect, it } from 'vitest'

describe('conversationDisplayTitle', () => {
  it('passes a real title through', () => {
    expect(conversationDisplayTitle('Fix the build')).toBe('Fix the build')
  })

  it('names a blank title New conversation', () => {
    expect(conversationDisplayTitle('  ')).toBe('New conversation')
  })
})
