import { useContext } from 'react'
import { OEXCommsContext } from '../providers/OEXCommsProvider'
import type { OEXDeviceState, OEXError } from '../types'

export interface UseDeviceReturn {
  /** Current Device registration state */
  state: OEXDeviceState
  /** Whether the Device is registered and ready */
  deviceReady: boolean
  /** Whether the Device is currently on a call */
  isBusy: boolean
  /** User identity from the token */
  identity: string | null
  /** Current error, or null */
  error: OEXError | null
}

export function useDevice(): UseDeviceReturn {
  const context = useContext(OEXCommsContext)
  if (context === null) {
    throw new Error('useDevice must be used within an OEXCommsProvider')
  }

  return {
    state: context.deviceState,
    deviceReady: context.deviceState === 'registered',
    isBusy: context.callState !== 'idle',
    identity: context.identity,
    error: context.error,
  }
}
