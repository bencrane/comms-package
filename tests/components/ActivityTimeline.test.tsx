import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { ActivityTimeline } from '../../src/components/ActivityTimeline'
import { useActivityTimeline } from '../../src/hooks/useActivityTimeline'
import type { OEXTimelineEntry } from '../../src/types'

vi.mock('../../src/hooks/useActivityTimeline', () => ({
  useActivityTimeline: vi.fn(),
}))

const mockUseActivityTimeline = useActivityTimeline as ReturnType<typeof vi.fn>

function makeEntry(overrides: Partial<OEXTimelineEntry> = {}): OEXTimelineEntry {
  return {
    id: 'entry-1',
    sourceTable: 'voice_sessions',
    timestamp: '2026-03-17T14:30:00Z',
    channel: 'voice',
    eventType: 'call_completed',
    direction: 'outbound',
    summary: 'Call to +15551234567 (45s)',
    leadId: 'lead-1',
    campaignId: 'camp-1',
    companyId: 'comp-1',
    metadata: {},
    ...overrides,
  }
}

function setupMock(overrides: Partial<ReturnType<typeof useActivityTimeline>> = {}) {
  const defaults = {
    entries: [] as OEXTimelineEntry[],
    fetchEntries: vi.fn(),
    refreshEntries: vi.fn(),
    loadMore: vi.fn(),
    hasMore: false,
    isLoading: false,
    error: null,
  }
  mockUseActivityTimeline.mockReturnValue({ ...defaults, ...overrides })
  return { ...defaults, ...overrides }
}

describe('ActivityTimeline', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders with role="feed" and data-state="ready" when entries exist', () => {
    const entry = makeEntry()
    setupMock({ entries: [entry] })
    render(<ActivityTimeline />)
    const feed = screen.getByRole('feed')
    expect(feed).toBeDefined()
    expect(feed.getAttribute('data-state')).toBe('ready')
  })

  it('renders loading state when isLoading is true and no entries', () => {
    setupMock({ isLoading: true, entries: [] })
    const { container } = render(<ActivityTimeline />)
    const feed = container.querySelector('[role="feed"]')
    expect(feed?.getAttribute('data-state')).toBe('loading')
    expect(feed?.getAttribute('aria-busy')).toBe('true')
  })

  it('each entry has data-channel and data-event-type attributes', () => {
    const entry = makeEntry({ channel: 'sms', eventType: 'sms_sent' })
    setupMock({ entries: [entry] })
    render(<ActivityTimeline />)
    const article = screen.getByRole('article')
    expect(article.getAttribute('data-channel')).toBe('sms')
    expect(article.getAttribute('data-event-type')).toBe('sms_sent')
  })

  it('entry has data-direction when direction is not null', () => {
    const entry = makeEntry({ direction: 'inbound' })
    setupMock({ entries: [entry] })
    render(<ActivityTimeline />)
    const article = screen.getByRole('article')
    expect(article.getAttribute('data-direction')).toBe('inbound')
  })

  it('entry onClick fires onEntryClick with the entry', () => {
    const entry = makeEntry()
    setupMock({ entries: [entry] })
    const onClick = vi.fn()
    render(<ActivityTimeline onEntryClick={onClick} />)
    fireEvent.click(screen.getByRole('article'))
    expect(onClick).toHaveBeenCalledWith(entry)
  })

  it('LoadMore button renders when hasMore is true', () => {
    const entry = makeEntry()
    setupMock({ entries: [entry], hasMore: true })
    render(<ActivityTimeline />)
    expect(screen.getByLabelText('Load more entries')).toBeDefined()
  })

  it('LoadMore button is hidden when hasMore is false', () => {
    const entry = makeEntry()
    setupMock({ entries: [entry], hasMore: false })
    render(<ActivityTimeline />)
    expect(screen.queryByLabelText('Load more entries')).toBeNull()
  })

  it('entry renders summary, timestamp, and channel in default content', () => {
    const entry = makeEntry({
      channel: 'email',
      summary: 'Email sent to john@example.com',
      timestamp: '2026-03-17T14:30:00Z',
    })
    setupMock({ entries: [entry] })
    render(<ActivityTimeline />)
    expect(screen.getByText('Email sent to john@example.com')).toBeDefined()
    expect(screen.getByText('2026-03-17T14:30:00Z')).toBeDefined()
    expect(screen.getByText('email')).toBeDefined()
  })
})
