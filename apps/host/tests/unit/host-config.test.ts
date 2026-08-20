import { describe, expect, it } from 'vitest'

import { ConfigError } from '../../src/application/host-error.ts'
import { loadConfig, relayUrlFor } from '../../src/composition/host-config.ts'

describe('loadConfig', () => {
  it('defaults to the hosted relay', () => {
    expect(loadConfig({}).baseUrl).toBe('https://useporte.dev')
  })

  it('accepts a local Worker, so dev needs no separate mode', () => {
    expect(loadConfig({ PORTE_URL: 'http://localhost:8788' }).baseUrl).toBe('http://localhost:8788')
  })

  it('names the variable the person can change when it is unusable', () => {
    expect(() => loadConfig({ PORTE_URL: 'nonsense' })).toThrow(ConfigError)
    expect(() => loadConfig({ PORTE_URL: 'nonsense' })).toThrow(/PORTE_URL/)
  })

  it('refuses a scheme that is not http', () => {
    expect(() => loadConfig({ PORTE_URL: 'ftp://example.com' })).toThrow(ConfigError)
  })
})

describe('relayUrlFor', () => {
  it('upgrades https to wss', () => {
    expect(relayUrlFor('https://useporte.dev')).toBe('wss://useporte.dev/api/host/ws')
  })

  it('keeps a local origin unencrypted, so dev needs no certificate', () => {
    expect(relayUrlFor('http://localhost:8788')).toBe('ws://localhost:8788/api/host/ws')
  })
})
