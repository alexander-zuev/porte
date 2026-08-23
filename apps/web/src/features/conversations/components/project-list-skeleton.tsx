import { Skeleton } from '@web/ui/components/ui/skeleton.tsx'

/**
 * One waiting project: the folder row, then the conversations under it.
 *
 * Widths are written out rather than generated. A column of identical bars
 * reads as a chart, and fixing them by hand keeps the same shape on every
 * render instead of flickering to a new one.
 */
const GROUPS = [
  ['w-1/3', 'w-4/5', 'w-1/2'],
  ['w-1/4', 'w-2/3', 'w-11/12'],
  ['w-2/5', 'w-3/5', 'w-3/4'],
  ['w-1/5', 'w-5/6', 'w-1/2'],
  ['w-1/3', 'w-1/2', 'w-4/5'],
] as const

/**
 * The list before it has anything to list.
 *
 * Shaped like `ProjectList` and filling the frame, rather than one spinner in
 * the middle of an empty page. A page that is mostly nothing reads as broken
 * even when it is only early, and the real list then replaces this in place
 * instead of appearing where nothing was.
 *
 * More rows are drawn than a tall phone shows, and the extra are clipped. The
 * bottom fades so the last one reads as the list continuing rather than as the
 * list ending there.
 */
export function ProjectListSkeleton() {
  return (
    <output
      aria-busy
      aria-label="Loading projects"
      className="flex flex-1 flex-col overflow-hidden [mask-image:linear-gradient(to_bottom,black_65%,transparent)]"
    >
      {/* Matches the `h5` heading's height and bottom padding exactly, so the
          word "Projects" lands where its placeholder was. */}
      <div className="flex h-6 items-center pb-1">
        <Skeleton className="h-3.5 w-16" />
      </div>

      {GROUPS.map(([folder, ...conversations]) => (
        // Two groups can share a folder width, so the whole row is the identity.
        <div key={`${folder} ${conversations.join(' ')}`} className="flex flex-col">
          <div className="flex min-h-11 items-center gap-2">
            <Skeleton className="size-4 shrink-0 rounded-sm" />
            <Skeleton className={`h-3.5 ${folder}`} />
          </div>

          {conversations.map((width) => (
            <div key={width} className="flex min-h-11 items-center">
              <Skeleton className={`h-3.5 ${width}`} />
            </div>
          ))}
        </div>
      ))}
    </output>
  )
}
