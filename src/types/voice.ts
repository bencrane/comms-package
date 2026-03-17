import type { OEXError } from './index'
import type { Disposition } from './api'

// --- Device State ---

export type OEXDeviceState = 'unregistered' | 'registering' | 'registered' | 'destroyed'

// --- Call State ---

export type OEXCallState =
  | 'idle'
  | 'connecting'
  | 'ringing'
  | 'open'
  | 'reconnecting'
  | 'pending'
  | 'closed'

// --- Call Direction ---

export type OEXCallDirection = 'inbound' | 'outbound'

// --- Call Info ---

export interface OEXCallInfo {
  /** Call direction */
  direction: OEXCallDirection
  /** Remote phone number or client identity */
  from: string
  /** Called phone number or client identity */
  to: string
  /** Whether the call is currently muted */
  isMuted: boolean
  /** Twilio Call SID (available after connection) */
  callSid: string | null
}

// --- Provider Config ---

export interface OEXCommsConfig {
  /** Base URL of the OEX backend API */
  apiBaseUrl: string
  /** JWT auth token for the OEX backend */
  authToken: string
}

// --- Context Value ---

// --- Audio Devices ---

export interface OEXAudioDevice {
  deviceId: string
  label: string
  groupId: string
}

// --- Call Quality ---

export type OEXCallQualityLevel = 'excellent' | 'great' | 'good' | 'fair' | 'degraded'

export interface OEXCallQualityMetrics {
  /** Mean Opinion Score (1.0–4.5, null if unavailable) */
  mos: number | null
  /** Round-trip time in milliseconds */
  rtt: number
  /** Packet jitter */
  jitter: number
  /** Packet loss fraction (0.0–1.0) */
  packetLoss: number
  /** Overall quality level derived from MOS */
  qualityLevel: OEXCallQualityLevel | null
  /** Audio input level (0–32767) */
  audioInputLevel: number
  /** Audio output level (0–32767) */
  audioOutputLevel: number
  /** Codec in use */
  codec: string
  /** Timestamp of the sample */
  timestamp: number
}

export type OEXQualityWarningName =
  | 'high-rtt'
  | 'high-jitter'
  | 'high-packet-loss'
  | 'low-mos'
  | 'constant-audio-input-level'
  | 'constant-audio-output-level'

export interface OEXQualityWarning {
  name: OEXQualityWarningName
  value?: number
}

// --- Preflight ---

export type OEXPreflightStatus = 'idle' | 'connecting' | 'connected' | 'completed' | 'failed'

export interface OEXPreflightNetworkTiming {
  signaling?: { start: number; duration?: number; end?: number }
  ice?: { start: number; duration?: number; end?: number }
  dtls?: { start: number; duration?: number; end?: number }
  peerConnection?: { start: number; duration?: number; end?: number }
}

export interface OEXPreflightReport {
  /** Overall call quality assessment */
  qualityLevel: OEXCallQualityLevel
  /** Average MOS score */
  averageMos: number | null
  /** Average RTT in ms */
  averageRtt: number | null
  /** Average jitter */
  averageJitter: number | null
  /** Network timing breakdown */
  networkTiming: OEXPreflightNetworkTiming
  /** Edge location used */
  edge: string
  /** Warnings raised during test */
  warnings: string[]
  /** Test call SID */
  callSid: string
}

// --- Context Value ---

export interface OEXCommsContextValue {
  /** Current Device registration state */
  deviceState: OEXDeviceState
  /** Whether the Device is registered and ready to make/receive calls */
  deviceReady: boolean
  /** User identity from the token (populated when registered) */
  identity: string | null
  /** Current call state */
  callState: OEXCallState
  /** Information about the active call, or null if no call */
  callInfo: OEXCallInfo | null
  /** Current error, or null */
  error: OEXError | null
  /** Initiate an outbound call */
  connect: (to: string) => Promise<void>
  /** Disconnect the active call */
  disconnect: () => void
  /** Send DTMF digits */
  sendDigits: (digits: string) => void
  /** Mute or unmute the active call */
  mute: (shouldMute: boolean) => void
  /** Toggle mute on the active call */
  toggleMute: () => void
  /** Accept an incoming call */
  acceptIncoming: () => void
  /** Reject an incoming call */
  rejectIncoming: () => void
}

// --- Power Dialer ---

export interface OEXDialerLead {
  /** Unique identifier for the lead */
  id: string
  /** Phone number to dial */
  phoneNumber: string
  /** Display name (optional) */
  name?: string
  /** App-specific metadata — the dialer passes this through without interpreting it */
  metadata?: Record<string, unknown>
}

export type OEXDialerSessionState = 'idle' | 'active' | 'paused' | 'completed'

export type OEXDialerLeadState =
  | 'waiting'
  | 'dialing'
  | 'on_call'
  | 'awaiting_disposition'
  | 'completed'
  | 'skipped'

export interface OEXDialerLeadResult {
  leadId: string
  state: OEXDialerLeadState
  disposition?: Disposition
  callSid?: string
  /** Timestamp when the call started (ms since epoch) */
  callStartedAt?: number
  /** Timestamp when the call ended (ms since epoch) */
  callEndedAt?: number
}

export interface OEXDialerSessionStats {
  /** Total leads in the queue */
  totalLeads: number
  /** Number of calls completed (disposition captured) */
  callsCompleted: number
  /** Number of leads skipped */
  callsSkipped: number
  /** Number of leads remaining (not yet dialed or skipped) */
  callsRemaining: number
  /** Disposition breakdown — count per disposition value */
  outcomes: Partial<Record<Disposition, number>>
  /** Session start timestamp (ms since epoch), or null if not started */
  sessionStartedAt: number | null
  /** Session duration in milliseconds (updates while active) */
  sessionDurationMs: number
}

export interface OEXDialerOptions {
  /** Delay in ms before auto-advancing to the next lead (default: 1500) */
  advanceDelayMs?: number
}
