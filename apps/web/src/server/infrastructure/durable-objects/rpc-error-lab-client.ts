import { DurableObjectClient } from '@porte/core'

import type { RpcErrorA, RpcErrorB } from './rpc-error-lab.ts'

/** Calls Object B through the shared Durable Object client boundary. */
export class RpcErrorBClient extends DurableObjectClient<RpcErrorB> {
  /** Call the RPC method that throws a tagged error. */
  throwTagged(): Promise<void> {
    return this.once('rpc-error-b', (object) => object.throwTagged())
  }

  /** Call the RPC method that throws a generic error. */
  throwGeneric(): Promise<void> {
    return this.once('rpc-error-b', (object) => object.throwGeneric())
  }
}

/** Calls Object A through the shared Durable Object client boundary. */
export class RpcErrorAClient extends DurableObjectClient<RpcErrorA> {
  /** Call Object A's tagged-error chain. */
  callTagged(): Promise<void> {
    return this.once('rpc-error-a', (object) => object.callTagged())
  }

  /** Call Object A's generic-error chain. */
  callGeneric(): Promise<void> {
    return this.once('rpc-error-a', (object) => object.callGeneric())
  }
}
