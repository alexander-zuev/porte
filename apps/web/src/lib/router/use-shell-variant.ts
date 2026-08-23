import { useChildMatches } from '@tanstack/react-router'
import type { AppShellVariant } from '@web/ui/components/layout/app-shell.tsx'
import type { PublicShellVariant } from '@web/ui/components/layout/public-shell.tsx'

declare module '@tanstack/react-router' {
  interface StaticDataRouteOption {
    /** Shape this page asks its public shell for. */
    readonly publicShell?: PublicShellVariant
    /** Shape this page asks its app shell for. */
    readonly appShell?: AppShellVariant
  }
}

/**
 * Read the shape the matched page asked for.
 *
 * A child cannot pass props to the layout that renders its `Outlet`, so it
 * states the shape in `staticData` instead. Read during render, so the shell
 * never paints the wrong shape first.
 *
 * The deepest declaration wins, not the deepest match: a layout route can shape
 * every step under it without each leaf repeating the same word.
 */
export function usePublicShellVariant(fallback: PublicShellVariant): PublicShellVariant {
  return useChildMatches({
    select: (matches) =>
      matches.findLast((match) => match.staticData.publicShell)?.staticData.publicShell ?? fallback,
  })
}

export function useAppShellVariant(fallback: AppShellVariant): AppShellVariant {
  return useChildMatches({
    select: (matches) =>
      matches.findLast((match) => match.staticData.appShell)?.staticData.appShell ?? fallback,
  })
}
