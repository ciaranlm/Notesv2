import { useEffect, useState } from 'react'
import './SaveIndicator.css'

type SaveIndicatorProps = {
  savedAt: number | null
}

export const SaveIndicator = ({ savedAt }: SaveIndicatorProps) => {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    if (!savedAt) return
    setIsVisible(true)
    const timer = window.setTimeout(() => setIsVisible(false), 1100)
    return () => window.clearTimeout(timer)
  }, [savedAt])

  return (
    <div className={`save-indicator ${isVisible ? 'save-indicator--visible' : ''}`}>
      Saved
    </div>
  )
}
