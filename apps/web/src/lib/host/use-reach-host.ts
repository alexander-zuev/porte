import { useQueryClient } from '@tanstack/react-query'
import { hostQueries } from '@web/entities/host/host-queries.ts'
import { useRelay, useRelayReadyState } from '@web/entities/host/relay-context.tsx'
import { useEffect, useState } from 'react'

export type ReachHost = {
  readonly reconnecting: boolean
  readonly onReconnect: () => void
}

/** How often to look again while somebody is waiting on the answer. */
const LOOK_EVERY_MS = 2000

/**
 * How long to keep looking after one press.
 *
 * A Mac woken from sleep takes a few seconds to dial back in. Stopping sooner
 * would report failure just before it succeeds; going forever would spend a
 * phone's battery on a machine that is switched off.
 */
const LOOK_FOR_MS = 12_000

/**
 * Ask again whether the Mac is back.
 *
 * Nothing polls on its own. The relay broadcasts `host.status` as soon as the
 * daemon connects, so a waiting screen leaves by itself.
 *
 * This is for the case that push cannot cover: our own socket died while the
 * phone slept, so no broadcast can arrive and the screen would say offline
 * forever. Pressing reopens the line when the line is what is down, then reads
 * the status until it changes or the window closes.
 *
 * The browser cannot reconnect the Mac itself. The daemon dials out, so all
 * anyone here can do is look again.
 */
export function useReachHost(): ReachHost {
  const queryClient = useQueryClient()
  const relay = useRelay()
  const readyState = useRelayReadyState()
  const [looking, setLooking] = useState(false)

  useEffect(() => {
    if (!looking) return

    const look = () => {
      void queryClient.refetchQueries({ queryKey: hostQueries.status().queryKey })
    }

    look()
    const repeat = setInterval(look, LOOK_EVERY_MS)
    // The screen unmounts the moment the Mac answers, so this only fires when
    // it never did.
    const giveUpLooking = setTimeout(() => {
      setLooking(false)
    }, LOOK_FOR_MS)

    return () => {
      clearInterval(repeat)
      clearTimeout(giveUpLooking)
    }
  }, [looking, queryClient])

  return {
    reconnecting: looking,
    onReconnect: () => {
      if (readyState !== WebSocket.OPEN) relay.connect()
      setLooking(true)
    },
  }
}
