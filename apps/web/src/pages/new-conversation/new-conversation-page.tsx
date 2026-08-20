import {
  NewConversation,
  type NewConversationProps,
} from '@web/features/conversation-create/components/new-conversation.tsx'

/** Props for the new-conversation page. */
export type NewConversationPageProps = NewConversationProps

/** Render the new-conversation flow in its responsive page shell. */
export function NewConversationPage(props: NewConversationPageProps) {
  return <NewConversation {...props} />
}
