/** Unwrap a Result envelope for TanStack Query. Wired in later slices. */
export async function unwrapRpc<T>(value: Promise<T> | T): Promise<T> {
  return value
}
