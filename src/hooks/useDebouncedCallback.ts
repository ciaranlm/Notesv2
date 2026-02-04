import { useCallback, useEffect, useRef } from 'react'

export const useDebouncedCallback = <Args extends unknown[]>(
  callback: (...args: Args) => void,
  delay: number,
) => {
  const timeoutRef = useRef<number | undefined>(undefined)
  const latestCallback = useRef(callback)

  useEffect(() => {
    latestCallback.current = callback
  }, [callback])

  const debounced = useCallback(
    (...args: Args) => {
      window.clearTimeout(timeoutRef.current)
      timeoutRef.current = window.setTimeout(() => {
        latestCallback.current(...args)
      }, delay)
    },
    [delay],
  )

  const flush = useCallback(
    (...args: Args) => {
      window.clearTimeout(timeoutRef.current)
      latestCallback.current(...args)
    },
    [],
  )

  const cancel = useCallback(() => {
    window.clearTimeout(timeoutRef.current)
  }, [])

  return { debounced, flush, cancel }
}
