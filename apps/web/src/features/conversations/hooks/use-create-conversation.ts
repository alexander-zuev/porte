import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { conversationMutations } from '@web/entities/conversation/conversation-mutations.ts'
import { conversationQueries } from '@web/entities/conversation/conversation-queries.ts'
import { toast } from '@web/ui/components/ui/sonner.tsx'

/** What the list needs to offer "new conversation here": the action and which folder is busy. */
export type CreateConversation = {
  readonly start: (cwd: string) => void
  /** The folder a creation is running in, so its pencil can wait and the others hold. */
  readonly pendingCwd: string | undefined
}

/** Create a conversation in a folder, then open it. The composer there is the first prompt. */
export function useCreateConversation(): CreateConversation {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const create = useMutation({
    ...conversationMutations.create(),
    onSuccess: async (conversation) => {
      await queryClient.invalidateQueries({ queryKey: conversationQueries.list().queryKey })
      await navigate({
        to: '/conversations/$conversationId',
        params: { conversationId: conversation.id },
      })
    },
    onError: () => {
      toast.error('Could not start a conversation', {
        description: 'Check that the machine is online, then try again.',
      })
    },
  })

  return {
    start: (cwd) => {
      create.mutate({ cwd })
    },
    pendingCwd: create.isPending ? create.variables.cwd : undefined,
  }
}
