import { createServerFn } from '@tanstack/react-start'
import { getCookie } from '@tanstack/react-start/server'

const COOKIE_NAME = 'better-auth.last_used_login_method'

export const getLastLoginMethodFn = createServerFn().handler(async () => {
  return getCookie(COOKIE_NAME) ?? null
})
