const keywordMap: Record<string, string[]> = {
  meeting: ['meeting'],
  sync: ['meeting'],
  agenda: ['meeting'],
  task: ['task'],
  tasks: ['task'],
  todo: ['task'],
  checklist: ['task'],
  idea: ['idea'],
  ideas: ['idea'],
  brainstorm: ['idea'],
  research: ['research'],
  study: ['research'],
  journal: ['journal'],
  daily: ['journal'],
}

export const stripHtml = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()

export const extractTags = (text: string): string[] => {
  const normalized = stripHtml(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
  if (!normalized) return []

  const tags: string[] = []
  const seen = new Set<string>()

  for (const word of normalized.split(' ')) {
    if (!word) continue
    const mapped = keywordMap[word]
    if (!mapped) continue
    for (const tag of mapped) {
      if (seen.has(tag)) continue
      seen.add(tag)
      tags.push(tag)
    }
  }

  return tags
}
