import { LATEST_CLI_VERSION, isCliOutdated } from '@porte/core'
import { describe, expect, it } from 'vitest'

describe('isCliOutdated', () => {
  it('treats a silent host as outdated', () => {
    expect(isCliOutdated(undefined)).toBe(true)
  })

  it('accepts the current release and anything newer', () => {
    expect(isCliOutdated(LATEST_CLI_VERSION)).toBe(false)
    expect(isCliOutdated('99.0.0')).toBe(false)
  })

  it('flags older versions per segment', () => {
    expect(isCliOutdated('0.1.9')).toBe(true)
    expect(isCliOutdated('0.2.0')).toBe(true)
  })
})
