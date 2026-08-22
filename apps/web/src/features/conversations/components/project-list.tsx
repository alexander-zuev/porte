import { CaretRightIcon, FolderIcon, NotePencilIcon } from '@phosphor-icons/react'
import type { ConversationSummary } from '@porte/core/client'
import { Link } from '@tanstack/react-router'
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

type ProjectListProps = {
  readonly conversations: readonly ConversationSummary[]
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
      {/* `h5` is the design system's 16px heading. A larger one would make the
          label louder than the folders it names. */}
      <h5 className="pb-1">Projects</h5>
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
    (conversation) => conversation.id === selectedConversationId,
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
            className="size-3 shrink-0 text-muted-foreground transition-transform duration-200 ease-out group-data-panel-open:rotate-90 motion-reduce:transition-none"
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

      {/* Height comes from Base UI's own measurement, so the panel can travel
          between zero and its natural size. The fade is quicker than the slide:
          on the way out the text is gone before the box finishes closing, which
          reads as one movement rather than content squashed by a shrinking box. */}
      <CollapsibleContent
        className={cn(
          'flex h-[var(--collapsible-panel-height)] flex-col overflow-hidden pb-2',
          '[transition:height_200ms_ease-out,opacity_140ms_ease-out]',
          'data-starting-style:h-0 data-starting-style:opacity-0',
          'data-ending-style:h-0 data-ending-style:opacity-0',
          'motion-reduce:transition-none',
        )}
      >
        {project.conversations.map((conversation) => (
          <ConversationLink
            key={conversation.id}
            conversation={conversation}
            selected={selectedConversationId === conversation.id}
          />
        ))}
      </CollapsibleContent>
    </Collapsible>
  )
}

/** A real link, so a conversation can be opened in a new tab or its address copied. */
function ConversationLink({
  conversation,
  selected,
}: {
  readonly conversation: ConversationSummary
  readonly selected: boolean
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
      <span className={cn('truncate', !selected && 'text-muted-foreground')}>
        {conversationTitle(conversation)}
      </span>
    </Link>
  )
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
