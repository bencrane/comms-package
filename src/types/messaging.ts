import type { SmsMessageResponse } from './api'

export type OEXMessageDirection = 'inbound' | 'outbound'

export type OEXMessageStatus =
  | 'queued'
  | 'sending'
  | 'sent'
  | 'delivered'
  | 'failed'
  | 'undelivered'
  | 'received'

export const TERMINAL_MESSAGE_STATUSES: readonly OEXMessageStatus[] = [
  'delivered',
  'failed',
  'undelivered',
  'received',
] as const

export interface OEXMessage {
  /** Internal UUID */
  id: string
  /** Twilio Message SID */
  messageSid: string
  /** Message direction */
  direction: OEXMessageDirection
  /** Sender phone number */
  from: string
  /** Recipient phone number */
  to: string
  /** Message body text */
  body: string | null
  /** Delivery status */
  status: OEXMessageStatus
  /** Twilio error code if failed */
  errorCode: number | null
  /** Twilio error message if failed */
  errorMessage: string | null
  /** Number of SMS segments */
  segments: number | null
  /** Number of media attachments */
  mediaCount: number | null
  /** URLs of attached media (MMS) */
  mediaUrls: string[] | null
  /** When the message was sent */
  sentAt: string | null
  /** When the record was created */
  createdAt: string
  /** When the record was last updated */
  updatedAt: string
}

export interface OEXSendMessageOptions {
  /** Sender phone number (E.164). Mutually exclusive with messagingServiceSid. */
  fromNumber?: string
  /** Messaging Service SID for sender pool routing. Mutually exclusive with fromNumber. */
  messagingServiceSid?: string
  /** Media URLs to attach (MMS). Max 10. */
  mediaUrls?: string[]
  /** Associated campaign ID */
  campaignId?: string
  /** Associated campaign lead ID */
  campaignLeadId?: string
}

export interface OEXMessageListParams {
  /** Filter by direction */
  direction?: OEXMessageDirection
  /** Filter by status */
  status?: OEXMessageStatus
  /** Page size (1–200, default 50) */
  limit?: number
  /** Pagination offset (default 0) */
  offset?: number
}

export interface OEXMessageStatusPollOptions {
  /** Polling interval in ms (default: 3000) */
  intervalMs?: number
  /** Stop polling after this many ms (default: 300000 = 5 min) */
  timeoutMs?: number
}

export function mapSmsResponseToOEXMessage(raw: SmsMessageResponse): OEXMessage {
  return {
    id: raw.id,
    messageSid: raw.message_sid,
    direction: raw.direction as OEXMessageDirection,
    from: raw.from_number,
    to: raw.to_number,
    body: raw.body,
    status: raw.status as OEXMessageStatus,
    errorCode: raw.error_code,
    errorMessage: raw.error_message,
    segments: raw.num_segments,
    mediaCount: raw.num_media,
    mediaUrls: raw.media_urls,
    sentAt: raw.date_sent,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  }
}
