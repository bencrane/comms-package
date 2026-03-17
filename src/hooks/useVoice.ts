import { useContext } from 'react'
import { OEXCommsContext } from '../providers/OEXCommsProvider'
import type { OEXCallInfo, OEXCallState, OEXError } from '../types'

export interface UseVoiceReturn {
  /** Initiate an outbound call to the given phone number or client identity */
  connect: (to: string) => Promise<void>
  /** Disconnect the active call */
  disconnect: () => void
  /** Send DTMF digits during an active call */
  sendDigits: (digits: string) => void
  /** Mute or unmute the active call */
  mute: (shouldMute: boolean) => void
  /** Toggle mute on the active call */
  toggleMute: () => void
  /** Accept an incoming call */
  acceptIncoming: () => void
  /** Reject an incoming call */
  rejectIncoming: () => void
  /** Information about the active call, or null if no call */
  callInfo: OEXCallInfo | null
  /** Current call state */
  callState: OEXCallState
  /** Whether the Device is registered and ready to make calls */
  deviceReady: boolean
  /** Current error, or null */
  error: OEXError | null
}

export function useVoice(): UseVoiceReturn {
  const context = useContext(OEXCommsContext)
  if (context === null) {
    throw new Error('useVoice must be used within an OEXCommsProvider')
  }

  return {
    connect: context.connect,
    disconnect: context.disconnect,
    sendDigits: context.sendDigits,
    mute: context.mute,
    toggleMute: context.toggleMute,
    acceptIncoming: context.acceptIncoming,
    rejectIncoming: context.rejectIncoming,
    callInfo: context.callInfo,
    callState: context.callState,
    deviceReady: context.deviceReady,
    error: context.error,
  }
}
