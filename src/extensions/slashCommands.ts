import { Extension, InputRule } from '@tiptap/core'

type SlashCommand =
  | 'h1'
  | 'h2'
  | 'h3'
  | 'bold'
  | 'italic'
  | 'underline'
  | 'bullet'
  | 'ordered'
  | 'checklist'
  | 'code'
  | 'quote'
  | 'link'

const slashCommandRegex =
  /^\/(h1|h2|h3|bold|italic|underline|bullet|ordered|checklist|code|quote|link)\s$/

export const SlashCommands = Extension.create({
  name: 'slashCommands',
  addInputRules() {
    return [
      new InputRule({
        find: slashCommandRegex,
        handler: ({ range, match, chain }) => {
          const command = match[1] as SlashCommand

          if (command === 'link') {
            const url = window.prompt('Enter a link URL')
            if (!url) {
              chain().deleteRange(range).run()
              return
            }
            chain().deleteRange(range).setLink({ href: url }).run()
            return
          }

          const nextChain = chain().deleteRange(range)

          switch (command) {
            case 'h1':
              nextChain.toggleHeading({ level: 1 }).run()
              break
            case 'h2':
              nextChain.toggleHeading({ level: 2 }).run()
              break
            case 'h3':
              nextChain.toggleHeading({ level: 3 }).run()
              break
            case 'bold':
              nextChain.toggleBold().run()
              break
            case 'italic':
              nextChain.toggleItalic().run()
              break
            case 'underline':
              nextChain.toggleUnderline().run()
              break
            case 'bullet':
              nextChain.toggleBulletList().run()
              break
            case 'ordered':
              nextChain.toggleOrderedList().run()
              break
            case 'checklist':
              nextChain.toggleTaskList().run()
              break
            case 'code':
              nextChain.toggleCodeBlock().run()
              break
            case 'quote':
              nextChain.toggleBlockquote().run()
              break
            default:
              nextChain.run()
          }
        },
      }),
    ]
  },
})
