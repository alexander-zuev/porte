import { ConfigError } from '@host/application/config-error.ts'
import { loadConfig } from '@host/entrypoints/cli/host-config.ts'
import { describe, expect, it } from 'vitest'

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
