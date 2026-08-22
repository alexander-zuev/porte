import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import type { CloudflareTurnstileOptions } from 'better-auth/plugins'
import { drizzle } from 'drizzle-orm/d1'
import { describe, expect, it } from 'vitest'

import {
  createBetterAuthOptions,
  type AuthRuntimeConfig,
} from '../../src/server/infrastructure/auth/options.ts'

// SAFETY: These tests only inspect options, so the adapter never reads the empty D1 handle.
const database = drizzleAdapter(drizzle({} as D1Database), { provider: 'sqlite' })

const baseConfig = {
  secret: 'test-secret',
  baseURL: 'https://useporte.dev',
  googleClientId: 'test',
  googleClientSecret: 'test',
  appleClientId: 'test',
  appleTeamId: 'test',
  appleKeyId: 'test',
  applePrivateKey: 'test',
  githubClientId: 'test',
  githubClientSecret: 'test',
  twitterClientId: 'test',
  twitterClientSecret: 'test',
  turnstileSecretKey: 'test',
  isDevelopment: false,
  waitUntil: () => undefined,
} satisfies AuthRuntimeConfig

function captchaOptions(config?: AuthRuntimeConfig): CloudflareTurnstileOptions {
  const options = createBetterAuthOptions(database, config).plugins.find(
    (plugin) => plugin.id === 'captcha',
  )?.options
  if (!isTurnstileOptions(options)) throw new Error('Turnstile plugin missing')
  return options
}

function isTurnstileOptions(value: unknown): value is CloudflareTurnstileOptions {
  return (
    typeof value === 'object' &&
    value !== null &&
    'provider' in value &&
    value.provider === 'cloudflare-turnstile'
  )
}

describe('Turnstile auth options', () => {
  it('binds production tokens to sign-in on the production hostname', () => {
    expect(captchaOptions(baseConfig)).toMatchObject({
      expectedAction: 'sign-in',
      allowedHostnames: ['useporte.dev'],
    })
  })

  it('also accepts the local development hostnames', () => {
    expect(
      captchaOptions({
        ...baseConfig,
        baseURL: 'https://tunnel.useporte.dev',
        isDevelopment: true,
      }),
    ).toMatchObject({
      allowedHostnames: ['tunnel.useporte.dev', 'localhost', '127.0.0.1'],
    })
  })

  it('omits hostname checks during CLI schema generation', () => {
    expect(captchaOptions()).toMatchObject({ expectedAction: 'sign-in' })
    expect(captchaOptions().allowedHostnames).toBeUndefined()
  })
})
