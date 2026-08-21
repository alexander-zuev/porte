import { createCsrfMiddleware } from '@tanstack/react-start'

/** Server functions are same-origin RPC, so reject cross-site callers. */
export const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === 'serverFn',
})
