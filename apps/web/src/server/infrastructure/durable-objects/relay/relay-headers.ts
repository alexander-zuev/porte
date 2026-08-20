/**
 * What the Worker tells the relay on an upgrade.
 *
 * `fetch` is the only way into a Durable Object that can answer with a socket,
 * and it carries a request rather than arguments. So the two facts the relay
 * cannot work out for itself travel as headers, named here so the side that
 * writes them and the side that reads them cannot drift.
 *
 * The relay verifies neither. It has no credential to check: the Worker strips
 * the authorization header on the way in, having already used it. Only our own
 * Worker can reach the binding, which is what makes that safe.
 */

/** Which side of the switchboard is calling. The relay has no credential to derive it from. */
export const RELAY_ROLE_HEADER = 'x-porte-host-role'

/** Which Mac this relay serves. It is addressed by name and cannot read its own name back. */
export const RELAY_HOST_ID_HEADER = 'x-porte-host-id'
