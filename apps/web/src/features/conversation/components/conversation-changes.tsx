import {
  CaretRightIcon,
  FolderSimpleIcon,
  GitBranchIcon,
  GitDiffIcon,
  MinusSquareIcon,
  PlusSquareIcon,
  SlidersHorizontalIcon,
  SquareIcon,
  WarningIcon,
} from '@phosphor-icons/react'
import type { ChangedFile, ChangedFilePath, ChangedFileStatus } from '@porte/core/client'
import {
  ChangeCount,
  SHEET_PANEL,
  SheetHeader,
} from '@web/features/conversation/components/tool-run.tsx'
import {
  DEFAULT_CHANGES_LAYOUT,
  changeTotals,
  changesList,
  changesTree,
  groupChanges,
  patchRows,
  splitPath,
  type ChangesLayout,
  type ChangesView,
  type FileDiffView,
} from '@web/features/conversation/models/changes.ts'
import { cn } from '@web/lib/utils.ts'
import {
  DiffBlock,
  ToolRowButton,
  toolRowClass,
} from '@web/ui/components/ai-elements/tool-output.tsx'
import { Button } from '@web/ui/components/ui/button.tsx'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@web/ui/components/ui/collapsible.tsx'
import { Drawer, DrawerBody, DrawerContent, DrawerTrigger } from '@web/ui/components/ui/drawer.tsx'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@web/ui/components/ui/dropdown-menu.tsx'
import { Skeleton } from '@web/ui/components/ui/skeleton.tsx'
import { useState, type CSSProperties, type ReactNode } from 'react'

export type ConversationChangesProps = {
  readonly changes: ChangesView
  /** The tapped file, or none: the sheet shows the list. */
  readonly selected: ChangedFilePath | null
  /** The tapped file's diff; not read while nothing is selected. */
  readonly diff: FileDiffView
  readonly onSelect: (path: ChangedFilePath | null) => void
  /** Story-only: open the sheet on first paint. */
  readonly defaultOpen?: boolean
}

/**
 * The changes pill above the composer and the sheet behind it.
 *
 * One surface on every device: the pill says how much of the tree is
 * uncommitted, the sheet lists the files, and a tapped file pushes its diff in
 * from the right the way a tool run's sheet does. Spec: docs/diff-sheet.md.
 */
export function ConversationChanges({
  changes,
  selected,
  diff,
  onSelect,
  defaultOpen = false,
}: ConversationChangesProps) {
  const [open, setOpen] = useState(defaultOpen)
  const [layout, setLayout] = useState<ChangesLayout>(DEFAULT_CHANGES_LAYOUT)
  // No machine to ask: the composer already says so, the pill stays away.
  if (changes.status === 'offline') return null
  // The pill's own shape while the machine is asked, so the strip does not jump when it lands.
  if (changes.status === 'pending') {
    return (
      <div className="flex justify-end">
        <Skeleton className="h-8 w-40 rounded-md" />
      </div>
    )
  }
  if (changes.status === 'failed') {
    return (
      <div className="flex justify-end">
        <Button size="sm" variant="outline" onClick={changes.onRetry}>
          <WarningIcon aria-hidden className="text-destructive-muted-foreground" />
          Could not read diff
        </Button>
      </div>
    )
  }
  if (changes.files.length === 0) return null
  const totals = changeTotals(changes.files)
  const title = selected === null ? 'Diff' : splitPath(selected).name

  // Right-aligned, where the queue pill sits: the composer's own row stays clear on the left.
  return (
    <div className="flex justify-end">
      <Drawer
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          // Closing forgets the file, so the next open starts at the list.
          if (!next) onSelect(null)
        }}
      >
        <DrawerTrigger render={<Button aria-label="Open diff" size="sm" variant="outline" />}>
          <GitDiffIcon aria-hidden className="text-muted-foreground" />
          <span className="tabular-nums">
            {totals.files} {totals.files === 1 ? 'file' : 'files'}
          </span>
          <ChangeCount change={totals} />
        </DrawerTrigger>
        <DrawerContent>
          <SheetHeader
            title={title}
            // The one fact the phone cannot see otherwise: which branch Grok writes to.
            subtitle={
              selected === null ? (
                <small className="flex max-w-full items-center gap-1.5 font-mono text-muted-foreground">
                  <GitBranchIcon aria-hidden className="size-3.5 shrink-0" />
                  <span className="truncate">{changes.branch ?? 'detached HEAD'}</span>
                </small>
              ) : undefined
            }
            action={
              selected === null ? <LayoutMenu layout={layout} onChange={setLayout} /> : undefined
            }
            onBack={
              selected === null
                ? undefined
                : () => {
                    onSelect(null)
                  }
            }
          />
          <DrawerBody className="relative overflow-hidden px-0 pt-0">
            <div
              inert={selected !== null}
              className={cn(
                SHEET_PANEL,
                'flex flex-col gap-4 pt-3',
                selected !== null && '-translate-x-1/3',
              )}
            >
              {groupChanges(changes.files, layout.group).map((section) => {
                {
                  /* The same card a folded tool run opens into: hairline rows, one file each. */
                }
                const card = (
                  <div className="divide-y rounded-xl border">
                    {layout.view === 'tree' ? (
                      <TreeRows files={section.files} onSelect={onSelect} />
                    ) : (
                      changesList(section.files, layout.sort).map((file) => (
                        <FileRow
                          key={file.path}
                          depth={0}
                          file={file}
                          showDirectory
                          onSelect={() => {
                            onSelect(file.path)
                          }}
                        />
                      ))
                    )}
                  </div>
                )
                if (layout.group === 'none') return <section key={section.title}>{card}</section>
                // Each section folds under its heading, the way Zed's Tracked and Untracked do.
                return (
                  <Collapsible
                    key={section.title}
                    defaultOpen
                    className="group flex flex-col gap-2"
                  >
                    <CollapsibleTrigger className={cn(toolRowClass, 'min-h-9 px-1')}>
                      <CaretRightIcon
                        aria-hidden
                        className="size-3 shrink-0 transition-transform duration-150 ease-out group-data-panel-open:rotate-90 motion-reduce:transition-none"
                      />
                      <small>{section.title}</small>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="outline-none">{card}</CollapsibleContent>
                  </Collapsible>
                )
              })}
            </div>
            <div
              inert={selected === null}
              className={cn(SHEET_PANEL, 'pt-3', selected === null && 'translate-x-full')}
            >
              {selected === null ? null : <DiffPanel path={selected} diff={diff} />}
            </div>
          </DrawerBody>
        </DrawerContent>
      </Drawer>
    </div>
  )
}

/** View and, for the list, sort. Two radio groups, the way the model picker draws its options. */
function LayoutMenu({
  layout,
  onChange,
}: {
  readonly layout: ChangesLayout
  readonly onChange: (layout: ChangesLayout) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button aria-label="Layout" size="icon" variant="ghost" />}
        className="size-11 rounded-full"
      >
        <SlidersHorizontalIcon aria-hidden className="size-5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40">
        <DropdownMenuGroup>
          <DropdownMenuLabel>View</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={layout.view}
            onValueChange={(view) => {
              onChange(
                view === 'tree'
                  ? { view: 'tree', group: layout.group }
                  : { view: 'list', sort: 'path', group: layout.group },
              )
            }}
          >
            <DropdownMenuRadioItem value="tree">Tree</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="list">List</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
        {layout.view === 'list' ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel>Sort by</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={layout.sort}
                onValueChange={(sort) => {
                  onChange({ ...layout, view: 'list', sort: sort === 'name' ? 'name' : 'path' })
                }}
              >
                <DropdownMenuRadioItem value="path">Path</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="name">Name</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuGroup>
          </>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Group by</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={layout.group}
            onValueChange={(group) => {
              onChange({ ...layout, group: group === 'none' ? 'none' : 'tracked' })
            }}
          >
            <DropdownMenuRadioItem value="none">None</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="tracked">Tracked & Untracked</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Folders are headings, never controls; every level stays open. */
function TreeRows({
  files,
  onSelect,
}: {
  readonly files: readonly ChangedFile[]
  readonly onSelect: (path: ChangedFilePath) => void
}) {
  return changesTree(files).map((row) =>
    row.kind === 'folder' ? (
      <div
        key={row.key}
        className="relative flex min-h-11 items-center gap-2 text-muted-foreground"
        style={indent(row.depth)}
      >
        <IndentGuides depth={row.depth} />
        <FolderSimpleIcon aria-hidden className="size-4 shrink-0" />
        <span className="truncate">{row.name}</span>
      </div>
    ) : (
      <FileRow
        key={row.key}
        depth={row.depth}
        file={row.file}
        onSelect={() => {
          onSelect(row.file.path)
        }}
      />
    ),
  )
}

/** Past this, rows stop stepping in: a phone runs out of width before a repository runs out of depth. */
const MAX_INDENT_DEPTH = 5
/** Five steps cost 6.25 rem, leaving a 20 rem phone half its width for the name and counts. */
const INDENT_STEP_REM = 1.25

/**
 * Each level steps in by one icon width, so a child sits under its folder's
 * name. Deeper rows share the last level; the heading above a file is still
 * its nearest folder, so reading order holds whatever the x position.
 */
function indent(depth: number): CSSProperties {
  const level = Math.min(depth, MAX_INDENT_DEPTH)
  return { paddingLeft: `${String(1 + level * INDENT_STEP_REM)}rem`, paddingRight: '1rem' }
}

/** One hairline under each ancestor's icon, the way an editor's tree draws its guides. */
function IndentGuides({ depth }: { readonly depth: number }) {
  const level = Math.min(depth, MAX_INDENT_DEPTH)
  return Array.from({ length: level }, (_, index) => (
    <span
      key={index}
      aria-hidden
      className="absolute inset-y-0 border-l border-border"
      // Icons are one rem wide and start at one rem, so a centre sits at 1.5 rem plus the steps.
      style={{ left: `${String(1.5 + index * INDENT_STEP_REM)}rem` }}
    />
  ))
}

/** Git's status as an editor draws it: a square, marked and coloured by what happened to the file. */
function StatusGlyph({ status }: { readonly status: ChangedFileStatus }) {
  switch (status) {
    case 'modified':
      return (
        <span className="relative flex size-4 shrink-0 items-center justify-center text-status-warning">
          <SquareIcon aria-hidden className="size-4" />
          <span aria-hidden className="absolute size-1 rounded-xs bg-current" />
        </span>
      )
    case 'added':
    case 'untracked':
      return <PlusSquareIcon aria-hidden className="size-4 shrink-0 text-status-success" />
    case 'deleted':
      return <MinusSquareIcon aria-hidden className="size-4 shrink-0 text-destructive" />
  }
  const exhaustive: never = status
  return exhaustive
}

/** One line, as a tool row: the name bright and mono, the directory muted after it in the list. */
function FileRow({
  file,
  depth,
  showDirectory = false,
  onSelect,
}: {
  readonly file: ChangedFile
  readonly depth: number
  readonly showDirectory?: boolean
  readonly onSelect: () => void
}) {
  const { name, directory } = splitPath(file.path)
  return (
    <ToolRowButton className="relative" style={indent(depth)} onClick={onSelect}>
      <IndentGuides depth={depth} />
      <StatusGlyph status={file.status} />
      {/* Grows, so the counts line up on the right across rows. */}
      <span className="min-w-0 flex-1 truncate">
        <span
          className={cn(
            'font-mono text-foreground',
            file.status === 'deleted' && 'text-muted-foreground line-through',
          )}
        >
          {name}
        </span>
        {showDirectory && directory !== '' ? <> {directory}</> : null}
      </span>
      {file.kind === 'text' ? (
        <ChangeCount change={file} />
      ) : (
        <small className="shrink-0 font-mono">binary</small>
      )}
      <CaretRightIcon aria-hidden className="size-3 shrink-0" />
    </ToolRowButton>
  )
}

const megabytes = new Intl.NumberFormat(undefined, {
  style: 'unit',
  unit: 'megabyte',
  maximumFractionDigits: 1,
})

/**
 * The pushed-in panel: the diff, or the one line saying why there is none.
 * The full path heads the block, as it does on an inline tool card.
 */
function DiffPanel({
  path,
  diff,
}: {
  readonly path: ChangedFilePath
  readonly diff: FileDiffView
}) {
  if (diff.status === 'offline') return <Note>Your machine is offline.</Note>
  if (diff.status === 'pending') return <DiffSkeleton />
  if (diff.status === 'failed') {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-muted-foreground">Could not read this file.</p>
        <Button size="sm" variant="outline" onClick={diff.onRetry}>
          Retry
        </Button>
      </div>
    )
  }
  switch (diff.diff.kind) {
    case 'patch':
      return <DiffBlock unbounded rows={patchRows(diff.diff.patch)} title={path} />
    case 'binary':
      return <Note>Binary file</Note>
    case 'too-large':
      return <Note>Too large to show here ({megabytes.format(diff.diff.bytes / 1_000_000)})</Note>
  }
  const exhaustive: never = diff.diff
  return exhaustive
}

function Note({ children }: { readonly children: ReactNode }) {
  return <p className="text-muted-foreground">{children}</p>
}

/** Written out, not generated: the same code-shaped bars on every render, no flicker. */
const DIFF_SKELETON_ROWS = [
  'w-1/2',
  'w-3/4',
  'w-2/3',
  'w-11/12',
  'w-1/3',
  'w-5/6',
  'w-2/5',
  'w-3/5',
] as const

/** The diff card before the machine answers: a path line, then rows the width of code. */
function DiffSkeleton() {
  return (
    <div aria-busy className="overflow-hidden rounded-xl border bg-surface">
      <div className="border-b px-3 py-2">
        <Skeleton className="h-3 w-2/3" />
      </div>
      <div className="flex flex-col gap-2 px-3 py-3">
        {DIFF_SKELETON_ROWS.map((width, index) => (
          <Skeleton key={index} className={cn('h-3', width)} />
        ))}
      </div>
    </div>
  )
}
