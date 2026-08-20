import { ArrowLeftIcon } from '@phosphor-icons/react'
import type { ConversationSummary } from '@porte/core'

import { HostStatus } from '#/ui/components/host-status.tsx'
import { Button } from '#/ui/components/ui/button.tsx'
import { Separator } from '#/ui/components/ui/separator.tsx'

/** Connection states visible while one conversation is selected. */
export type ConversationConnection = 'online' | 'offline' | 'reconnecting'

/** Show conversation identity, repository, host, and the mobile back path. */
export function ConversationHeader({
  conversation,
  hostName,
  connection,
  onBack,
}: {
  readonly conversation: ConversationSummary
  readonly hostName: string
  readonly connection: ConversationConnection
  readonly onBack: () => void
}) {
  return (
    <>
      <header className="flex flex-col gap-3 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-4 md:px-5 md:pt-4">
        <div className="flex items-center justify-between gap-4">
          <Button className="md:hidden" variant="ghost" onClick={onBack}>
            <ArrowLeftIcon data-icon="inline-start" />
            Conversations
          </Button>
          <div className="ml-auto flex min-w-0 flex-col items-end gap-1">
            <strong className="max-w-44 truncate">{hostName}</strong>
            <HostStatus status={connection} />
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="truncate">{conversation.title}</h1>
          <small className="truncate text-muted-foreground" title={conversation.cwd}>
            {conversation.cwd}
          </small>
        </div>
      </header>
      <Separator />
    </>
  )
}
