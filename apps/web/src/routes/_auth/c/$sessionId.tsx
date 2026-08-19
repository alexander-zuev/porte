import { createFileRoute } from '@tanstack/react-router'
import { makeSessionSummary } from '@porte/core'

import { ConversationPage } from '#/pages/conversation/conversation-page.tsx'

export const Route = createFileRoute('/_auth/c/$sessionId')({
  component: ConversationRoute,
})

function ConversationRoute() {
  const { sessionId } = Route.useParams()
  const session = makeSessionSummary({
    id: sessionId,
    cwd: 'Loading repository',
    title: 'Opening session',
    updatedAt: '1970-01-01T00:00:00.000Z',
  })

  return (
    <ConversationPage
      hostName="Mac"
      session={session}
      view="opening"
      onBack={() => undefined}
    />
  )
}
