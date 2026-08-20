import { makeConversationSummary } from '@porte/core'
import { createFileRoute } from '@tanstack/react-router'
import { ConversationPage } from '@web/pages/conversation/conversation-page.tsx'

export const Route = createFileRoute('/_auth/c/$conversationId')({
  component: ConversationRoute,
})

function ConversationRoute() {
  const { conversationId } = Route.useParams()
  const conversation = makeConversationSummary({
    id: conversationId,
    cwd: 'Loading repository',
    title: 'Opening conversation',
    updatedAt: '1970-01-01T00:00:00.000Z',
  })

  return (
    <ConversationPage
      hostName="Mac"
      conversation={conversation}
      view="opening"
      onBack={() => undefined}
    />
  )
}
