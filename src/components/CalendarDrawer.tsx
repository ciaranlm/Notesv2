import { useEffect, useMemo, useRef, useState } from 'react'
import { addDays, formatDateKey, formatFullDate, getTodayKey, parseDateKey, startOfWeek } from '../utils/dates'
import './CalendarDrawer.css'

type CalendarDrawerProps = {
  isOpen: boolean
  selectedDate: string
  hasContentMap: Record<string, boolean>
  onClose: () => void
  onSelectDate: (dateKey: string) => void
}

type CalendarCell = {
  date: Date
  dateKey: string
  isCurrentMonth: boolean
}

const weekLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const getMonthGrid = (monthAnchor: Date): CalendarCell[] => {
  const firstDay = new Date(monthAnchor.getFullYear(), monthAnchor.getMonth(), 1)
  const gridStart = startOfWeek(firstDay)
  return Array.from({ length: 42 }, (_, index) => {
    const date = addDays(gridStart, index)
    return {
      date,
      dateKey: formatDateKey(date),
      isCurrentMonth: date.getMonth() === monthAnchor.getMonth(),
    }
  })
}

const getFocusableElements = (container: HTMLElement) =>
  Array.from(
    container.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((node) => !node.hasAttribute('disabled') && !node.getAttribute('aria-hidden'))

export const CalendarDrawer = ({ isOpen, selectedDate, hasContentMap, onClose, onSelectDate }: CalendarDrawerProps) => {
  const panelRef = useRef<HTMLElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const [visibleMonth, setVisibleMonth] = useState(() => parseDateKey(selectedDate))

  useEffect(() => {
    if (!isOpen) return
    setVisibleMonth(parseDateKey(selectedDate))
  }, [isOpen, selectedDate])

  useEffect(() => {
    if (!isOpen) return
    closeButtonRef.current?.focus()
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !panelRef.current) return
      const focusables = getFocusableElements(panelRef.current)
      if (focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const active = document.activeElement as HTMLElement | null

      if (event.shiftKey && active === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  const monthLabel = useMemo(
    () =>
      visibleMonth.toLocaleDateString(undefined, {
        month: 'long',
        year: 'numeric',
      }),
    [visibleMonth],
  )

  const cells = useMemo(() => getMonthGrid(visibleMonth), [visibleMonth])
  const todayKey = getTodayKey()

  const previousMonth = () => {
    setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))
  }

  const nextMonth = () => {
    setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))
  }

  return (
    <div className={`calendar-drawer-root ${isOpen ? 'is-open' : ''}`} aria-hidden={!isOpen}>
      <button type="button" className="calendar-overlay" aria-label="Close calendar" onClick={onClose} />
      <section
        ref={panelRef}
        className="calendar-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Calendar"
      >
        <header className="calendar-drawer-header">
          <p className="calendar-drawer-title">Calendar</p>
          <button ref={closeButtonRef} type="button" className="calendar-drawer-close" onClick={onClose}>
            Close
          </button>
        </header>

        <div className="calendar-month-toolbar">
          <button type="button" className="calendar-nav-button" onClick={previousMonth} aria-label="Previous month">
            ←
          </button>
          <p className="calendar-month-label">{monthLabel}</p>
          <button type="button" className="calendar-nav-button" onClick={nextMonth} aria-label="Next month">
            →
          </button>
        </div>

        <div className="calendar-grid" role="grid" aria-label={monthLabel}>
          {weekLabels.map((label) => (
            <span key={label} className="calendar-weekday" aria-hidden="true">
              {label}
            </span>
          ))}
          {cells.map((cell) => {
            const isToday = cell.dateKey === todayKey
            const isSelected = cell.dateKey === selectedDate
            const hasContent = Boolean(hasContentMap[cell.dateKey])
            const ariaLabel = `${formatFullDate(cell.date)}${hasContent ? ', has content' : ''}`

            return (
              <button
                key={cell.dateKey}
                type="button"
                role="gridcell"
                className={[
                  'calendar-day',
                  cell.isCurrentMonth ? '' : 'is-outside-month',
                  isToday ? 'is-today' : '',
                  isSelected ? 'is-selected' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                aria-label={ariaLabel}
                aria-current={isToday ? 'date' : undefined}
                onClick={() => onSelectDate(cell.dateKey)}
              >
                <span>{cell.date.getDate()}</span>
                {hasContent ? <span className="calendar-content-dot" aria-hidden="true" /> : null}
              </button>
            )
          })}
        </div>
      </section>
    </div>
  )
}
