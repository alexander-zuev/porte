import { createLogger } from '@porte/core'
import { DurableObject } from 'cloudflare:workers'
import { TaggedError } from 'better-result'

import { RpcErrorBClient } from './rpc-error-lab-client.ts'
import type { RuntimeEnv } from '../runtime-env.ts'

const loggerA = createLogger('rpc-error-a')
const loggerB = createLogger('rpc-error-b')

class TaggedRpcError extends TaggedError('TaggedRpcError')<{ message: string }> {
  constructor() {
    super({ message: 'Tagged error from Object B' })
  }
}

/** Object B throws the errors used by the RPC error test. */
export class RpcErrorB extends DurableObject<RuntimeEnv> {
  /** Throw a custom tagged error. */
  async throwTagged(): Promise<void> {
    const error = new TaggedRpcError()
    loggerB.warn('throwing_tagged_error', error)
    throw error
  }

  /** Throw a generic JavaScript error. */
  async throwGeneric(): Promise<void> {
    const error = new Error('Generic error from Object B')
    loggerB.warn('throwing_generic_error', error)
    throw error
  }
}

/** Object A calls Object B and rethrows each rejected RPC call. */
export class RpcErrorA extends DurableObject<RuntimeEnv> {
  /** Call Object B's tagged-error method. */
  async callTagged(): Promise<void> {
    const objectB = new RpcErrorBClient(this.env.RPC_ERROR_B)
    loggerA.info('calling_object_b_throw_tagged')

    try {
      await objectB.throwTagged()
    } catch (error) {
      loggerA.error('object_b_throw_tagged_rejected', { error })
      throw error
    }
  }

  /** Call Object B's generic-error method. */
  async callGeneric(): Promise<void> {
    const objectB = new RpcErrorBClient(this.env.RPC_ERROR_B)
    loggerA.info('calling_object_b_throw_generic')

    try {
      await objectB.throwGeneric()
    } catch (error) {
      loggerA.error('object_b_throw_generic_rejected', { error })
      throw error
    }
  }
}
