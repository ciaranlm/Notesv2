import { useEffect } from 'react'

type Hotkey = {
  combo: string
  handler: (event: KeyboardEvent) => void
  allowInInput?: boolean
}

const normalizeCombo = (combo: string) => combo.toLowerCase().replace(/
/g, '').trim()

const matchesCombo = (event: KeyboardEvent, combo: string) => {
  const parts = normalizeCombo(combo).split('+')
  const key = event.key.toLowerCase()
  const wantsCmd = parts.includes('cmd') || parts.includes('meta')
  const wantsCtrl = parts.includes('ctrl') || parts.includes('control')
  const wantsShift = parts.includes('shift')
  const wantsAlt = parts.includes('alt')
  const mainKey = parts.find((part) => !['cmd', 'meta', 'ctrl', 'control', 'shift', 'alt'].includes(part))

  if (wantsCmd !== event.metaKey) return false
  if (wantsCtrl !== event.ctrlKey) return false
  if (wantsShift !== event.shiftKey) return false
  if (wantsAlt !== event.altKey) return false
  if (mainKey && mainKey !== key) return false

  return true
}

const isEditableTarget = (target: EventTarget | null) => {
  if (!target || !(target instanceof HTMLElement)) return false
  return target.isContentEditable || ['input', 'textarea', 'select'].includes(target.tagName.toLowerCase())
}

export const useHotkeys = (hotkeys: Hotkey[]) => {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.isComposing || event.keyCode === 229) return
      for (const hotkey of hotkeys) {
        if (!hotkey.allowInInput && isEditableTarget(event.target)) {
          continue
        }
        if (matchesCombo(event, hotkey.combo)) {
          hotkey.handler(event)
          break
        }
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [hotkeys])
}
