import type { UserId } from '@porte/core'

import type { auth } from './auth-gen.ts'

/**
 * What Better Auth resolves for one request, named once.
 *
 * Inferred from the generated instance rather than restated, so a plugin that
 * changes the session shape changes these with it.
 */
export type AuthSession = (typeof auth)['$Infer']['Session']
export type Session = AuthSession['session']

/**
 * The account, with its identifier branded.
 *
 * Better Auth types `id` as a bare string, but `advanced.database.generateId`
 * in `options.ts` mints every one as uuid v7, so the value is a `UserId` and
 * only the type says otherwise.
 */
export type User = Omit<AuthSession['user'], 'id'> & { id: UserId }
export type SessionWithUser = Omit<AuthSession, 'user'> & { user: User }
