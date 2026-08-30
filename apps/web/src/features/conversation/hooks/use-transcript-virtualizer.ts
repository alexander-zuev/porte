import { useVirtualizer, type Virtualizer } from '@tanstack/react-virtual'
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'

/** A row the transcript lays out. Keys are stable across reconcile, so measurements survive it. */
export type TranscriptRow = { readonly key: string }

/** The estimate for a row never measured; a large-side guess settles fastest (spike: 200–450 ms). */
const ESTIMATED_ROW_PX = 160
/** Rows rendered beyond the viewport on each side. */
const OVERSCAN = 6
/** A scroll toward the end that lands this close to it means the reader wants the end again. */
const NEAR_END_PX = 80
/** A finger that moves down the screen by more than this scrolls up; less is a tap. */
const TOUCH_SLOP_PX = 4

export type TranscriptVirtualizer = {
  readonly virtualizer: Virtualizer<HTMLDivElement, Element>
  /** The runway inside the scroller; the library sizes it and places rows in it. */
  readonly runwayRef: (node: HTMLDivElement | null) => void
  /** True while the view follows the answer; false once the reader scrolls up. */
  readonly following: boolean
  readonly jumpToLatest: () => void
}

/**
 * Windows the transcript: only the rows near the viewport exist in the DOM.
 *
 * The library owns the offset (`anchorTo: 'end'`), writes row offsets and the
 * runway height itself, and holds the view by key when older rows are
 * prepended. Following the answer is ours: the library follows by distance
 * only, and on iOS it defers its corrections while a scroll is in progress,
 * which a stream never lets end.
 */
export function useTranscriptVirtualizer(
  rows: readonly TranscriptRow[],
  scrollerRef: RefObject<HTMLDivElement | null>,
): TranscriptVirtualizer {
  // The ref is the fact, read synchronously by DOM callbacks; the state paints the button.
  const followingRef = useRef(true)
  const [following, setFollowingState] = useState(true)
  const setFollowing = (next: boolean) => {
    followingRef.current = next
    setFollowingState(next)
  }

  // oxlint-disable-next-line react/incompatible-library -- the compiler skips this hook: it returns one mutable instance whose methods read live state.
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollerRef.current,
    getItemKey: (index) => rows[index]?.key ?? index,
    estimateSize: () => ESTIMATED_ROW_PX,
    overscan: OVERSCAN,
    anchorTo: 'end',
    // Positions land in the DOM with the scroll correction, never a render later.
    directDomUpdates: true,
    // A row's first measure runs in the ref commit; React 19 refuses flushSync there and warns.
    useFlushSync: false,
  })
  const { isScrolling } = virtualizer

  const runwayRef = useRef<HTMLDivElement | null>(null)
  const setRunway = (node: HTMLDivElement | null) => {
    runwayRef.current = node
    virtualizer.containerRef(node)
  }

  // Opens at the end, and returns to it on tap.
  useLayoutEffect(() => {
    if (following) virtualizer.scrollToEnd()
  }, [virtualizer, following])

  // On iOS the library applies its corrections late, in one move; land at the end after it.
  useEffect(() => {
    if (following && !isScrolling) virtualizer.scrollToEnd()
  }, [virtualizer, following, isScrolling])

  // The runway grows with the answer; the keyboard shrinks the scroller. A following reader stays at the end.
  useEffect(() => {
    const scroller = scrollerRef.current
    const runway = runwayRef.current
    if (scroller === null || runway === null) return undefined
    const observer = new ResizeObserver(() => {
      if (followingRef.current) virtualizer.scrollToEnd()
    })
    observer.observe(scroller)
    observer.observe(runway)
    return () => {
      observer.disconnect()
    }
  }, [scrollerRef, virtualizer])

  // Intent comes from input, not from scroll events alone: the library's corrections also scroll.
  useEffect(() => {
    const scroller = scrollerRef.current
    if (scroller === null) return undefined
    // The reader's last direction. Only an input sets it: the library's corrections scroll too.
    let heading: 'up' | 'down' | null = null
    const stop = () => {
      heading = 'up'
      followingRef.current = false
      setFollowingState(false)
    }
    let pointerHeld = false
    let lastTop = scroller.scrollTop
    let touchY = 0
    const onWheel = (event: WheelEvent) => {
      if (event.deltaY < 0) stop()
      else if (event.deltaY > 0) heading = 'down'
    }
    const onTouchStart = (event: TouchEvent) => {
      touchY = event.touches[0]?.clientY ?? 0
    }
    const onTouchMove = (event: TouchEvent) => {
      const y = event.touches[0]?.clientY ?? touchY
      // Anchored to the finger's turning point, so a slow drag adds up and a reversal counts afresh.
      if (y > touchY + TOUCH_SLOP_PX) {
        stop()
        touchY = y
      } else if (y < touchY - TOUCH_SLOP_PX) {
        heading = 'down'
        touchY = y
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      const up =
        event.key === 'ArrowUp' ||
        event.key === 'PageUp' ||
        event.key === 'Home' ||
        (event.key === ' ' && event.shiftKey)
      const down =
        event.key === 'ArrowDown' ||
        event.key === 'PageDown' ||
        event.key === 'End' ||
        (event.key === ' ' && !event.shiftKey)
      if (up) stop()
      else if (down) heading = 'down'
    }
    // A held pointer is a scrollbar drag or a selection; the scroll under it is the reader's.
    const onPointerDown = () => {
      pointerHeld = true
    }
    const onPointerUp = () => {
      pointerHeld = false
    }
    const onScroll = () => {
      const top = scroller.scrollTop
      const backward = top < lastTop
      lastTop = top
      if (pointerHeld) {
        if (backward) stop()
        else heading = 'down'
      }
      if (heading === 'down' && !followingRef.current && virtualizer.isAtEnd(NEAR_END_PX)) {
        followingRef.current = true
        setFollowingState(true)
      }
    }
    const passive = { passive: true } as const
    scroller.addEventListener('wheel', onWheel, passive)
    scroller.addEventListener('touchstart', onTouchStart, passive)
    scroller.addEventListener('touchmove', onTouchMove, passive)
    scroller.addEventListener('keydown', onKeyDown)
    scroller.addEventListener('pointerdown', onPointerDown, passive)
    window.addEventListener('pointerup', onPointerUp, passive)
    window.addEventListener('pointercancel', onPointerUp, passive)
    scroller.addEventListener('scroll', onScroll, passive)
    return () => {
      scroller.removeEventListener('wheel', onWheel)
      scroller.removeEventListener('touchstart', onTouchStart)
      scroller.removeEventListener('touchmove', onTouchMove)
      scroller.removeEventListener('keydown', onKeyDown)
      scroller.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerUp)
      scroller.removeEventListener('scroll', onScroll)
    }
  }, [scrollerRef, virtualizer])

  return {
    virtualizer,
    runwayRef: setRunway,
    following,
    jumpToLatest: () => {
      setFollowing(true)
    },
  }
}
