import { DesktopIcon, FolderIcon, WarningCircleIcon } from '@phosphor-icons/react'
import type { RelayState } from '@web/entities/host/relay-state.ts'
import { ConversationGroupList } from '@web/features/conversations/components/conversation-group-list.tsx'
import { EmptyState } from '@web/features/conversations/components/empty-state.tsx'
import { UP_COMMAND } from '@web/lib/product.ts'
import { AppShell } from '@web/ui/components/app-shell.tsx'
import { TerminalCommand } from '@web/ui/components/terminal-command.tsx'
import { Button } from '@web/ui/components/ui/button.tsx'
import { Spinner } from '@web/ui/components/ui/spinner.tsx'
import type { ReactNode } from 'react'

export type ConversationsPageProps = {
  readonly relay: RelayState
  readonly header: ReactNode
  readonly footer: ReactNode
  readonly onOpenConversation: (conversationId: string) => void
  readonly onStartConversation: () => void
}

/**
 * Everything a signed-in account with a paired Mac sees.
 *
 * The page reads one value and returns one screen. Nothing here waits, retries,
 * or reconnects: by the time this renders, the answer is already whatever it is.
 */
export function ConversationsPage(props: ConversationsPageProps) {
  return (
    <AppShell footer={props.footer} header={props.header}>
      {body(props)}
    </AppShell>
  )
}

function body({ relay, onStartConversation, onOpenConversation }: ConversationsPageProps) {
  // Never heard from the relay yet. Not offline: saying so would send someone
  // to their Mac while the line is still opening.
  if (relay.mac === null) {
    return <EmptyState body="Looking for your Mac." icon={<Spinner />} title="Connecting" />
  }

  if (relay.relay === 'failed') {
    return (
      <EmptyState
        body="Porte could not keep a connection open. Your Mac may still be running."
        icon={<WarningCircleIcon aria-hidden />}
        title="Cannot reach Porte"
      />
    )
  }

  // The Mac is away, and this is the one screen that asks something of anyone.
  if (!relay.mac.online) {
    return (
      <EmptyState
        action={<TerminalCommand command={UP_COMMAND} />}
        body="Your Mac is paired but not running Porte. Start it there to work from here."
        icon={<DesktopIcon aria-hidden />}
        title="Start Porte on your Mac"
      />
    )
  }

  if (relay.conversations.length === 0) {
    return (
      <EmptyState
        body="Open Porte from a repository on the Mac to start your first one."
        icon={<FolderIcon aria-hidden />}
        title="No conversations yet"
        action={
          <Button className="min-h-11" onClick={onStartConversation}>
            New conversation
          </Button>
        }
      />
    )
  }

  return (
    <ConversationGroupList
      conversations={relay.conversations}
      runningConversationIds={NONE_RUNNING}
      onOpenConversation={onOpenConversation}
    />
  )
}

/** Turns arrive with the conversation flows; nothing runs from this page yet. */
const NONE_RUNNING: ReadonlySet<string> = new Set()
