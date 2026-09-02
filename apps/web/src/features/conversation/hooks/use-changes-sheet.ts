import type { ChangedFilePath, TurnId } from '@porte/core/client'
import { keepPreviousData, skipToken, useQuery } from '@tanstack/react-query'
import type { ChangesView, FileDiffView } from '@web/features/conversation/models/changes.ts'
import { useState } from 'react'

import type {
  ConversationAgentConnection,
  ConversationAgentStub,
} from './use-conversation-agent.ts'

/** What the diff sheet reads and does: the two views, the tapped file, and the tap. */
export type ChangesSheet = {
  readonly changes: ChangesView
  readonly selected: ChangedFilePath | null
  /** The tapped file's diff; `pending` while nothing is tapped. */
  readonly diff: FileDiffView
  readonly onSelect: (path: ChangedFilePath | null) => void
}

/** The two callables the sheet needs, and the socket name that keys their cache. */
export type ChangesSource = Pick<ConversationAgentConnection, 'name'> & {
  readonly stub: Pick<ConversationAgentStub, 'listChanges' | 'getDiff'>
}

export type ChangesSheetOptions = {
  /** False while the machine is offline or the socket has not identified: nothing is asked. */
  readonly enabled: boolean
  /** The machine's running turn. Its start and end each change the key, so the tree is re-read. */
  readonly runningTurnId: TurnId | undefined
}

/**
 * The diff sheet's data: uncommitted changes and one file's diff, read from
 * the machine through the conversation socket.
 *
 * Freshness is the key, not an effect: `runningTurnId` is part of it, so a
 * turn ending flips the key and Query re-reads. The list keeps its previous
 * answer meanwhile, so the pill's numbers never blink out. Window focus
 * refetches by Query's default.
 */
export function useChangesSheet(agent: ChangesSource, options: ChangesSheetOptions): ChangesSheet {
  const [selected, setSelected] = useState<ChangedFilePath | null>(null)
  const scope = ['conversation', 'changes', agent.name, options.runningTurnId ?? 'idle'] as const

  const list = useQuery({
    queryKey: [...scope, 'list'] as const,
    queryFn: () => agent.stub.listChanges(),
    enabled: options.enabled,
    placeholderData: keepPreviousData,
    retry: OPEN_RACE_RETRIES,
  })
  const diff = useQuery({
    queryKey: [...scope, 'diff', selected] as const,
    queryFn:
      selected === null || !options.enabled
        ? skipToken
        : () => agent.stub.getDiff({ path: selected }),
    retry: OPEN_RACE_RETRIES,
  })

  // A disabled query also reports `pending`; the gate, not the query, says the machine is away.
  if (!options.enabled) {
    return { changes: OFFLINE, selected, diff: OFFLINE, onSelect: setSelected }
  }
  const changes: ChangesView =
    list.status === 'success'
      ? { status: 'ready', files: list.data.files, branch: list.data.branch }
      : list.status === 'error'
        ? failed(() => void list.refetch())
        : { status: 'pending' }
  const fileDiff: FileDiffView =
    diff.status === 'success'
      ? { status: 'ready', diff: diff.data }
      : diff.status === 'error'
        ? failed(() => void diff.refetch())
        : { status: 'pending' }

  return { changes, selected, diff: fileDiff, onSelect: setSelected }
}

const OFFLINE = { status: 'offline' } as const

/**
 * The Host's conversation socket attaches moments after the browser identifies,
 * so the first read can find the machine "offline" for a few milliseconds.
 * Two retries at Query's default backoff cover that window. A machine that is
 * away for real never asks: `enabled` follows its connection status.
 */
const OPEN_RACE_RETRIES = 2

function failed(retry: () => void) {
  return { status: 'failed' as const, onRetry: retry }
}
