import { useContext, useState, useRef, useCallback, useEffect } from 'react'
import { OEXCommsInternalContext } from '../providers/OEXCommsProvider'
import type { OEXError } from '../types'
import type { OEXTimelineEntry, OEXTimelineParams, TimelineApiResponse } from '../types'
import { mapTimelineEntry } from '../types'

export interface UseActivityTimelineReturn {
  /** Timeline entries (chronological, newest first) */
  entries: OEXTimelineEntry[]
  /** Fetch entries with optional filter params (replaces current entries) */
  fetchEntries: (params?: OEXTimelineParams) => Promise<void>
  /** Re-fetch with the last used params */
  refreshEntries: () => Promise<void>
  /** Load the next page of entries (appends to existing entries) */
  loadMore: () => Promise<void>
  /** Whether there are more entries to load */
  hasMore: boolean
  /** Whether a fetch or load-more operation is in progress */
  isLoading: boolean
  /** Current error, or null */
  error: OEXError | null
}

function buildQueryParams(params?: OEXTimelineParams): Record<string, string> {
  const query: Record<string, string> = {}
  if (!params) return query

  if (params.leadId) query.lead_id = params.leadId
  if (params.companyId) query.company_id = params.companyId
  if (params.campaignId) query.campaign_id = params.campaignId
  if (params.channels && params.channels.length > 0) query.channel = params.channels.join(',')
  if (params.direction) query.direction = params.direction
  if (params.after) query.after = params.after
  if (params.before) query.before = params.before
  if (params.limit !== undefined) query.limit = String(params.limit)
  query.offset = String(params.offset ?? 0)

  return query
}

export function useActivityTimeline(initialParams?: OEXTimelineParams): UseActivityTimelineReturn {
  const internal = useContext(OEXCommsInternalContext)
  if (internal === null) {
    throw new Error('useActivityTimeline must be used within an OEXCommsProvider')
  }

  const { apiClientRef } = internal

  const [entries, setEntries] = useState<OEXTimelineEntry[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<OEXError | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const lastFetchParamsRef = useRef<OEXTimelineParams | undefined>(undefined)
  const currentOffsetRef = useRef(0)

  const fetchEntries = useCallback(
    async (params?: OEXTimelineParams): Promise<void> => {
      if (!apiClientRef.current) {
        setError({ code: 0, message: 'API client not available', recoverable: false })
        return
      }

      setIsLoading(true)
      setError(null)
      lastFetchParamsRef.current = params

      try {
        const queryParams = buildQueryParams(params)
        const response = await apiClientRef.current.get<TimelineApiResponse>(
          '/api/activity/timeline',
          queryParams,
        )
        const mapped = response.entries.map(mapTimelineEntry)
        setEntries(mapped)
        const limit = params?.limit ?? 50
        setHasMore(response.total_fetched === limit)
        currentOffsetRef.current = (params?.offset ?? 0) + response.total_fetched
      } catch (err) {
        setError(err as OEXError)
      } finally {
        setIsLoading(false)
      }
    },
    [apiClientRef],
  )

  const refreshEntries = useCallback(async (): Promise<void> => {
    await fetchEntries(lastFetchParamsRef.current)
  }, [fetchEntries])

  const loadMore = useCallback(async (): Promise<void> => {
    if (!hasMore || isLoading) return
    if (!apiClientRef.current) {
      setError({ code: 0, message: 'API client not available', recoverable: false })
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const params: OEXTimelineParams = {
        ...lastFetchParamsRef.current,
        offset: currentOffsetRef.current,
      }
      const queryParams = buildQueryParams(params)
      const response = await apiClientRef.current.get<TimelineApiResponse>(
        '/api/activity/timeline',
        queryParams,
      )
      const mapped = response.entries.map(mapTimelineEntry)
      setEntries((prev) => [...prev, ...mapped])
      const limit = lastFetchParamsRef.current?.limit ?? 50
      setHasMore(response.total_fetched === limit)
      currentOffsetRef.current += response.total_fetched
    } catch (err) {
      setError(err as OEXError)
    } finally {
      setIsLoading(false)
    }
  }, [hasMore, isLoading, apiClientRef])

  // Auto-fetch on mount and when initialParams change
  const serializedParams = JSON.stringify(initialParams)
  useEffect(() => {
    fetchEntries(initialParams)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serializedParams])

  return {
    entries,
    fetchEntries,
    refreshEntries,
    loadMore,
    hasMore,
    isLoading,
    error,
  }
}
