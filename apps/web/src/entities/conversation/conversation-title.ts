/** The machine creates conversations untitled and the agent names them later, so blank is a real state. */
export function conversationDisplayTitle(title: string): string {
  return title.trim() === '' ? 'New conversation' : title
}
