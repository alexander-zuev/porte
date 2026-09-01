import { useQuery } from '@tanstack/react-query'
import { hostQueries } from '@web/entities/host/host-queries.ts'
import { useCallback, useSyncExternalStore } from 'react'
import { z } from 'zod'

import { deriveNotifications, type PorteNotification } from '../models/notifications.ts'

/** Per-browser convenience only; clearing storage resurfaces still-true notifications. */
const DISMISSED_KEY = 'porte.notifications.dismissed'
const listeners = new Set<() => void>()

function readDismissed(): string {
  try {
    return localStorage.getItem(DISMISSED_KEY) ?? '[]'
  } catch {
    return '[]'
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const DismissedIdsSchema = z.array(z.string())

/** Own writes only, so the shape is known; anything else counts as nothing dismissed. */
function parseIds(raw: string): string[] {
  try {
    return DismissedIdsSchema.parse(JSON.parse(raw))
  } catch {
    return []
  }
}

export type Notifications = {
  /** Only what is not dismissed; the menu dot shows while any remain. */
  readonly notifications: readonly PorteNotification[]
  readonly unread: number
  readonly dismiss: (id: string) => void
}

/** What needs the person right now, derived from the host read the app already makes. */
export function useNotifications(): Notifications {
  const account = useQuery(hostQueries.forAccount())
  const dismissedRaw = useSyncExternalStore(subscribe, readDismissed, () => '[]')
  const dismissed = new Set(parseIds(dismissedRaw))
  const notifications = deriveNotifications(account.data).filter(
    (notification) => !dismissed.has(notification.id),
  )

  const dismiss = useCallback((id: string) => {
    try {
      const next = [...new Set([...parseIds(readDismissed()), id])]
      localStorage.setItem(DISMISSED_KEY, JSON.stringify(next))
    } catch {
      return
    }
    for (const listener of listeners) listener()
  }, [])

  return { notifications, unread: notifications.length, dismiss }
}
