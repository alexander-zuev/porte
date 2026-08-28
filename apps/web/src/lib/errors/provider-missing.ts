/** A programmer error: a hook ran in a tree assembled without its provider. */
export class ProviderMissing extends Error {
  constructor(hook: string, provider: string) {
    super(`${hook} was called outside ${provider}`)
    this.name = 'ProviderMissing'
  }
}
