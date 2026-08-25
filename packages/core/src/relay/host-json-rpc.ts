import { v7 as uuidv7 } from 'uuid'
import { z } from 'zod'

import { PorteErrorPayloadSchema } from '../errors/porte-error-payload.ts'

/** The WebSocket subprotocol for the Host control connection. */
export const HOST_CONTROL_SUBPROTOCOL = 'porte.host-control.v1'

/** The WebSocket subprotocol for one Host conversation connection. */
export const HOST_CONVERSATION_SUBPROTOCOL = 'porte.host-conversation.v1'

/** The fixed JSON-RPC message for an expected Host application failure. */
export const HOST_APPLICATION_ERROR_MESSAGE = 'Application error'

/** The JSON-RPC code for every expected Host application failure. */
export const HOST_APPLICATION_ERROR_CODE = -32_000

/** The correlation identifier for one Host request and response. */
export const HostRequestIdSchema = z.uuidv7().brand<'HostRequestId'>()

/** The correlation identifier for one Host request and response. */
export type HostRequestId = z.infer<typeof HostRequestIdSchema>

/** Create one Host request identifier. */
export const createHostRequestId = (): HostRequestId => HostRequestIdSchema.parse(uuidv7())

/** One expected Host failure in a JSON-RPC error response. */
export const HostApplicationErrorSchema = z.strictObject({
  code: z.literal(HOST_APPLICATION_ERROR_CODE),
  message: z.literal(HOST_APPLICATION_ERROR_MESSAGE),
  data: PorteErrorPayloadSchema,
})
