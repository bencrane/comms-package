import { useContext, useState, useEffect, useCallback } from 'react'
import { OEXCommsContext, OEXCommsInternalContext } from '../providers/OEXCommsProvider'
import type { OEXError } from '../types'
import { createOEXError } from '../utils/errors'

export interface UseCallActionsReturn {
  /** Put the active call on hold via the backend */
  hold: () => Promise<void>
  /** Take the active call off hold via the backend */
  unhold: () => Promise<void>
  /** Whether the call is currently on hold */
  isOnHold: boolean
  /** Whether a hold/unhold action is in progress */
  isLoading: boolean
  /** Current error, or null */
  error: OEXError | null
}

export function useCallActions(): UseCallActionsReturn {
  const context = useContext(OEXCommsContext)
  if (context === null) {
    throw new Error('useCallActions must be used within an OEXCommsProvider')
  }

  const internal = useContext(OEXCommsInternalContext)
  if (internal === null) {
    throw new Error('useCallActions must be used within an OEXCommsProvider')
  }

  const { apiClientRef } = internal
  const { callState, callInfo } = context

  const [isOnHold, setIsOnHold] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<OEXError | null>(null)

  // Reset when call ends
  useEffect(() => {
    if (callState === 'idle') {
      setIsOnHold(false)
      setIsLoading(false)
      setError(null)
    }
  }, [callState])

  const hold = useCallback(async () => {
    if (callState !== 'open' || !callInfo?.callSid) {
      setError(createOEXError(0, 'No active call to hold', false))
      return
    }

    if (!apiClientRef.current) {
      setError(createOEXError(0, 'API client not available', false))
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      await apiClientRef.current.post(`/api/voice/sessions/${callInfo.callSid}/action`, {
        action: 'hold',
      })
      setIsOnHold(true)
    } catch (err) {
      setError(err as OEXError)
    } finally {
      setIsLoading(false)
    }
  }, [callState, callInfo, apiClientRef])

  const unhold = useCallback(async () => {
    if (callState !== 'open' || !callInfo?.callSid) {
      setError(createOEXError(0, 'No active call to unhold', false))
      return
    }

    if (!apiClientRef.current) {
      setError(createOEXError(0, 'API client not available', false))
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      await apiClientRef.current.post(`/api/voice/sessions/${callInfo.callSid}/action`, {
        action: 'unhold',
      })
      setIsOnHold(false)
    } catch (err) {
      setError(err as OEXError)
    } finally {
      setIsLoading(false)
    }
  }, [callState, callInfo, apiClientRef])

  return { hold, unhold, isOnHold, isLoading, error }
}
