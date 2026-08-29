import { useVirtualizer, type Virtualizer } from '@tanstack/react-virtual'
import { useEffect, useLayoutEffect, useState, type RefObject } from 'react'

/** A row the transcript lays out. Keys are stable across reconcile, so measurements survive it. */
export type TranscriptRow = { readonly key: string }

/** The estimate for a row never measured; a large-side guess settles fastest (spike: 200–450 ms). */
const ESTIMATED_ROW_PX = 160
/** Rows rendered beyond the viewport on each side. */
const OVERSCAN = 6
/** A scroll that ends this close to the end means the reader wants the end again. */
const NEAR_END_PX = 80
/** A finger that moves down by more than this scrolls up; less is a tap. */
const TOUCH_SLOP_PX = 4

export type TranscriptVirtualizer = {
  readonly virtualizer: Virtualizer<HTMLDivElement, Element>
  /** True while the view follows the answer; false once the reader scrolls up. */
  readonly following: boolean
  readonly jumpToLatest: () => void
}

/**
 * Windows the transcript: only the rows near the viewport exist in the DOM.
 *
 * The library owns the offset (`anchorTo: 'end'`) and holds the view by key
 * when older rows are prepended. Following the answer is ours: the library
 * follows by distance only, and on iOS it defers its corrections while a
 * scroll is in progress, which a stream never lets end.
 */
export function useTranscriptVirtualizer(
  rows: readonly TranscriptRow[],
  scrollerRef: RefObject<HTMLDivElement | null>,
): TranscriptVirtualizer {
  const [following, setFollowing] = useState(true)

  // oxlint-disable-next-line react/incompatible-library -- the compiler skips memoizing this hook, which is what the virtualizer needs: its methods read live state.
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollerRef.current,
    getItemKey: (index) => rows[index]?.key ?? index,
    estimateSize: () => ESTIMATED_ROW_PX,
    overscan: OVERSCAN,
    anchorTo: 'end',
    // A row's first measure runs in the ref commit; React 19 refuses flushSync there and warns.
    useFlushSync: false,
  })
  const totalSize = virtualizer.getTotalSize()
  const { isScrolling } = virtualizer

  // Opens at the end, and stays there while the answer grows.
  useLayoutEffect(() => {
    if (following) virtualizer.scrollToEnd()
  }, [virtualizer, following, totalSize])

  // On iOS the library applies its corrections late, in one move; land at the end after it.
  useEffect(() => {
    if (following && !isScrolling) virtualizer.scrollToEnd()
  }, [virtualizer, following, isScrolling])

  // The keyboard shrinks the scroller; a following reader stays at the end.
  useEffect(() => {
    const scroller = scrollerRef.current
    if (scroller === null || !following) return undefined
    const observer = new ResizeObserver(() => {
      virtualizer.scrollToEnd()
    })
    observer.observe(scroller)
    return () => {
      observer.disconnect()
    }
  }, [scrollerRef, virtualizer, following])

  // Intent comes from input, not from scroll events: the library's corrections also scroll.
  useEffect(() => {
    const scroller = scrollerRef.current
    if (scroller === null) return undefined
    const stop = () => {
      setFollowing(false)
    }
    let touchStartY = 0
    let lastTop = scroller.scrollTop
    const onWheel = (event: WheelEvent) => {
      if (event.deltaY < 0) stop()
    }
    const onTouchStart = (event: TouchEvent) => {
      touchStartY = event.touches[0]?.clientY ?? 0
    }
    const onTouchMove = (event: TouchEvent) => {
      const y = event.touches[0]?.clientY ?? touchStartY
      if (y > touchStartY + TOUCH_SLOP_PX) stop()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowUp' || event.key === 'PageUp' || event.key === 'Home') stop()
    }
    // A scroll toward the end that lands near it means the reader wants the end again.
    const onScroll = () => {
      const distance = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight
      if (scroller.scrollTop >= lastTop && distance <= NEAR_END_PX) setFollowing(true)
      lastTop = scroller.scrollTop
    }
    const passive = { passive: true } as const
    scroller.addEventListener('wheel', onWheel, passive)
    scroller.addEventListener('touchstart', onTouchStart, passive)
    scroller.addEventListener('touchmove', onTouchMove, passive)
    scroller.addEventListener('keydown', onKeyDown)
    scroller.addEventListener('scroll', onScroll, passive)
    return () => {
      scroller.removeEventListener('wheel', onWheel)
      scroller.removeEventListener('touchstart', onTouchStart)
      scroller.removeEventListener('touchmove', onTouchMove)
      scroller.removeEventListener('keydown', onKeyDown)
      scroller.removeEventListener('scroll', onScroll)
    }
  }, [scrollerRef])

  return {
    virtualizer,
    following,
    jumpToLatest: () => {
      setFollowing(true)
    },
  }
}
