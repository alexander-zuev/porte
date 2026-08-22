import { PairingOriginSchema, type PairedHost, type PairingOrigin } from '@porte/core/client'
import { PairingSignInNotice } from '@web/features/auth/components/pairing-sign-in-notice.tsx'
import type { PairingIssue } from '@web/features/pair/components/pairing-flow.tsx'
import type { SocialProvider } from '@web/lib/auth/social-provider.ts'
import {
  ConversationsPage,
  type ConversationsPageProps,
} from '@web/pages/conversations/conversations-page.tsx'
import { PairPage } from '@web/pages/pair/pair-page.tsx'
import { SignInPage } from '@web/pages/sign-in/sign-in-page.tsx'
import { useEffect, useRef, useState } from 'react'

import { conversations } from '../fixtures/conversations.ts'

const ACCOUNT = 'a•••@example.com'
const EXPIRED_CODE = 'ZZZZZZZZ'

/** The code was asked for on the machine now approving it. */
const SAME_DEVICE: PairingOrigin = PairingOriginSchema.parse({
  origin: 'this-device',
  requestedAt: '2026-08-20T15:23:00.000Z',
})

const HOST = {
  name: "Alex's MacBook Pro",
  platform: 'darwin',
  lastSeenAt: null,
} satisfies PairedHost

/** Where every pairing journey lands. Only a paired Mac has conversations to list. */
function homeList(paired: boolean) {
  return {
    host: HOST,
    reach: { reconnecting: false, onReconnect: () => undefined },
    connection: paired ? 'online' : 'offline',
    conversationList: {
      status: 'ready',
      conversations: paired ? conversations : [],
      hasMore: false,
      isLoadingMore: false,
      onLoadMore: () => undefined,
    },
  } satisfies ConversationsPageProps
}

/** Starting screen for a playable pairing story. */
export type PairingPlayStart =
  | 'sign-in'
  | 'code-entry'
  | 'expired-code'
  | 'confirm'
  | 'approved'
  | 'denied'
  | PairingIssue

type Screen =
  | { readonly kind: 'sign-in'; readonly pendingProvider: SocialProvider | undefined }
  | {
      readonly kind: 'code'
      readonly code: string
      readonly error: string | undefined
      readonly pending: boolean
    }
  | { readonly kind: 'confirm'; readonly pending: boolean }
  | { readonly kind: 'approved' }
  | { readonly kind: 'denied' }
  | { readonly kind: 'issue'; readonly issue: PairingIssue }
  | { readonly kind: 'home'; readonly paired: boolean }

const EMPTY_CODE = { kind: 'code', code: '', error: undefined, pending: false } as const

function initialScreen(start: PairingPlayStart): Screen {
  switch (start) {
    case 'sign-in':
      return { kind: 'sign-in', pendingProvider: undefined }
    case 'code-entry':
      return EMPTY_CODE
    case 'expired-code':
      return {
        kind: 'code',
        code: EXPIRED_CODE,
        error: 'That code is expired or already used',
        pending: false,
      }
    case 'confirm':
      return { kind: 'confirm', pending: false }
    case 'approved':
      return { kind: 'approved' }
    case 'denied':
      return { kind: 'denied' }
    default:
      return { kind: 'issue', issue: start }
  }
}

/** Playable pairing journey that follows real page destinations. */
export function PairingPlay({
  start,
  simulateRemote = false,
}: {
  readonly start: PairingPlayStart
  readonly simulateRemote?: boolean
}) {
  const [screen, setScreen] = useState<Screen>(() => initialScreen(start))
  const timers = useRef<number[]>([])

  function later(fn: () => void, ms: number) {
    timers.current.push(window.setTimeout(fn, ms))
  }

  useEffect(() => {
    return () => {
      for (const timer of timers.current) window.clearTimeout(timer)
    }
  }, [])

  // The daemon only learns of the approval on its next poll, so the approved
  // screen holds before the dashboard has a Mac to show.
  useEffect(() => {
    if (!simulateRemote || screen.kind !== 'approved') return
    const timer = window.setTimeout(() => {
      setScreen({ kind: 'home', paired: true })
    }, 1400)
    return () => {
      window.clearTimeout(timer)
    }
  }, [simulateRemote, screen])

  if (screen.kind === 'sign-in') {
    return (
      <SignInPage
        notice={<PairingSignInNotice />}
        pendingProvider={screen.pendingProvider}
        onSocial={(provider) => {
          setScreen({ kind: 'sign-in', pendingProvider: provider })
          later(() => {
            setScreen(EMPTY_CODE)
          }, 700)
        }}
      />
    )
  }

  if (screen.kind === 'home') {
    return <ConversationsPage {...homeList(screen.paired)} />
  }

  if (screen.kind === 'confirm') {
    return (
      <PairPage
        accountLabel={ACCOUNT}
        pending={screen.pending}
        requestedFrom={SAME_DEVICE}
        view="confirm"
        onApprove={() => {
          setScreen({ kind: 'confirm', pending: true })
          later(() => {
            setScreen({ kind: 'approved' })
          }, 600)
        }}
        onDeny={() => {
          setScreen({ kind: 'denied' })
        }}
      />
    )
  }

  if (screen.kind === 'approved') return <PairPage view="approved" />
  if (screen.kind === 'denied') return <PairPage view="denied" />

  if (screen.kind === 'issue') {
    return (
      <PairPage
        issue={screen.issue}
        view="issue"
        onCancel={() => {
          setScreen({ kind: 'home', paired: false })
        }}
        onRestart={() => {
          setScreen(EMPTY_CODE)
        }}
      />
    )
  }

  return (
    <PairPage
      accountLabel={ACCOUNT}
      code={screen.code}
      error={screen.error}
      pending={screen.pending}
      view="code-entry"
      onCodeChange={(code) => {
        setScreen({ kind: 'code', code, error: undefined, pending: false })
      }}
      onSubmit={() => {
        if (screen.code === EXPIRED_CODE) {
          setScreen({ kind: 'issue', issue: 'expired' })
          return
        }
        setScreen({ kind: 'code', code: screen.code, error: undefined, pending: true })
        later(() => {
          setScreen({ kind: 'confirm', pending: false })
        }, 600)
      }}
    />
  )
}

/** Playable sign-in that continues to an empty home after a provider click. */
export function SignInPlay() {
  const [pendingProvider, setPendingProvider] = useState<SocialProvider>()
  const [signedIn, setSignedIn] = useState(false)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => {
    return () => {
      if (timer.current !== undefined) window.clearTimeout(timer.current)
    }
  }, [])

  if (signedIn) {
    return <ConversationsPage {...homeList(false)} />
  }

  return (
    <SignInPage
      pendingProvider={pendingProvider}
      onSocial={(provider) => {
        setPendingProvider(provider)
        timer.current = window.setTimeout(() => {
          setSignedIn(true)
        }, 700)
      }}
    />
  )
}
