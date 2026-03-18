import React, { createContext, forwardRef, useContext, useState, useCallback } from 'react'
import { useActivityTimeline } from '../hooks/useActivityTimeline'
import type { UseActivityTimelineReturn } from '../hooks/useActivityTimeline'
import type { OEXTimelineEntry, OEXTimelineChannel, OEXTimelineDirection, OEXTimelineParams } from '../types'

// --- Internal context (not exported) ---

interface ActivityTimelineContextValue extends UseActivityTimelineReturn {
  onEntryClick?: (entry: OEXTimelineEntry) => void
  baseParams: Omit<OEXTimelineParams, 'offset'>
}

const ActivityTimelineContext = createContext<ActivityTimelineContextValue | null>(null)

function useTimelineContext(): ActivityTimelineContextValue {
  const ctx = useContext(ActivityTimelineContext)
  if (!ctx) throw new Error('ActivityTimeline subcomponents must be used within <ActivityTimeline>')
  return ctx
}

// --- Subcomponents ---

export interface ActivityTimelineEntryProps {
  /** The timeline entry to render */
  entry: OEXTimelineEntry
  className?: string
  children?: (entry: OEXTimelineEntry) => React.ReactNode
}

const TimelineEntry = forwardRef<HTMLDivElement, ActivityTimelineEntryProps>(
  ({ entry, className, children }, ref) => {
    const { onEntryClick } = useTimelineContext()

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        onEntryClick?.(entry)
      }
    }

    return (
      <div
        ref={ref}
        className={className}
        data-channel={entry.channel}
        data-event-type={entry.eventType}
        data-direction={entry.direction ?? undefined}
        data-entry-id={entry.id}
        role="article"
        tabIndex={0}
        onClick={() => onEntryClick?.(entry)}
        onKeyDown={handleKeyDown}
      >
        {typeof children === 'function' ? children(entry) : (
          <>
            <span data-part="channel">{entry.channel}</span>
            <span data-part="summary">{entry.summary}</span>
            <time data-part="timestamp" dateTime={entry.timestamp}>{entry.timestamp}</time>
            <span data-part="event-type">{entry.eventType}</span>
            {entry.direction !== null && (
              <span data-part="direction">{entry.direction}</span>
            )}
          </>
        )}
      </div>
    )
  },
)
TimelineEntry.displayName = 'ActivityTimeline.Entry'

export interface ActivityTimelineFiltersProps {
  className?: string
  children?: React.ReactNode
}

const ALL_CHANNELS: OEXTimelineChannel[] = ['voice', 'sms', 'email', 'linkedin', 'direct_mail', 'ai']

const TimelineFilters = forwardRef<HTMLDivElement, ActivityTimelineFiltersProps>(
  ({ className, children }, ref) => {
    const { fetchEntries, baseParams } = useTimelineContext()
    const [activeChannels, setActiveChannels] = useState<Set<OEXTimelineChannel>>(
      new Set(baseParams.channels ?? ALL_CHANNELS),
    )

    const toggleChannel = useCallback(
      (channel: OEXTimelineChannel) => {
        setActiveChannels((prev) => {
          const next = new Set(prev)
          if (next.has(channel)) {
            next.delete(channel)
          } else {
            next.add(channel)
          }
          const channels = next.size === ALL_CHANNELS.length ? undefined : Array.from(next)
          fetchEntries({ ...baseParams, channels })
          return next
        })
      },
      [fetchEntries, baseParams],
    )

    if (children) {
      return <div ref={ref} className={className} role="group" aria-label="Channel filters">{children}</div>
    }

    return (
      <div ref={ref} className={className} role="group" aria-label="Channel filters">
        {ALL_CHANNELS.map((channel) => {
          const isActive = activeChannels.has(channel)
          return (
            <button
              key={channel}
              data-channel={channel}
              data-active={String(isActive)}
              aria-pressed={isActive}
              onClick={() => toggleChannel(channel)}
            >
              {channel}
            </button>
          )
        })}
      </div>
    )
  },
)
TimelineFilters.displayName = 'ActivityTimeline.Filters'

export interface ActivityTimelineLoadMoreProps {
  className?: string
  children?: React.ReactNode
}

const TimelineLoadMore = forwardRef<HTMLButtonElement, ActivityTimelineLoadMoreProps>(
  ({ className, children }, ref) => {
    const { loadMore, hasMore, isLoading } = useTimelineContext()

    if (!hasMore) return null

    return (
      <button
        ref={ref}
        className={className}
        data-action="load-more"
        aria-label="Load more entries"
        disabled={isLoading}
        onClick={() => loadMore()}
      >
        {children ?? 'Load more'}
      </button>
    )
  },
)
TimelineLoadMore.displayName = 'ActivityTimeline.LoadMore'

// --- ActivityTimeline root ---

export interface ActivityTimelineProps {
  /** Filter by lead — passed through to the hook */
  leadId?: string
  /** Filter by company — passed through to the hook */
  companyId?: string
  /** Filter by campaign — passed through to the hook */
  campaignId?: string
  /** Initial channel filters */
  channels?: OEXTimelineChannel[]
  /** Initial direction filter */
  direction?: OEXTimelineDirection
  /** Page size */
  limit?: number
  /** Called when an entry is clicked */
  onEntryClick?: (entry: OEXTimelineEntry) => void
  /** Additional className for the root element */
  className?: string
  children?: React.ReactNode
}

const ActivityTimelineRoot = forwardRef<HTMLDivElement, ActivityTimelineProps>(
  ({ leadId, companyId, campaignId, channels, direction, limit, onEntryClick, className, children }, ref) => {
    const params: OEXTimelineParams = { leadId, companyId, campaignId, channels, direction, limit }
    const hookReturn = useActivityTimeline(params)
    const { entries, isLoading, error } = hookReturn

    const baseParams: Omit<OEXTimelineParams, 'offset'> = { leadId, companyId, campaignId, channels, direction, limit }

    const ctxValue: ActivityTimelineContextValue = {
      ...hookReturn,
      onEntryClick,
      baseParams,
    }

    const dataState = isLoading && entries.length === 0 ? 'loading' : error ? 'error' : 'ready'

    return (
      <ActivityTimelineContext.Provider value={ctxValue}>
        <div
          ref={ref}
          className={className}
          data-state={dataState}
          role="feed"
          aria-label="Activity timeline"
          aria-busy={isLoading}
        >
          {error && entries.length === 0 && (
            <div role="alert">{error.message}</div>
          )}
          {isLoading && entries.length === 0 && (
            <div data-state="loading" aria-busy="true">Loading...</div>
          )}
          {children ?? (
            <>
              {entries.map((entry) => (
                <TimelineEntry key={entry.id} entry={entry} />
              ))}
              <TimelineLoadMore />
            </>
          )}
        </div>
      </ActivityTimelineContext.Provider>
    )
  },
)
ActivityTimelineRoot.displayName = 'ActivityTimeline'

export const ActivityTimeline = Object.assign(ActivityTimelineRoot, {
  Entry: TimelineEntry,
  Filters: TimelineFilters,
  LoadMore: TimelineLoadMore,
})
