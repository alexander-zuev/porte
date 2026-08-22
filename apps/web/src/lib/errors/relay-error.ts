/** A programmer error: the tree was assembled without `RelayProvider`. */
export class RelayProviderMissing extends Error {
  constructor(hook: string) {
    super(`${hook} was called outside RelayProvider`)
    this.name = 'RelayProviderMissing'
  }
}
