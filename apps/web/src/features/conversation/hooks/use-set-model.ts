import { useMutation } from '@tanstack/react-query'

import type { ConversationAgentStub } from './use-conversation-agent.ts'

/** The pair the picker displays; effort omitted means the model's default. */
export type SetModelInput = {
  readonly modelId: string
  readonly reasoningEffort?: string
}

export type SetModel = {
  readonly onSetModel: (input: SetModelInput) => void
  /** True until the Host answers; the confirmed value arrives via the live-state broadcast. */
  readonly pending: boolean
  readonly failed: boolean
}

/**
 * Switch the model or its effort on the machine, as one `set_model` pair.
 * Never writes the current value locally: the `configuration.updated`
 * broadcast is the only writer, so the check mark cannot lie.
 */
export function useSetModel(stub: ConversationAgentStub): SetModel {
  const mutation = useMutation({ mutationFn: (input: SetModelInput) => stub.setModel(input) })
  return {
    onSetModel: (input) => {
      mutation.mutate(input)
    },
    pending: mutation.isPending,
    failed: mutation.isError,
  }
}
