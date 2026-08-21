import { httpStatusForApiError, type ApiError, type ApiResponse } from '@porte/core/client'

/** Convert one API error to the published HTTP envelope. Status is read from the tag. */
export function apiErrorResponse(error: ApiError): Response {
  const body = { success: false, error } satisfies ApiResponse<never>
  return Response.json(body, { status: httpStatusForApiError(error._tag) })
}
