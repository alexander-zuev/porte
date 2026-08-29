/**
 * What the Worker tells the relay on an upgrade.
 *
 * `fetch` is the only way into a Durable Object that can answer with a socket.
 * It carries a request rather than arguments. The subprotocol identifies the role.
 *
 * The relay verifies neither. It has no credential to check: the Worker strips
 * the authorization header on the way in, having already used it. Only our own
 * Worker can reach the binding, which is what makes that safe.
 */

/** Which machine this relay serves. It is addressed by name and cannot read its own name back. */
export const RELAY_HOST_ID_HEADER = 'x-porte-host-id'
