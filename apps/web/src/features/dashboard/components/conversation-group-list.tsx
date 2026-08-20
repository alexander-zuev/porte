import { CircleIcon } from '@phosphor-icons/react'
import type { ConversationSummary } from '@porte/core'

import { groupConversationsByCwd, repoName } from '#/entities/conversation/group-conversations.ts'
import { Badge } from '#/ui/components/ui/badge.tsx'
import { Button } from '#/ui/components/ui/button.tsx'
import { Spinner } from '#/ui/components/ui/spinner.tsx'

type ConversationGroupListProps = {
  readonly conversations: readonly ConversationSummary[]
  readonly runningConversationIds: ReadonlySet<string>
  readonly openingConversationId?: string
  readonly selectedConversationId?: string
  readonly onOpenConversation: (conversationId: string) => void
}

export function ConversationGroupList({
  conversations,
  runningConversationIds,
  openingConversationId,
  selectedConversationId,
  onOpenConversation,
}: ConversationGroupListProps) {
  const groups = groupConversationsByCwd(conversations)
  return (
    <nav aria-label="Conversations" className="flex flex-col gap-7 px-3 py-5">
      {groups.map((group) => (
        <section key={group.cwd} className="flex min-w-0 flex-col gap-2">
          <header className="flex min-w-0 flex-col gap-1 px-2">
            <h2>{repoName(group.cwd)}</h2>
            <small className="truncate text-muted-foreground" title={group.cwd}>
              {group.cwd}
            </small>
          </header>
          <ul className="flex flex-col gap-1">
            {group.conversations.map((conversation) => (
              <ConversationRow
                key={conversation.id}
                opening={openingConversationId === conversation.id}
                pending={openingConversationId !== undefined}
                running={runningConversationIds.has(conversation.id)}
                selected={selectedConversationId === conversation.id}
                conversation={conversation}
                onOpenConversation={onOpenConversation}
              />
            ))}
          </ul>
        </section>
      ))}
    </nav>
  )
}

function ConversationRow({
  conversation,
  opening,
  pending,
  running,
  selected,
  onOpenConversation,
}: {
  readonly conversation: ConversationSummary
  readonly opening: boolean
  readonly pending: boolean
  readonly running: boolean
  readonly selected: boolean
  readonly onOpenConversation: (conversationId: string) => void
}) {
  return (
    <li>
      <Button
        aria-current={selected ? 'page' : undefined}
        className="h-auto min-h-16 w-full justify-between gap-3 px-3 py-3 text-left"
        disabled={pending}
        type="button"
        variant={selected ? 'secondary' : 'ghost'}
        onClick={() => {
          onOpenConversation(conversation.id)
        }}
      >
        <span className="flex min-w-0 flex-1 flex-col items-start gap-1">
          <strong className="w-full truncate">{conversation.title}</strong>
          <small className="text-muted-foreground">{formatUpdatedAt(conversation.updatedAt)}</small>
        </span>
        {opening ? <Spinner aria-label="Opening conversation" /> : null}
        {running && !opening ? (
          <Badge variant="secondary">
            <CircleIcon aria-hidden data-icon="inline-start" weight="fill" />
            Running
          </Badge>
        ) : null}
      </Button>
    </li>
  )
}

function formatUpdatedAt(value: string): string {
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(new Date(value))
}
