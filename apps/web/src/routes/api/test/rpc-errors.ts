import { createLogger } from '@porte/core/client'
import { RpcErrorAClient } from '@server/infrastructure/durable-objects/rpc-error-lab-client.ts'
import { createFileRoute } from '@tanstack/react-router'

const logger = createLogger('rpc-error-route')

/** Run both Durable Object error chains and report whether each call rejected. */
export const Route = createFileRoute('/api/test/rpc-errors')({
  server: {
    handlers: {
      GET: async ({ context }) => {
        const objectA = new RpcErrorAClient(context.deps.env.RPC_ERROR_A)

        let taggedCall: 'resolved' | 'rejected' = 'resolved'
        logger.info('calling_object_a_call_tagged')
        try {
          await objectA.callTagged()
        } catch (error) {
          taggedCall = 'rejected'
          logger.error('object_a_call_tagged_rejected', { error })
        }

        let genericCall: 'resolved' | 'rejected' = 'resolved'
        logger.info('calling_object_a_call_generic')
        try {
          await objectA.callGeneric()
        } catch (error) {
          genericCall = 'rejected'
          logger.error('object_a_call_generic_rejected', { error })
        }

        return Response.json({ taggedCall, genericCall })
      },
    },
  },
})
