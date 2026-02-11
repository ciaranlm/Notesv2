export const formatDateKey = (date: Date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export const parseDateKey = (dateKey: string) => {
  const [year, month, day] = dateKey.split('-').map(Number)
  return new Date(year, (month ?? 1) - 1, day ?? 1)
}

export const getTodayKey = () => formatDateKey(new Date())

export const addDays = (date: Date, amount: number) => {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  next.setDate(next.getDate() + amount)
  return next
}

export const startOfWeek = (date: Date) => {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  next.setDate(next.getDate() - next.getDay())
  return next
}

export const endOfWeek = (date: Date) => addDays(startOfWeek(date), 6)

export const getCalendarRange = (endDate: Date = new Date(), days = 365) => {
  const end = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate())
  const start = addDays(end, -(days - 1))
  return {
    startDate: start,
    endDate: end,
    startKey: formatDateKey(start),
    endKey: formatDateKey(end),
  }
}

export const formatFullDate = (date: Date) =>
  date.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })

export const formatMonthLabel = (date: Date) =>
  date.toLocaleDateString(undefined, { month: 'short' })

export const getDailyNoteId = (dateKey: string) => `note:${dateKey}`
