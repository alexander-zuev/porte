import { useEffect, useRef, useState } from 'react'

import { PairingSignInNotice } from '#/features/auth/components/pairing-sign-in-notice.tsx'
import type { SocialProvider } from '#/lib/auth/social-provider.ts'
import { DashboardPage } from '#/pages/dashboard/dashboard-page.tsx'
import { PairPage } from '#/pages/pair/pair-page.tsx'
import { SignInPage } from '#/pages/sign-in/sign-in-page.tsx'

import { sessions } from '../fixtures/sessions.ts'

const HOST = {
  name: "Alex's MacBook Pro",
  platform: 'macOS · Porte CLI',
} as const

const ACCOUNT = 'a•••@example.com'
const PHRASE = 'quiet cedar seven'
const INVALID_CODE = 'ZZZZZZ'

/** Starting screen for a playable pairing story. */
export type PairingPlayStart =
  | 'sign-in'
  | 'validating'
  | 'confirm'
  | 'confirming'
  | 'waiting-for-desktop'
  | 'success'
  | 'expired'
  | 'code-entry'
  | 'invalid-code'

type Screen =
  | { readonly kind: 'sign-in'; readonly pendingProvider: SocialProvider | undefined }
  | { readonly kind: 'validating' }
  | { readonly kind: 'confirm'; readonly pending: boolean }
  | { readonly kind: 'waiting' }
  | { readonly kind: 'success' }
  | { readonly kind: 'expired' }
  | {
      readonly kind: 'code'
      readonly code: string
      readonly error: string | undefined
      readonly pending: boolean
    }
  | { readonly kind: 'home'; readonly paired: boolean }

function initialScreen(start: PairingPlayStart): Screen {
  switch (start) {
    case 'sign-in':
      return { kind: 'sign-in', pendingProvider: undefined }
    case 'validating':
      return { kind: 'validating' }
    case 'confirm':
      return { kind: 'confirm', pending: false }
    case 'confirming':
      return { kind: 'confirm', pending: true }
    case 'waiting-for-desktop':
      return { kind: 'waiting' }
    case 'success':
      return { kind: 'success' }
    case 'expired':
      return { kind: 'expired' }
    case 'code-entry':
      return { kind: 'code', code: '', error: undefined, pending: false }
    case 'invalid-code':
      return {
        kind: 'code',
        code: INVALID_CODE,
        error: 'That code is expired or already used',
        pending: false,
      }
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
  const [allowRemote, setAllowRemote] = useState(simulateRemote)
  const progressConfirm = useRef(false)
  const timers = useRef<number[]>([])

  function later(fn: () => void, ms: number) {
    const timer = window.setTimeout(fn, ms)
    timers.current.push(timer)
  }

  useEffect(() => {
    return () => {
      for (const timer of timers.current) window.clearTimeout(timer)
    }
  }, [])

  useEffect(() => {
    if (!allowRemote || screen.kind !== 'validating') return
    const timer = window.setTimeout(() => {
      setScreen({ kind: 'confirm', pending: false })
    }, 800)
    return () => {
      window.clearTimeout(timer)
    }
  }, [allowRemote, screen])

  useEffect(() => {
    if (screen.kind !== 'confirm' || !screen.pending || !progressConfirm.current) return
    const timer = window.setTimeout(() => {
      setScreen({ kind: 'waiting' })
    }, 600)
    return () => {
      window.clearTimeout(timer)
    }
  }, [screen])

  useEffect(() => {
    if (!allowRemote || screen.kind !== 'waiting') return
    const timer = window.setTimeout(() => {
      setScreen({ kind: 'success' })
    }, 1400)
    return () => {
      window.clearTimeout(timer)
    }
  }, [allowRemote, screen])

  if (screen.kind === 'sign-in') {
    return (
      <SignInPage
        error={undefined}
        notice={<PairingSignInNotice />}
        pendingProvider={screen.pendingProvider}
        onSocial={(provider) => {
          setScreen({ kind: 'sign-in', pendingProvider: provider })
          later(() => {
            setAllowRemote(true)
            setScreen({ kind: 'validating' })
          }, 700)
        }}
      />
    )
  }

  if (screen.kind === 'home') {
    return (
      <DashboardPage
        online={screen.paired}
        sessions={screen.paired ? sessions : []}
        onOpenSession={() => undefined}
        onStartSession={() => undefined}
      />
    )
  }

  if (screen.kind === 'validating') {
    return <PairPage view="validating" />
  }

  if (screen.kind === 'confirm') {
    return (
      <PairPage
        accountLabel={ACCOUNT}
        host={HOST}
        pending={screen.pending}
        verificationPhrase={PHRASE}
        view="confirm"
        onCancel={() => {
          setScreen({ kind: 'home', paired: false })
        }}
        onConfirm={() => {
          progressConfirm.current = true
          setAllowRemote(true)
          setScreen({ kind: 'confirm', pending: true })
        }}
      />
    )
  }

  if (screen.kind === 'waiting') {
    return (
      <PairPage
        host={HOST}
        verificationPhrase={PHRASE}
        view="waiting-for-desktop"
        onCancel={() => {
          setScreen({ kind: 'home', paired: false })
        }}
      />
    )
  }

  if (screen.kind === 'success') {
    return (
      <PairPage
        host={HOST}
        view="success"
        onContinue={() => {
          setScreen({ kind: 'home', paired: true })
        }}
      />
    )
  }

  if (screen.kind === 'expired') {
    return (
      <PairPage
        view="expired"
        onEnterCode={() => {
          setScreen({ kind: 'code', code: '', error: undefined, pending: false })
        }}
      />
    )
  }

  return (
    <PairPage
      code={screen.code}
      error={screen.error}
      pending={screen.pending}
      view="code-entry"
      onCodeChange={(code) => {
        setScreen({ kind: 'code', code, error: undefined, pending: false })
      }}
      onSubmit={() => {
        if (screen.code === INVALID_CODE) {
          setScreen({
            kind: 'code',
            code: screen.code,
            error: 'That code is expired or already used',
            pending: false,
          })
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
    return (
      <DashboardPage
        online={false}
        sessions={[]}
        onOpenSession={() => undefined}
        onStartSession={() => undefined}
      />
    )
  }

  return (
    <SignInPage
      error={undefined}
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
