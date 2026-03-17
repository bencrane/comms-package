// --- Voice ---

export type VoiceTokenResponse = {
  token: string
  identity: string
  ttl_seconds: number
}

export type VoiceSessionResponse = {
  id: string
  call_sid: string
  direction: string
  from_number: string
  to_number: string
  status: string
  agent_identity: string | null
  duration_seconds: number | null
  business_disposition: string | null
  amd_result: string | null
  recording_sid: string | null
  recording_url: string | null
  recording_duration_seconds: number | null
  company_id: string | null
  company_campaign_id: string | null
  company_campaign_lead_id: string | null
  started_at: string | null
  answered_at: string | null
  ended_at: string | null
  created_at: string
  updated_at: string
}

export type DispositionRequest = {
  disposition: string
  notes?: string | null
}

export type DispositionResponse = {
  call_sid: string
  business_disposition: string
  updated_at: string
}

export type CallActionRequest = {
  action: string
  twiml?: string | null
  url?: string | null
}

// --- Outbound Calls ---

export type OutboundCallRequest = {
  to: string
  from_number: string
  greeting_text?: string | null
  voicemail_text?: string | null
  voicemail_audio_url?: string | null
  human_message_text?: string | null
  record?: boolean
  timeout?: number
  company_campaign_id?: string | null
  company_campaign_lead_id?: string | null
}

export type OutboundCallResponse = {
  call_sid: string
  status: string
  direction: string
  from_number: string
  to: string
  voice_session_id: string | null
}

// --- SMS ---

export type SendSmsRequest = {
  to: string
  body?: string | null
  from_number?: string | null
  messaging_service_sid?: string | null
  media_url?: string[] | null
  company_campaign_id?: string | null
  company_campaign_lead_id?: string | null
}

export type SendSmsResponse = {
  message_sid: string
  status: string
  direction: string
  from_number: string
  to: string
}

export type SmsMessageResponse = {
  id: string
  message_sid: string
  direction: string
  from_number: string
  to_number: string
  body: string | null
  status: string
  error_code: number | null
  error_message: string | null
  num_segments: number | null
  num_media: number | null
  media_urls: string[] | null
  date_sent: string | null
  created_at: string
  updated_at: string
}

// --- Disposition & Action Values ---

export const DISPOSITION_VALUES = [
  'busy',
  'callback_scheduled',
  'disqualified',
  'do_not_call',
  'follow_up_needed',
  'gatekeeper',
  'left_voicemail',
  'meeting_booked',
  'no_answer',
  'not_interested',
  'other',
  'qualified',
  'wrong_number',
] as const

export type Disposition = (typeof DISPOSITION_VALUES)[number]

export const CALL_ACTION_VALUES = ['hangup', 'hold', 'redirect', 'unhold'] as const
export type CallAction = (typeof CALL_ACTION_VALUES)[number]
