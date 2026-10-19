import { useCallback, useEffect, useRef, useState } from 'react'
import type { SearchResponse } from '@shared/types'

const DEBOUNCE_MS = 120
const SPINNER_AFTER_MS = 150

export interface SearchState {
  query: string
  setQuery: (q: string) => void
  response: SearchResponse | null
  /** True while a request has been running for more than 150 ms. */
  searching: boolean
  /** Increments every time a query is sent (drives the icon pulse). */
  pulse: number
  limit: number
  showMore: () => void
  rerun: () => void
}

/** Search-as-you-type with debounce and stale-response protection (sequence numbers). */
export function useSearch(pageSize: number): SearchState {
  const [query, setQueryState] = useState('')
  const [response, setResponse] = useState<SearchResponse | null>(null)
  const [searching, setSearching] = useState(false)
  const [pulse, setPulse] = useState(0)
  const [limit, setLimit] = useState(pageSize)
  const seq = useRef(0)
  const queryRef = useRef('')
  const limitRef = useRef(pageSize)

  const run = useCallback((q: string, lim: number) => {
    const s = ++seq.current
    if (!q.trim()) {
      setResponse(null)
      setSearching(false)
      return
    }
    setPulse((p) => p + 1)
    const timer = setTimeout(() => {
      if (s === seq.current) setSearching(true)
    }, SPINNER_AFTER_MS)
    window.ff
      .invoke('search', { seq: s, query: q, limit: lim })
      .then((res) => {
        if (res.seq === seq.current) setResponse(res)
      })
      .catch(() => {
        /* a failed search simply shows the previous results */
      })
      .finally(() => {
        clearTimeout(timer)
        if (s === seq.current) setSearching(false)
      })
  }, [])

  useEffect(() => {
    setLimit(pageSize)
    limitRef.current = pageSize
  }, [pageSize])

  useEffect(() => {
    queryRef.current = query
    if (!query.trim()) {
      run('', limitRef.current)
      return
    }
    const timer = setTimeout(() => run(query, limitRef.current), DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query, run])

  const setQuery = useCallback(
    (q: string) => {
      setQueryState(q)
      limitRef.current = pageSize
      setLimit(pageSize)
    },
    [pageSize]
  )

  const showMore = useCallback(() => {
    const next = limitRef.current + pageSize
    limitRef.current = next
    setLimit(next)
    run(queryRef.current, next)
  }, [pageSize, run])

  const rerun = useCallback(() => run(queryRef.current, limitRef.current), [run])

  return { query, setQuery, response, searching, pulse, limit, showMore, rerun }
}
