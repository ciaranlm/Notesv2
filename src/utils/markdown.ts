const BLOCK_TAGS = new Set([
  'ADDRESS',
  'ARTICLE',
  'ASIDE',
  'BLOCKQUOTE',
  'DIV',
  'FIGCAPTION',
  'FIGURE',
  'FOOTER',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'HEADER',
  'LI',
  'MAIN',
  'NAV',
  'P',
  'PRE',
  'SECTION',
])

const INLINE_TOKEN_STARTS = ['**', '~~', '`', '*', '['] as const

const isHTMLElement = (node: Node | null): node is HTMLElement => node instanceof HTMLElement

const getActiveRange = (editor: HTMLElement) => {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return null
  const range = selection.getRangeAt(0)
  if (!editor.contains(range.commonAncestorContainer)) return null
  return range
}

const getCurrentBlock = (editor: HTMLElement) => {
  const range = getActiveRange(editor)
  if (!range) return null

  let node: Node | null = range.startContainer
  if (node === editor) {
    const child = editor.childNodes[Math.max(0, range.startOffset - 1)]
    node = child ?? editor
  }

  while (node && node !== editor) {
    if (isHTMLElement(node) && BLOCK_TAGS.has(node.tagName)) {
      return node
    }
    node = node.parentNode
  }

  return editor
}

const setCaretAtEnd = (element: HTMLElement) => {
  const range = document.createRange()
  range.selectNodeContents(element)
  range.collapse(false)

  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
}

const setEditableContent = (element: HTMLElement, fragment: DocumentFragment | string) => {
  element.replaceChildren()

  if (typeof fragment === 'string') {
    if (fragment.length === 0) {
      element.append(document.createElement('br'))
      return
    }
    element.textContent = fragment
    return
  }

  if (fragment.childNodes.length === 0) {
    element.append(document.createElement('br'))
    return
  }

  element.append(fragment)
}

const replaceBlockElement = (editor: HTMLElement, block: HTMLElement, replacement: HTMLElement) => {
  if (block === editor) {
    editor.replaceChildren(replacement)
  } else {
    block.replaceWith(replacement)
  }
  setCaretAtEnd(replacement)
}

const createBlockElement = (tagName: string, text: string) => {
  const block = document.createElement(tagName)
  setEditableContent(block, text)
  return block
}

const createListElement = (tagName: 'ol' | 'ul', text: string) => {
  const list = document.createElement(tagName)
  const item = document.createElement('li')
  setEditableContent(item, text)
  list.append(item)
  return { list, item }
}

const getTextAfterMarker = (text: string, markerLength: number) => text.slice(markerLength)

export const applyMarkdownBlockShortcut = (editor: HTMLElement) => {
  const block = getCurrentBlock(editor)
  if (!block) return false

  const text = block.textContent ?? ''
  const headingMatch = /^(#{1,6})\s(.*)$/.exec(text)
  if (headingMatch) {
    const heading = createBlockElement(`h${headingMatch[1].length}`, headingMatch[2])
    replaceBlockElement(editor, block, heading)
    return true
  }

  if (/^[-*]\s/.test(text)) {
    const { list, item } = createListElement('ul', getTextAfterMarker(text, 2))
    replaceBlockElement(editor, block, list)
    setCaretAtEnd(item)
    return true
  }

  if (/^1\.\s/.test(text)) {
    const { list, item } = createListElement('ol', getTextAfterMarker(text, 3))
    replaceBlockElement(editor, block, list)
    setCaretAtEnd(item)
    return true
  }

  if (/^>\s/.test(text)) {
    const quote = createBlockElement('blockquote', getTextAfterMarker(text, 2))
    replaceBlockElement(editor, block, quote)
    return true
  }

  return false
}

const findNextInlineToken = (text: string, fromIndex: number) => {
  let nextIndex = -1
  let nextToken = ''

  for (const token of INLINE_TOKEN_STARTS) {
    const index = text.indexOf(token, fromIndex)
    if (index === -1) continue
    if (nextIndex === -1 || index < nextIndex || (index === nextIndex && token.length > nextToken.length)) {
      nextIndex = index
      nextToken = token
    }
  }

  return nextIndex === -1 ? null : { index: nextIndex, token: nextToken }
}

const appendText = (fragment: DocumentFragment, text: string) => {
  if (text.length > 0) {
    fragment.append(document.createTextNode(text))
  }
}

const appendInlineElement = (fragment: DocumentFragment, tagName: string, text: string) => {
  const element = document.createElement(tagName)
  element.textContent = text
  fragment.append(element)
}

const appendLinkElement = (fragment: DocumentFragment, label: string, href: string) => {
  const link = document.createElement('a')
  link.href = href
  link.textContent = label
  fragment.append(link)
}

const parseInlineMarkdown = (text: string) => {
  const fragment = document.createDocumentFragment()
  let changed = false
  let cursor = 0

  while (cursor < text.length) {
    const next = findNextInlineToken(text, cursor)
    if (!next) break

    appendText(fragment, text.slice(cursor, next.index))

    if (next.token === '**') {
      const end = text.indexOf('**', next.index + 2)
      if (end > next.index + 2) {
        appendInlineElement(fragment, 'strong', text.slice(next.index + 2, end))
        cursor = end + 2
        changed = true
        continue
      }
    }

    if (next.token === '~~') {
      const end = text.indexOf('~~', next.index + 2)
      if (end > next.index + 2) {
        appendInlineElement(fragment, 's', text.slice(next.index + 2, end))
        cursor = end + 2
        changed = true
        continue
      }
    }

    if (next.token === '`') {
      const end = text.indexOf('`', next.index + 1)
      if (end > next.index + 1) {
        appendInlineElement(fragment, 'code', text.slice(next.index + 1, end))
        cursor = end + 1
        changed = true
        continue
      }
    }

    if (next.token === '[') {
      const labelEnd = text.indexOf('](', next.index + 1)
      const urlEnd = labelEnd === -1 ? -1 : text.indexOf(')', labelEnd + 2)
      if (labelEnd > next.index + 1 && urlEnd > labelEnd + 2) {
        const href = text.slice(labelEnd + 2, urlEnd)
        if (/^https?:\/\/\S+$/i.test(href)) {
          appendLinkElement(fragment, text.slice(next.index + 1, labelEnd), href)
          cursor = urlEnd + 1
          changed = true
          continue
        }
      }
    }

    if (next.token === '*') {
      const end = text.indexOf('*', next.index + 1)
      const previousCharacter = next.index > 0 ? text[next.index - 1] : ''
      const nextCharacter = text[next.index + 1] ?? ''
      if (
        previousCharacter !== '*' &&
        nextCharacter !== '*' &&
        !/\s/.test(nextCharacter) &&
        end > next.index + 1 &&
        text[end + 1] !== '*'
      ) {
        appendInlineElement(fragment, 'em', text.slice(next.index + 1, end))
        cursor = end + 1
        changed = true
        continue
      }
    }

    appendText(fragment, next.token)
    cursor = next.index + next.token.length
  }

  appendText(fragment, text.slice(cursor))
  return { changed, fragment }
}

export const applyMarkdownInlineShortcuts = (editor: HTMLElement) => {
  const block = getCurrentBlock(editor)
  if (!block) return false

  const text = block.textContent ?? ''
  const { changed, fragment } = parseInlineMarkdown(text)
  if (!changed) return false

  setEditableContent(block, fragment)
  setCaretAtEnd(block)
  return true
}
