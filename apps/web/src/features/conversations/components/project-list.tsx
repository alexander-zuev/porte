import { CaretRightIcon, FolderIcon, NotePencilIcon } from '@phosphor-icons/react'
import type { ConversationSummary } from '@porte/core/client'
import { Link } from '@tanstack/react-router'
import type {
  ConversationAttentionStatus,
  ConversationListItem,
  ConversationTurnStatus,
} from '@web/entities/conversation/conversation-list.ts'
import {
  groupConversationsByRepo,
  type Project,
} from '@web/entities/conversation/group-conversations.ts'
import { cn } from '@web/lib/utils.ts'
import { Button } from '@web/ui/components/ui/button.tsx'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@web/ui/components/ui/collapsible.tsx'
import { Spinner } from '@web/ui/components/ui/spinner.tsx'

type ProjectListProps = {
  readonly conversations: readonly ConversationListItem[]
  readonly selectedConversationId?: string
}

/**
 * Every folder on the Mac, each opening to the conversations inside it.
 *
 * Nothing here sets side padding. The page owns the one left edge, and a row
 * that added its own would sit inside the heading above it.
 */
export function ProjectList({ conversations, selectedConversationId }: ProjectListProps) {
  return (
    <nav aria-label="Projects" className="flex flex-col">
      {/* A label, not a heading: the page's only heading is its `h1`, and a `h5`
          under it skips levels. `strong` is the same 16px medium as `h5`. */}
      <p className="pb-1">
        <strong>Projects</strong>
      </p>
      {groupConversationsByRepo(conversations).map((project) => (
        <ProjectRow
          key={project.gitRoot}
          project={project}
          selectedConversationId={selectedConversationId}
        />
      ))}
    </nav>
  )
}

/**
 * One folder, closed until asked.
 *
 * Open by default when it holds the conversation on screen, so arriving from a
 * conversation does not hide where it came from.
 */
function ProjectRow({
  project,
  selectedConversationId,
}: {
  readonly project: Project
  readonly selectedConversationId?: string
}) {
  const holdsSelected = project.conversations.some(
    ({ conversation }) => conversation.id === selectedConversationId,
  )

  return (
    <Collapsible defaultOpen={holdsSelected}>
      <div className="flex min-w-0 items-center gap-1">
        {/* The row grows and the compose button does not, so a long folder name
            truncates rather than pushing the action off the screen. */}
        <CollapsibleTrigger
          className={cn(
            'group flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-md text-left',
            'hover:bg-accent hover:text-accent-foreground -mx-2 px-2',
          )}
        >
          <FolderIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          <strong className="truncate">{project.name}</strong>
          <CaretRightIcon
            aria-hidden
            className="size-3 shrink-0 text-muted-foreground transition-transform duration-150 ease-out group-data-panel-open:rotate-90 motion-reduce:transition-none"
          />
        </CollapsibleTrigger>

        <Button
          aria-label={`New conversation in ${project.name}`}
          className="shrink-0 text-muted-foreground"
          size="icon"
          variant="ghost"
        >
          <NotePencilIcon aria-hidden />
        </Button>
      </div>

      <CollapsibleContent className="flex flex-col pb-2">
        {project.conversations.map(({ attentionStatus, conversation, turnStatus }) => (
          <ConversationLink
            key={conversation.id}
            attentionStatus={attentionStatus}
            conversation={conversation}
            selected={selectedConversationId === conversation.id}
            turnStatus={turnStatus}
          />
        ))}
      </CollapsibleContent>
    </Collapsible>
  )
}

/** A real link, so a conversation can be opened in a new tab or its address copied. */
function ConversationLink({
  attentionStatus,
  conversation,
  selected,
  turnStatus,
}: {
  readonly attentionStatus: ConversationAttentionStatus
  readonly conversation: ConversationSummary
  readonly selected: boolean
  readonly turnStatus: ConversationTurnStatus
}) {
  return (
    <Link
      aria-current={selected ? 'page' : undefined}
      className={cn(
        'flex min-h-11 items-center rounded-md -mx-2 px-2',
        'hover:bg-accent hover:text-accent-foreground',
        selected && 'bg-accent text-accent-foreground',
      )}
      params={{ conversationId: conversation.id }}
      to="/conversations/$conversationId"
    >
      <span className={cn('min-w-0 flex-1 truncate', !selected && 'text-muted-foreground')}>
        {conversationTitle(conversation)}
      </span>
      <span className="flex size-5 shrink-0 items-center justify-center">
        <ConversationRowStatus attentionStatus={attentionStatus} turnStatus={turnStatus} />
      </span>
    </Link>
  )
}

function ConversationRowStatus({
  attentionStatus,
  turnStatus,
}: {
  readonly attentionStatus: ConversationAttentionStatus
  readonly turnStatus: ConversationTurnStatus
}) {
  if (turnStatus === 'running') {
    return <Spinner aria-label="Conversation is running" className="text-muted-foreground" />
  }
  if (attentionStatus === 'unseen') {
    return <output aria-label="New message" className="size-2 rounded-full bg-status-info" />
  }
  return null
}

/**
 * What to call a conversation the agent has not titled.
 *
 * The Mac creates a conversation with an empty title and the agent writes one
 * later, so a blank row is a real state rather than missing data.
 */
function conversationTitle(conversation: ConversationSummary): string {
  return conversation.title.trim() === '' ? 'Untitled' : conversation.title
}
