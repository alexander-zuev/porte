import { Drawer as DrawerPrimitive } from '@base-ui/react/drawer'
import { XIcon } from '@phosphor-icons/react'
import { cn } from '@web/lib/utils.ts'
import * as React from 'react'

/**
 * A panel that slides from the bottom, and closes when swiped down.
 *
 * Separate from `Sheet`, which is a dialog pinned to an edge: it nudges by a
 * couple of rem and has no gesture. This one travels the whole way and follows
 * a thumb, which is what a phone expects from something anchored to the bottom.
 */
function Drawer({ ...props }: DrawerPrimitive.Root.Props) {
  return <DrawerPrimitive.Root data-slot="drawer" {...props} />
}

function DrawerTrigger({ ...props }: DrawerPrimitive.Trigger.Props) {
  return <DrawerPrimitive.Trigger data-slot="drawer-trigger" {...props} />
}

function DrawerClose({ ...props }: DrawerPrimitive.Close.Props) {
  return <DrawerPrimitive.Close data-slot="drawer-close" {...props} />
}

/** The one close affordance every sheet shares: a soft round target the thumb can hit. */
function DrawerCloseButton({ className, ...props }: DrawerPrimitive.Close.Props) {
  return (
    <DrawerPrimitive.Close
      aria-label="Close"
      data-slot="drawer-close-button"
      className={cn(
        'flex size-12 shrink-0 items-center justify-center rounded-full border bg-secondary text-foreground transition-colors hover:bg-secondary/80',
        className,
      )}
      {...props}
    >
      <XIcon aria-hidden className="size-6" />
    </DrawerPrimitive.Close>
  )
}

function DrawerPortal({ ...props }: DrawerPrimitive.Portal.Props) {
  return <DrawerPrimitive.Portal data-slot="drawer-portal" {...props} />
}

/** Dims in step with the gesture, so a half-swipe looks half-dismissed. */
function DrawerOverlay({ className, ...props }: DrawerPrimitive.Backdrop.Props) {
  return (
    <DrawerPrimitive.Backdrop
      data-slot="drawer-overlay"
      className={cn(
        'fixed inset-0 z-50 min-h-dvh bg-overlay/10 supports-backdrop-filter:backdrop-blur-xs',
        'opacity-[calc(1-var(--drawer-swipe-progress))]',
        DRAWER_TRANSITION,
        'transition-opacity data-swiping:duration-0',
        'data-ending-style:opacity-0 data-starting-style:opacity-0',
        'data-ending-style:duration-[calc(var(--drawer-swipe-strength)*400ms)]',
        className,
      )}
      {...props}
    />
  )
}

/**
 * The panel itself: a floating card with margins on every side, the sheet at
 * step 2 of the surface scale so its cards can sit one step above it.
 */
function DrawerContent({ className, children, ...props }: DrawerPrimitive.Popup.Props) {
  return (
    <DrawerPortal>
      <DrawerOverlay />
      <DrawerPrimitive.Viewport
        data-slot="drawer-viewport"
        className="fixed inset-0 z-50 flex items-end justify-center p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]"
      >
        <DrawerPrimitive.Popup
          data-slot="drawer-content"
          className={cn(
            // Held to the app's own measure. Full width past that reads as a
            // page taking over rather than a panel belonging to this column.
            'w-full max-w-2xl max-h-[85dvh]',
            'flex flex-col overflow-y-auto overscroll-contain rounded-3xl border',
            'bg-surface bg-clip-padding text-sm text-popover-foreground shadow-lg outline-none',
            'pt-2 pb-4',
            'touch-auto [transform:translateY(var(--drawer-swipe-movement-y))]',
            DRAWER_TRANSITION,
            'transition-transform data-swiping:select-none',
            'data-starting-style:[transform:translateY(calc(100%+2rem))]',
            'data-ending-style:[transform:translateY(calc(100%+2rem))]',
            'data-ending-style:duration-[calc(var(--drawer-swipe-strength)*400ms)]',
            className,
          )}
          {...props}
        >
          <DrawerHandle />
          <DrawerPrimitive.Content data-slot="drawer-body" className="flex flex-col gap-4">
            {children}
          </DrawerPrimitive.Content>
        </DrawerPrimitive.Popup>
      </DrawerPrimitive.Viewport>
    </DrawerPortal>
  )
}

/** The grab bar. Decoration: the whole panel is draggable, not just this. */
function DrawerHandle() {
  return (
    <div
      aria-hidden
      className="mx-auto mt-1 mb-4 h-1.5 w-12 shrink-0 rounded-full bg-border-interactive"
    />
  )
}

/**
 * The one body every sheet opens with: a fixed height that scrolls inside,
 * so a sheet is the same surface whether it holds one line or a file.
 */
function DrawerBody({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="drawer-body-fixed"
      className={cn('h-[55dvh] overflow-y-auto overscroll-contain px-4 pt-3', className)}
      {...props}
    />
  )
}

function DrawerHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="drawer-header"
      className={cn('flex flex-col gap-1 px-4', className)}
      {...props}
    />
  )
}

function DrawerFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="drawer-footer"
      className={cn('mt-auto flex flex-col gap-2 px-4', className)}
      {...props}
    />
  )
}

function DrawerTitle({ className, ...props }: DrawerPrimitive.Title.Props) {
  return (
    <DrawerPrimitive.Title
      data-slot="drawer-title"
      className={cn('font-medium text-foreground', className)}
      {...props}
    />
  )
}

function DrawerDescription({ className, ...props }: DrawerPrimitive.Description.Props) {
  return (
    <DrawerPrimitive.Description
      data-slot="drawer-description"
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  )
}

/**
 * The iOS sheet curve, shared by the panel and the backdrop so they arrive together.
 *
 * `motion-reduce` drops the travel rather than the drawer: the panel still
 * appears, it just does not slide.
 */
const DRAWER_TRANSITION =
  'duration-[450ms] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none'

export {
  Drawer,
  DrawerTrigger,
  DrawerClose,
  DrawerCloseButton,
  DrawerContent,
  DrawerBody,
  DrawerHeader,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
}
