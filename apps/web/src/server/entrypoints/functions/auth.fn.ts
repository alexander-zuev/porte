import { AuthenticationError } from '@porte/core/client'
import { createLogger } from '@porte/core/client'
import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'

const logger = createLogger('auth-fn')

/**
 * Get the current session, or null.
 * Called from beforeLoad (runs in-process during SSR, no serialization boundary).
 */
export const getSession = createServerFn({ method: 'GET' }).handler(async ({ context }) => {
  const headers = getRequestHeaders()
  return context.deps.auth().api.getSession({ headers })
})

/**
 * Ensure an authenticated session, or throw AuthenticationError.
 * Unexpected failures are logged and also surface as AuthenticationError.
 */
export const ensureSession = createServerFn({ method: 'GET' }).handler(async ({ context }) => {
  try {
    const headers = getRequestHeaders()
    const session = await context.deps.auth().api.getSession({ headers })
    if (!session) throw new AuthenticationError()
    return session
  } catch (error) {
    if (error instanceof AuthenticationError) throw error
    logger.error('check_session_unexpected_error', { error })
    throw new AuthenticationError()
  }
})
