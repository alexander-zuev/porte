import { CircleIcon } from '@phosphor-icons/react'
import type { ConversationSummary } from '@porte/core/client'
import { Link } from '@tanstack/react-router'
import {
  groupConversationsByCwd,
  repoName,
} from '@web/entities/conversation/group-conversations.ts'
import { Badge } from '@web/ui/components/ui/badge.tsx'
import { Button } from '@web/ui/components/ui/button.tsx'

type ConversationsByRepoProps = {
  readonly conversations: readonly ConversationSummary[]
  readonly runningConversationIds: ReadonlySet<string>
  readonly selectedConversationId?: string
}

/** Every conversation on the Mac, under the repository it belongs to. */
export function ConversationsByRepo({
  conversations,
  runningConversationIds,
  selectedConversationId,
}: ConversationsByRepoProps) {
  return (
    <nav aria-label="Conversations" className="flex flex-col gap-7 px-3 py-5">
      {groupConversationsByCwd(conversations).map((group) => (
        <RepoConversations
          key={group.cwd}
          conversations={group.conversations}
          cwd={group.cwd}
          runningConversationIds={runningConversationIds}
          selectedConversationId={selectedConversationId}
        />
      ))}
    </nav>
  )
}

/** One repository, named by its folder, with the conversations opened from it. */
function RepoConversations({
  conversations,
  cwd,
  runningConversationIds,
  selectedConversationId,
}: {
  readonly conversations: readonly ConversationSummary[]
  readonly cwd: string
  readonly runningConversationIds: ReadonlySet<string>
  readonly selectedConversationId?: string
}) {
  return (
    <section className="flex min-w-0 flex-col gap-2">
      <header className="flex min-w-0 flex-col gap-1 px-2">
        <h2>{repoName(cwd)}</h2>
        <small className="truncate text-muted-foreground" title={cwd}>
          {cwd}
        </small>
      </header>
      <ul className="flex flex-col gap-1">
        {conversations.map((conversation) => (
          <ConversationLink
            key={conversation.id}
            conversation={conversation}
            running={runningConversationIds.has(conversation.id)}
            selected={selectedConversationId === conversation.id}
          />
        ))}
      </ul>
    </section>
  )
}

/** A real link, so a conversation can be opened in a new tab or its address copied. */
function ConversationLink({
  conversation,
  running,
  selected,
}: {
  readonly conversation: ConversationSummary
  readonly running: boolean
  readonly selected: boolean
}) {
  return (
    <li>
      <Button
        aria-current={selected ? 'page' : undefined}
        className="h-auto min-h-16 w-full justify-between gap-3 px-3 py-3 text-left"
        // It renders an anchor, so Base UI must not expect native button semantics.
        nativeButton={false}
        render={
          <Link params={{ conversationId: conversation.id }} to="/conversations/$conversationId">
            <span className="flex min-w-0 flex-1 flex-col items-start gap-1">
              <strong className="w-full truncate">{conversation.title}</strong>
              <small className="text-muted-foreground">
                {formatUpdatedAt(conversation.updatedAt)}
              </small>
            </span>
            {running ? (
              <Badge variant="secondary">
                <CircleIcon aria-hidden data-icon="inline-start" weight="fill" />
                Running
              </Badge>
            ) : null}
          </Link>
        }
        variant={selected ? 'secondary' : 'ghost'}
      />
    </li>
  )
}

function formatUpdatedAt(value: string): string {
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(new Date(value))
}
