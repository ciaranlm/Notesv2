import { useMemo } from 'react'
import {
  addDays,
  formatDateKey,
  formatFullDate,
  formatMonthLabel,
  getCalendarRange,
  endOfWeek,
  startOfWeek,
} from '../utils/dates'
import './CalendarView.css'

type ActivityEntry = {
  wordCount: number
  intensity: number
}

export type CalendarViewProps = {
  activityMap: Record<string, ActivityEntry>
  selectedDateKey?: string | null
  onSelectDate: (dateKey: string) => void
  onClose: () => void
  onBackToToday: () => void
}

type CalendarDay = {
  date: Date
  dateKey: string
  isInRange: boolean
}

const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export const CalendarView = ({
  activityMap,
  selectedDateKey,
  onSelectDate,
  onClose,
  onBackToToday,
}: CalendarViewProps) => {
  const { weeks, monthLabels } = useMemo(() => {
    const { startDate, endDate } = getCalendarRange()
    const gridStart = startOfWeek(startDate)
    const gridEnd = endOfWeek(endDate)
    const weeks: CalendarDay[][] = []
    let cursor = gridStart
    let currentWeek: CalendarDay[] = []

    while (cursor <= gridEnd) {
      const dateKey = formatDateKey(cursor)
      const isInRange = cursor >= startDate && cursor <= endDate
      currentWeek.push({
        date: new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate()),
        dateKey,
        isInRange,
      })
      if (currentWeek.length === 7) {
        weeks.push(currentWeek)
        currentWeek = []
      }
      cursor = addDays(cursor, 1)
    }

    const monthLabels = weeks.map((week) => {
      const monthStart = week.find((day) => day.isInRange && day.date.getDate() === 1)
      return monthStart ? formatMonthLabel(monthStart.date) : ''
    })

    return { weeks, monthLabels }
  }, [])

  return (
    <section className="calendar-view" aria-label="Calendar activity">
      <header className="calendar-header">
        <div>
          <p className="calendar-title">Calendar</p>
          <p className="calendar-subtitle">Daily pages over the last year.</p>
        </div>
        <div className="calendar-actions">
          <button type="button" className="calendar-button" onClick={onBackToToday}>
            Back to today
          </button>
          <button type="button" className="calendar-button is-ghost" onClick={onClose}>
            Close
          </button>
        </div>
      </header>
      <div className="calendar-grid">
        <div className="calendar-months" style={{ gridTemplateColumns: `repeat(${weeks.length}, 1fr)` }}>
          {monthLabels.map((label, index) => (
            <span key={`${label}-${index}`} className="calendar-month">
              {label}
            </span>
          ))}
        </div>
        <div className="calendar-body">
          <div className="calendar-days">
            {dayLabels.map((label) => (
              <span key={label} className="calendar-day-label">
                {label}
              </span>
            ))}
          </div>
          <div
            className="calendar-weeks"
            style={{ gridTemplateColumns: `repeat(${weeks.length}, 1fr)` }}
          >
            {weeks.map((week, weekIndex) => (
              <div className="calendar-week" key={`week-${weekIndex}`}>
                {week.map((day) => {
                  const activity = activityMap[day.dateKey]
                  const intensity = day.isInRange ? activity?.intensity ?? 0 : 0
                  const wordCount = day.isInRange ? activity?.wordCount ?? 0 : 0
                  const isSelected = selectedDateKey === day.dateKey
                  const tooltip = `${formatFullDate(day.date)} • ${
                    wordCount === 0 ? 'No words' : `${wordCount} words`
                  }`

                  return (
                    <button
                      key={day.dateKey}
                      type="button"
                      className={[
                        'calendar-cell',
                        `intensity-${intensity}`,
                        day.isInRange ? '' : 'is-outside',
                        isSelected ? 'is-selected' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      title={tooltip}
                      aria-label={tooltip}
                      disabled={!day.isInRange}
                      onClick={() => onSelectDate(day.dateKey)}
                    />
                  )
                })}
              </div>
            ))}
          </div>
        </div>
        <div className="calendar-legend">
          <span>Less</span>
          <div className="calendar-legend-scale">
            {[0, 1, 2, 3, 4].map((level) => (
              <span key={level} className={`calendar-cell intensity-${level}`} />
            ))}
          </div>
          <span>More</span>
        </div>
      </div>
    </section>
  )
}
