import { FolderSimpleIcon, LinkIcon, WarningCircleIcon } from '@phosphor-icons/react'
import { PLUGIN_INSTALL_COMMANDS } from '@web/lib/product.ts'
import { TerminalCommand } from '@web/ui/components/terminal-command.tsx'
import { Button } from '@web/ui/components/ui/button.tsx'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@web/ui/components/ui/empty.tsx'
import { Skeleton } from '@web/ui/components/ui/skeleton.tsx'

export function ConversationHomeLoading() {
  return (
    <output aria-label="Loading conversations" className="flex flex-col gap-7 px-5 py-6">
      {[0, 1].map((group) => (
        <div key={group} className="flex flex-col gap-3">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-4 w-52 max-w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ))}
    </output>
  )
}

export function NoConversations({
  canCreate,
  onStartConversation,
}: {
  readonly canCreate: boolean
  readonly onStartConversation: () => void
}) {
  return (
    <Empty className="border-0 px-6">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <FolderSimpleIcon />
        </EmptyMedia>
        <EmptyTitle>No conversations yet</EmptyTitle>
        <EmptyDescription>
          {canCreate
            ? 'Start a conversation in a repository that this machine already knows.'
            : 'Open Porte from a repository on the machine before you create a conversation.'}
        </EmptyDescription>
      </EmptyHeader>
      {canCreate ? (
        <EmptyContent>
          <Button onClick={onStartConversation}>New conversation</Button>
        </EmptyContent>
      ) : null}
    </Empty>
  )
}

export function ConversationHomeFailure({
  state,
  hostName,
  onRetry,
  onPair,
}: {
  readonly state: 'error' | 'unpaired' | 'revoked'
  readonly hostName?: string
  readonly onRetry: () => void
  readonly onPair: () => void
}) {
  const content = failureContent(state, hostName)
  return (
    <Empty className="border-0 px-6">
      <EmptyHeader>
        <EmptyMedia variant="icon">{content.icon}</EmptyMedia>
        <EmptyTitle>{content.title}</EmptyTitle>
        <EmptyDescription>{content.description}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent className="w-full max-w-sm">
        {state === 'error' ? (
          <Button variant="outline" onClick={onRetry}>
            Retry
          </Button>
        ) : (
          <>
            <TerminalCommand command={PLUGIN_INSTALL_COMMANDS} />
            <Button variant="ghost" onClick={onPair}>
              Enter a pairing code
            </Button>
          </>
        )}
      </EmptyContent>
    </Empty>
  )
}

function failureContent(state: 'error' | 'unpaired' | 'revoked', hostName?: string) {
  if (state === 'unpaired') {
    return {
      icon: <LinkIcon />,
      title: 'Pair your machine',
      description:
        'Install this on the machine where you use Grok, then type /remote-control in Grok and open the link it prints.',
    }
  }
  if (state === 'revoked') {
    return {
      icon: <WarningCircleIcon />,
      title: 'Pairing was revoked',
      description: `${hostName ?? 'This machine'} no longer accepts remote control. Pair it again to continue.`,
    }
  }
  return {
    icon: <WarningCircleIcon />,
    title: 'Conversations did not load',
    description: 'Porte could not restore the latest host snapshot. Retry the request.',
  }
}
