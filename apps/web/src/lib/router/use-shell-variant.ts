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
 */
export function usePublicShellVariant(fallback: PublicShellVariant): PublicShellVariant {
  return useChildMatches({
    select: (matches) => matches.at(-1)?.staticData.publicShell ?? fallback,
  })
}

export function useAppShellVariant(fallback: AppShellVariant): AppShellVariant {
  return useChildMatches({
    select: (matches) => matches.at(-1)?.staticData.appShell ?? fallback,
  })
}
