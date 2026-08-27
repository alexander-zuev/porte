import { normaliseGitRoot } from '@host/infrastructure/grok/git-root.ts'
import { type ConversationId, type IsoDateTime } from '@porte/core/client'

type ConversationData = {
  readonly id: ConversationId
  readonly cwd: string
  readonly gitRoot: string
  readonly title: string
  readonly updatedAt: IsoDateTime
}

/** Input to start one conversation in a git workspace. */
export type CreateConversationInput = {
  readonly id: ConversationId
  readonly cwd: string
  readonly gitRoot: string
  readonly now: Date
}

/** Input to restore one conversation that already exists on the coding agent. */
export type RestoreConversationInput = {
  readonly id: ConversationId
  readonly cwd: string
  readonly gitRoot: string
  readonly title: string
  readonly updatedAt: IsoDateTime
}

/**
 * One coding conversation in a git workspace.
 *
 * Comes into being when the Host creates a session in a repository.
 */
export class Conversation {
  private constructor(private readonly data: ConversationData) {}

  /** Start an empty conversation in a git workspace. */
  static create(input: CreateConversationInput): Conversation {
    return new Conversation({
      id: input.id,
      cwd: input.cwd,
      gitRoot: normaliseGitRoot(input.gitRoot),
      title: '',
      // SAFETY: Date#toISOString is RFC 3339 UTC, which IsoDateTime requires.
      updatedAt: input.now.toISOString() as IsoDateTime,
    })
  }

  /** Rebuild one conversation from coding-agent list facts. */
  static restore(input: RestoreConversationInput): Conversation {
    return new Conversation({
      id: input.id,
      cwd: input.cwd,
      gitRoot: normaliseGitRoot(input.gitRoot),
      title: input.title,
      updatedAt: input.updatedAt,
    })
  }

  /** Conversation id. */
  get id(): ConversationId {
    return this.data.id
  }

  /** Working directory for this conversation. */
  get cwd(): string {
    return this.data.cwd
  }

  /** Git repository this conversation belongs to. */
  get gitRoot(): string {
    return this.data.gitRoot
  }

  /** List title. Empty at create. */
  get title(): string {
    return this.data.title
  }

  /** Last update time. */
  get updatedAt(): IsoDateTime {
    return this.data.updatedAt
  }
}
