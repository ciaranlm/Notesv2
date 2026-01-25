import type { Editor } from '@tiptap/react'

const toolbarGroups = [
  { id: 'h1', label: 'H1', shortcut: '⌘⌥1' },
  { id: 'h2', label: 'H2', shortcut: '⌘⌥2' },
  { id: 'h3', label: 'H3', shortcut: '⌘⌥3' },
  { id: 'bold', label: 'Bold', shortcut: '⌘B' },
  { id: 'italic', label: 'Italic', shortcut: '⌘I' },
  { id: 'underline', label: 'Underline', shortcut: '⌘U' },
  { id: 'bullet', label: 'Bullets', shortcut: '⌘⇧8' },
  { id: 'ordered', label: 'Numbered', shortcut: '⌘⇧7' },
  { id: 'checklist', label: 'Checklist', shortcut: '⌘⇧9' },
  { id: 'code', label: 'Code', shortcut: '⌘⌥C' },
  { id: 'quote', label: 'Quote', shortcut: '⌘⇧B' },
  { id: 'link', label: 'Link', shortcut: '⌘K' },
]

const iconMap: Record<string, string> = {
  h1: 'H1',
  h2: 'H2',
  h3: 'H3',
  bold: 'B',
  italic: 'I',
  underline: 'U',
  bullet: '•',
  ordered: '1.',
  checklist: '☑',
  code: '</>',
  quote: '❝',
  link: '🔗',
}

const getActive = (editor: Editor, id: string) => {
  switch (id) {
    case 'h1':
      return editor.isActive('heading', { level: 1 })
    case 'h2':
      return editor.isActive('heading', { level: 2 })
    case 'h3':
      return editor.isActive('heading', { level: 3 })
    case 'bold':
      return editor.isActive('bold')
    case 'italic':
      return editor.isActive('italic')
    case 'underline':
      return editor.isActive('underline')
    case 'bullet':
      return editor.isActive('bulletList')
    case 'ordered':
      return editor.isActive('orderedList')
    case 'checklist':
      return editor.isActive('taskList')
    case 'code':
      return editor.isActive('codeBlock')
    case 'quote':
      return editor.isActive('blockquote')
    case 'link':
      return editor.isActive('link')
    default:
      return false
  }
}

const handleAction = (editor: Editor, id: string) => {
  switch (id) {
    case 'h1':
      editor.chain().focus().toggleHeading({ level: 1 }).run()
      break
    case 'h2':
      editor.chain().focus().toggleHeading({ level: 2 }).run()
      break
    case 'h3':
      editor.chain().focus().toggleHeading({ level: 3 }).run()
      break
    case 'bold':
      editor.chain().focus().toggleBold().run()
      break
    case 'italic':
      editor.chain().focus().toggleItalic().run()
      break
    case 'underline':
      editor.chain().focus().toggleUnderline().run()
      break
    case 'bullet':
      editor.chain().focus().toggleBulletList().run()
      break
    case 'ordered':
      editor.chain().focus().toggleOrderedList().run()
      break
    case 'checklist':
      editor.chain().focus().toggleTaskList().run()
      break
    case 'code':
      editor.chain().focus().toggleCodeBlock().run()
      break
    case 'quote':
      editor.chain().focus().toggleBlockquote().run()
      break
    case 'link': {
      const previousUrl = editor.getAttributes('link').href
      const url = window.prompt('Enter a link URL', previousUrl || '')
      if (url === null) return
      if (url === '') {
        editor.chain().focus().unsetLink().run()
        return
      }
      editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
      break
    }
    default:
      break
  }
}

const labelFor = (id: string) => {
  return iconMap[id] ?? id
}

export const Toolbar = ({ editor, compact }: { editor: Editor; compact: boolean }) => {
  return (
    <div className={`toolbar ${compact ? 'toolbar--compact' : ''}`} role="toolbar" aria-label="Formatting">
      {toolbarGroups.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`toolbar__button ${getActive(editor, item.id) ? 'is-active' : ''}`}
          onClick={() => handleAction(editor, item.id)}
          aria-label={item.label}
          title={`${item.label} ${item.shortcut}`}
        >
          <span className="toolbar__icon" aria-hidden="true">
            {labelFor(item.id)}
          </span>
          {!compact && <span className="toolbar__label">{item.label}</span>}
        </button>
      ))}
    </div>
  )
}
