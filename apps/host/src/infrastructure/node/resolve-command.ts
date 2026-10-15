import { existsSync } from 'node:fs'
import { extname, join } from 'node:path'

/** How to spawn a command found on `PATH`. */
export type ResolvedCommand = { readonly command: string; readonly shell: boolean }

export type ResolveCommandEnvironment = {
  readonly platform: NodeJS.Platform
  readonly env: NodeJS.ProcessEnv
  readonly exists: (path: string) => boolean
}

const REAL_ENVIRONMENT: ResolveCommandEnvironment = {
  platform: process.platform,
  env: process.env,
  exists: existsSync,
}

/**
 * Find a bare command the way a Windows shell would.
 *
 * `spawn` without a shell only finds `.exe` files on Windows, but npm installs
 * CLIs as `.cmd` shims, which Node runs only through a shell. Elsewhere, and
 * when nothing matches, the name is returned unchanged so `spawn` reports the
 * usual ENOENT.
 */
export function resolveCommand(
  name: string,
  environment: ResolveCommandEnvironment = REAL_ENVIRONMENT,
): ResolvedCommand {
  const { platform, env, exists } = environment
  if (platform !== 'win32' || extname(name) !== '') return { command: name, shell: false }
  const extensions = (env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean)
  const directories = (env.Path ?? env.PATH ?? '').split(';').filter(Boolean)
  for (const directory of directories) {
    for (const extension of extensions) {
      const candidate = join(directory, `${name}${extension.toLowerCase()}`)
      if (!exists(candidate)) continue
      const batch = /^\.(cmd|bat)$/i.test(extension)
      // cmd strips one pair of quotes, so a path with spaces stays one word.
      return batch
        ? { command: `"${candidate}"`, shell: true }
        : { command: candidate, shell: false }
    }
  }
  return { command: name, shell: false }
}
