import {
  ArrowsClockwiseIcon,
  DesktopIcon,
  FolderIcon,
  WarningCircleIcon,
} from '@phosphor-icons/react'
import type { HostConnection } from '@web/entities/host/host-connection.ts'
import { ConversationGroupList } from '@web/features/conversations/components/conversation-group-list.tsx'
import { EmptyState } from '@web/features/conversations/components/empty-state.tsx'
import { UP_COMMAND } from '@web/lib/product.ts'
import { AppShell } from '@web/ui/components/app-shell.tsx'
import { TerminalCommand } from '@web/ui/components/terminal-command.tsx'
import { Button } from '@web/ui/components/ui/button.tsx'
import { Spinner } from '@web/ui/components/ui/spinner.tsx'
import type { ReactNode } from 'react'

export type ConversationsPageProps = {
  readonly connection: HostConnection
  readonly header: ReactNode
  readonly footer: ReactNode
  readonly onOpenConversation: (conversationId: string) => void
  readonly onStartConversation: () => void
  readonly onRetry: () => void
}

/**
 * Everything a signed-in account with a paired Mac sees.
 *
 * One shell, one body decided by one value. The page holds no state of its own,
 * so a Mac appearing or going away is a re-render rather than a navigation.
 */
export function ConversationsPage(props: ConversationsPageProps) {
  return (
    <AppShell footer={props.footer} header={props.header}>
      {renderBody(props)}
    </AppShell>
  )
}

function renderBody(props: ConversationsPageProps) {
  const { connection } = props

  if (connection.state === 'connecting') {
    return <EmptyState body="Looking for your Mac." icon={<Spinner />} title="Connecting" />
  }

  if (connection.state === 'failed') {
    return (
      <EmptyState
        body={connection.reason}
        icon={<WarningCircleIcon aria-hidden />}
        title="Porte could not reach the relay"
        action={
          <Button className="min-h-11" variant="outline" onClick={props.onRetry}>
            <ArrowsClockwiseIcon aria-hidden />
            Try again
          </Button>
        }
      />
    )
  }

  if (connection.state === 'offline') {
    return (
      <EmptyState
        action={<TerminalCommand command={UP_COMMAND} />}
        body="Your Mac is paired but not running Porte. Start it there to work from here."
        icon={<DesktopIcon aria-hidden />}
        title="Start Porte on your Mac"
      />
    )
  }

  if (connection.state === 'empty') {
    return (
      <EmptyState
        body="Open Porte from a repository on the Mac to start your first one."
        icon={<FolderIcon aria-hidden />}
        title="No conversations yet"
        action={
          <Button className="min-h-11" onClick={props.onStartConversation}>
            New conversation
          </Button>
        }
      />
    )
  }

  return (
    <ConversationGroupList
      conversations={connection.conversations}
      runningConversationIds={EMPTY_IDS}
      onOpenConversation={props.onOpenConversation}
    />
  )
}

/** Turns arrive with the conversation flows; nothing is running from here yet. */
const EMPTY_IDS: ReadonlySet<string> = new Set()
