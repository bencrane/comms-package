import type { OEXError } from './index'

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
