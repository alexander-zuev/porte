import { createAuthClient } from 'better-auth/react'

/** Browser Better Auth client. Routes must read sessions through `auth.fn`, not this module. */
export const authClient = createAuthClient()
