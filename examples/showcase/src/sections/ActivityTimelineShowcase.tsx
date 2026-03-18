import React, { useState } from 'react'

type Channel = 'voice' | 'sms' | 'email' | 'linkedin' | 'direct_mail' | 'ai'

const ALL_CHANNELS: Channel[] = ['voice', 'sms', 'email', 'linkedin', 'direct_mail', 'ai']

const MOCK_ENTRIES = [
  { id: 'e1', channel: 'voice' as Channel, eventType: 'call_completed', direction: 'outbound' as const, summary: 'Call to +1 (555) 867-5309 (2m 15s)', timestamp: '2026-03-17T14:30:00Z' },
  { id: 'e2', channel: 'email' as Channel, eventType: 'email_opened', direction: 'outbound' as const, summary: 'Sarah opened "Warehouse Associate Opportunity"', timestamp: '2026-03-17T13:45:00Z' },
  { id: 'e3', channel: 'sms' as Channel, eventType: 'sms_received', direction: 'inbound' as const, summary: 'Received: "That sounds great! Is there overtime?"', timestamp: '2026-03-17T12:10:00Z' },
  { id: 'e4', channel: 'sms' as Channel, eventType: 'sms_sent', direction: 'outbound' as const, summary: 'Sent: "Hi Sarah, following up on the warehouse role..."', timestamp: '2026-03-17T11:55:00Z' },
  { id: 'e5', channel: 'linkedin' as Channel, eventType: 'linkedin_connection_request', direction: 'outbound' as const, summary: 'Connection request sent to Sarah Johnson', timestamp: '2026-03-16T16:20:00Z' },
  { id: 'e6', channel: 'ai' as Channel, eventType: 'draft_created', direction: null, summary: 'AI drafted follow-up email for Sarah Johnson', timestamp: '2026-03-16T15:00:00Z' },
  { id: 'e7', channel: 'direct_mail' as Channel, eventType: 'mail_sent', direction: 'outbound' as const, summary: 'Mailer sent to 123 Main St, Fremont CA', timestamp: '2026-03-15T09:00:00Z' },
  { id: 'e8', channel: 'voice' as Channel, eventType: 'call_missed', direction: 'inbound' as const, summary: 'Missed call from +1 (555) 867-5309', timestamp: '2026-03-14T17:30:00Z' },
  { id: 'e9', channel: 'email' as Channel, eventType: 'email_sent', direction: 'outbound' as const, summary: 'Sent "Warehouse Associate — Fremont Location"', timestamp: '2026-03-14T10:00:00Z' },
]

function formatTime(iso: string): string {
  const d = new Date(iso)
  const now = new Date('2026-03-17T15:00:00Z')
  const diffMs = now.getTime() - d.getTime()
  const diffH = Math.floor(diffMs / 3600000)
  if (diffH < 1) return 'Just now'
  if (diffH < 24) return `${diffH}h ago`
  const diffD = Math.floor(diffH / 24)
  if (diffD === 1) return 'Yesterday'
  return `${diffD}d ago`
}

export function ActivityTimelineShowcase() {
  const [activeChannels, setActiveChannels] = useState<Set<Channel>>(new Set(ALL_CHANNELS))
  const [hasMore, setHasMore] = useState(true)

  const toggleChannel = (ch: Channel) => {
    setActiveChannels((prev) => {
      const next = new Set(prev)
      if (next.has(ch)) next.delete(ch)
      else next.add(ch)
      return next
    })
  }

  const filtered = MOCK_ENTRIES.filter((e) => activeChannels.has(e.channel))

  return (
    <section className="showcase-section">
      <h2>ActivityTimeline</h2>
      <p>Cross-channel activity feed with channel filters, entries with data attributes, and load-more pagination.</p>

      <div className="showcase-demo">
        {/* ActivityTimeline root */}
        <div
          data-state="ready"
          role="feed"
          aria-label="Activity timeline"
          aria-busy={false}
        >
          {/* ActivityTimeline.Filters */}
          <div role="group" aria-label="Channel filters" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
            {ALL_CHANNELS.map((ch) => {
              const isActive = activeChannels.has(ch)
              return (
                <button
                  key={ch}
                  data-channel={ch}
                  data-active={String(isActive)}
                  aria-pressed={isActive}
                  onClick={() => toggleChannel(ch)}
                  style={{
                    padding: '4px 12px',
                    border: `1px solid ${isActive ? 'var(--oex-accent-primary)' : 'var(--oex-border-default)'}`,
                    borderRadius: 6,
                    background: isActive ? 'var(--oex-accent-primary)' : 'var(--oex-bg-primary)',
                    color: isActive ? 'white' : 'var(--oex-text-primary)',
                    fontSize: 12,
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                >
                  {ch}
                </button>
              )
            })}
          </div>

          {/* Entries */}
          {filtered.map((entry) => (
            <div
              key={entry.id}
              data-channel={entry.channel}
              data-event-type={entry.eventType}
              data-direction={entry.direction ?? undefined}
              data-entry-id={entry.id}
              role="article"
              tabIndex={0}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 12,
                padding: '12px 0',
                borderBottom: '1px solid var(--oex-border-default)',
                cursor: 'pointer',
              }}
            >
              <span
                data-part="channel"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 32,
                  height: 32,
                  borderRadius: 'var(--oex-radius-full)',
                  background: 'var(--oex-bg-tertiary)',
                  fontSize: 11,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  flexShrink: 0,
                  color: entry.channel === 'voice' ? 'var(--oex-accent-primary)'
                    : entry.channel === 'sms' ? 'var(--oex-accent-success)'
                    : entry.channel === 'email' ? 'var(--oex-text-warning)'
                    : entry.channel === 'linkedin' ? '#0A66C2'
                    : entry.channel === 'ai' ? '#8B5CF6'
                    : 'var(--oex-text-secondary)',
                }}
              >
                {entry.channel === 'voice' ? 'Ph' : entry.channel === 'sms' ? 'Sm' : entry.channel === 'email' ? 'Em' : entry.channel === 'linkedin' ? 'Li' : entry.channel === 'direct_mail' ? 'Dm' : 'Ai'}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <span data-part="summary" style={{ fontSize: 14, color: 'var(--oex-text-primary)', display: 'block' }}>
                  {entry.summary}
                </span>
                <div style={{ display: 'flex', gap: 8, marginTop: 4, fontSize: 11 }}>
                  <span data-part="event-type" style={{ color: 'var(--oex-text-tertiary)' }}>
                    {entry.eventType.replace(/_/g, ' ')}
                  </span>
                  {entry.direction && (
                    <span data-part="direction" style={{ color: 'var(--oex-text-tertiary)' }}>
                      {entry.direction}
                    </span>
                  )}
                </div>
              </div>
              <time
                data-part="timestamp"
                dateTime={entry.timestamp}
                style={{ fontSize: 11, color: 'var(--oex-text-tertiary)', whiteSpace: 'nowrap', flexShrink: 0 }}
              >
                {formatTime(entry.timestamp)}
              </time>
            </div>
          ))}

          {/* LoadMore */}
          {hasMore && (
            <button
              data-action="load-more"
              aria-label="Load more entries"
              onClick={() => setHasMore(false)}
              style={{
                display: 'block',
                margin: '16px auto 0',
                padding: '6px 20px',
                border: '1px solid var(--oex-border-default)',
                borderRadius: 'var(--oex-radius-full)',
                background: 'transparent',
                color: 'var(--oex-text-secondary)',
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              Load more
            </button>
          )}
        </div>
      </div>
    </section>
  )
}
