export const getPlainTextFromContent = (content: string) =>
  content
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<div[^>]*>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')

const stripMarkdownSymbols = (content: string) =>
  content
    .replace(/(^|\s)#{1,6}\s+/g, '$1')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/_(.*?)_/g, '$1')
    .replace(/~~(.*?)~~/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/[>*_~`#\-[\]]/g, ' ')

export const getWordCountFromContent = (content: string) => {
  const plainText = stripMarkdownSymbols(getPlainTextFromContent(content)).trim()
  if (plainText.length === 0) return 0
  return plainText.split(/\s+/).length
}

const READING_WORDS_PER_MINUTE = 200

export const getReadingTimeLabel = (wordCount: number) => {
  if (wordCount <= 0) return '<1 min read'
  const readingTimeMinutes = wordCount / READING_WORDS_PER_MINUTE
  if (readingTimeMinutes < 1) return '<1 min read'
  const roundedMinutes = Math.round(readingTimeMinutes)
  return `${roundedMinutes} min read`
}

export const getWritingStatsFromContent = (content: string) => {
  const wordCount = getWordCountFromContent(content)
  return {
    wordCount,
    readingTimeLabel: getReadingTimeLabel(wordCount),
  }
}
