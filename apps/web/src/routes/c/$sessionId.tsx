import { createFileRoute } from '@tanstack/react-router'

import { ConversationPage } from '#/pages/conversation/conversation-page.tsx'

export const Route = createFileRoute('/c/$sessionId')({
  component: ConversationRoute,
})

function ConversationRoute() {
  return (
    <ConversationPage
      draft=""
      items={[]}
      online={false}
      permission={undefined}
      status="idle"
      title="Conversation"
      onAnswerPermission={() => undefined}
      onDraftChange={() => undefined}
      onSend={() => undefined}
      onStop={() => undefined}
    />
  )
}
