export const getPlainTextFromContent = (content: string) =>
  content
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<div[^>]*>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')

export const getWordCountFromContent = (content: string) => {
  const plainText = getPlainTextFromContent(content).trim()
  if (plainText.length === 0) return 0
  return plainText.split(/\s+/).length
}
