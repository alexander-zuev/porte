import { v7 as uuidv7 } from 'uuid'
import { z } from 'zod'

import {
  ConfigurationNotFoundError,
  ConversationBusyError,
  ConversationNotFoundError,
  ElicitationNotFoundError,
  PermissionNotFoundError,
} from '../errors/conversation.errors.ts'
import { InternalServerError } from '../errors/internal.errors.ts'
import { PorteErrorPayloadSchema, type PorteErrorPayload } from '../errors/porte-error-payload.ts'
import { RequestTimeoutError } from '../errors/request.errors.ts'

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

/**
 * Rebuild the Host error class from a JSON-RPC `error.data` payload.
 *
 * Unknown tags become `InternalServerError`. The socket must not switch on tags.
 */
export function errorFromHostPayload(payload: PorteErrorPayload): Error {
  switch (payload._tag) {
    case 'ConversationNotFoundError':
      return new ConversationNotFoundError()
    case 'ConversationBusyError':
      return new ConversationBusyError()
    case 'PermissionNotFoundError':
      return new PermissionNotFoundError()
    case 'ElicitationNotFoundError':
      return new ElicitationNotFoundError()
    case 'ConfigurationNotFoundError':
      return new ConfigurationNotFoundError()
    case 'RequestTimeoutError':
      return new RequestTimeoutError()
    default:
      return new InternalServerError()
  }
}

/** Position of one notification on its connection, from 1. The receiver applies them in this order. */
export const SequenceNumberSchema = z.int().positive().brand<'SequenceNumber'>()

/** Position of one notification on its connection. */
export type SequenceNumber = z.infer<typeof SequenceNumberSchema>

/**
 * Params of a Host notification, with the `seq` the relay orders by.
 *
 * The relay's sub-agent bridge can deliver two frames out of order,
 * so every notification carries its position on the connection.
 *
 * @param fields - The method's own params.
 * @returns A strict params schema with `seq` first.
 */
export function sequencedParams<Fields extends Record<string, z.ZodType>>(fields: Fields) {
  return z.strictObject({ seq: SequenceNumberSchema, ...fields })
}
