/**
 * The result of one RPC call, as a value rather than a throw.
 *
 * For boundaries that cannot carry a thrown error. Workers RPC keeps only an
 * error's `name` and `message`: own properties, `cause`, stack, and prototype
 * are all dropped, so a tag and an `instanceof` check both die in transit.
 * Returning the outcome is the only way a typed failure survives.
 *
 * Not for boundaries that have their own failure channel. HTTP has a status,
 * and a server function has a throw the client already unwraps.
 */
export type RpcResponse<Data, Error> =
  | { readonly success: true; readonly data: Data }
  | { readonly success: false; readonly error: Error }

/** One succeeded call. */
export function rpcOk<Data>(data: Data): RpcResponse<Data, never> {
  return { success: true, data }
}

/** One failed call. The error is data, so whatever types it survives the boundary. */
export function rpcErr<Error>(error: Error): RpcResponse<never, Error> {
  return { success: false, error }
}
