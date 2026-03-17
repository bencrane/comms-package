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
