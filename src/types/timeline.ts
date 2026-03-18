// --- Timeline Channel ---

export type OEXTimelineChannel = 'voice' | 'sms' | 'email' | 'linkedin' | 'direct_mail' | 'ai'

// --- Timeline Direction ---

export type OEXTimelineDirection = 'inbound' | 'outbound'

// --- Timeline Entry ---

export interface OEXTimelineEntry {
  /** Unique entry ID */
  id: string
  /** Source database table */
  sourceTable: string
  /** Event timestamp (ISO 8601) */
  timestamp: string
  /** Communication channel */
  channel: OEXTimelineChannel
  /** Event type (channel-specific, e.g., 'call_completed', 'sms_sent') */
  eventType: string
  /** Direction of the communication */
  direction: OEXTimelineDirection | null
  /** Human-readable event summary */
  summary: string
  /** Associated lead ID */
  leadId: string | null
  /** Associated campaign ID */
  campaignId: string | null
  /** Associated company ID */
  companyId: string | null
  /** Channel-specific metadata */
  metadata: Record<string, unknown>
}

// --- Timeline Params ---

export interface OEXTimelineParams {
  /** Filter by lead ID */
  leadId?: string
  /** Filter by company ID */
  companyId?: string
  /** Filter by campaign ID */
  campaignId?: string
  /** Filter by channels (array, sent as comma-separated) */
  channels?: OEXTimelineChannel[]
  /** Filter by direction */
  direction?: OEXTimelineDirection
  /** Return entries after this ISO 8601 timestamp */
  after?: string
  /** Return entries before this ISO 8601 timestamp */
  before?: string
  /** Page size (default 50) */
  limit?: number
  /** Pagination offset (default 0) */
  offset?: number
}

// --- API Response (internal) ---

export interface TimelineApiResponse {
  entries: Array<{
    id: string
    source_table: string
    timestamp: string
    channel: string
    event_type: string
    direction: string | null
    summary: string
    lead_id: string | null
    campaign_id: string | null
    company_id: string | null
    metadata: Record<string, unknown>
  }>
  total_fetched: number
  limit: number
  offset: number
}

// --- Mapping function (internal) ---

export function mapTimelineEntry(raw: TimelineApiResponse['entries'][number]): OEXTimelineEntry {
  return {
    id: raw.id,
    sourceTable: raw.source_table,
    timestamp: raw.timestamp,
    channel: raw.channel as OEXTimelineChannel,
    eventType: raw.event_type,
    direction: (raw.direction as OEXTimelineDirection) ?? null,
    summary: raw.summary,
    leadId: raw.lead_id,
    campaignId: raw.campaign_id,
    companyId: raw.company_id,
    metadata: raw.metadata,
  }
}
