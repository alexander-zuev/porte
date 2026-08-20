import { ConnectionIdSchema, ConversationIdSchema, HostIdSchema } from '@porte/core'
import { z } from 'zod'

/**
 * What the relay remembers about one socket.
 *
 * The relay hibernates, and instance memory does not survive that. Everything
 * here rides on the socket itself, which does. That single fact is why this
 * exists rather than a map on the object.
 */

/** Which conversation a client is watching, if any. */
const WatchedConversationSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('closed') }),
  z.object({ state: z.literal('open'), conversationId: ConversationIdSchema }),
])

export const SocketAttachmentSchema = z.discriminatedUnion('role', [
  // The Mac's id rides along so the close handler still knows whose Mac left.
  z.object({ role: z.literal('daemon'), hostId: HostIdSchema }),
  z.object({
    role: z.literal('client'),
    connectionId: ConnectionIdSchema,
    conversation: WatchedConversationSchema,
  }),
])

export type SocketAttachment = z.infer<typeof SocketAttachmentSchema>
export type DaemonAttachment = Extract<SocketAttachment, { role: 'daemon' }>
export type ClientAttachment = Extract<SocketAttachment, { role: 'client' }>
