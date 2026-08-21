import { z } from 'zod'

/** Safe coding-agent failure that can cross the Porte protocol boundary. */
export const CodingAgentErrorSchema = z.object({
  code: z.enum(['CODING_AGENT_UNAVAILABLE', 'REQUEST_TIMEOUT', 'INTERNAL_ERROR']),
  message: z.string().min(1),
})

/** Safe coding-agent failure that can cross the Porte protocol boundary. */
export type CodingAgentError = z.infer<typeof CodingAgentErrorSchema>
