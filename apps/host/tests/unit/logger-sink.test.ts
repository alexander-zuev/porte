import { createLogger, LogLevel, setLogSink } from '@porte/core/client'
import { describe, expect, it } from 'vitest'

describe('setLogSink', () => {
  it('hands one finished line to the process that owns the stream', () => {
    const lines: string[] = []
    setLogSink((level, line) => {
      lines.push(`${level}|${line}`)
    })

    const log = createLogger('probe', { logLevel: LogLevel.WARN, enabled: true })
    log.debug('below the level')
    log.warn('skipped lines', { skippedLines: 3 })
    log.error('read failed', { error: new Error('boom'), details: { method: 'conversation.read' } })

    setLogSink(() => undefined)

    expect(lines).toHaveLength(2)
    expect(lines[0]).toContain('WARN|')
    expect(lines[0]).toContain('skippedLines')
    expect(lines[1]).toContain('ERROR|')
    expect(lines[1]).toContain('conversation.read')
    expect(lines[1]).toContain('"message":"boom"')
  })
})
