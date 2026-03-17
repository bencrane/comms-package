import { useContext, useState, useEffect, useCallback } from 'react'
import { OEXCommsContext, OEXCommsInternalContext } from '../providers/OEXCommsProvider'
import type { OEXError, Disposition, DispositionResponse } from '../types'
import { DISPOSITION_VALUES } from '../types'
import { createOEXError } from '../utils/errors'

export interface UseDispositionReturn {
  /** Submit a disposition for the last completed call */
  setDisposition: (disposition: Disposition, notes?: string) => Promise<void>
  /** The call SID of the last completed call (for which disposition can be set) */
  lastCallSid: string | null
  /** Whether a disposition submission is in progress */
  isSubmitting: boolean
  /** Whether disposition was successfully submitted */
  isSubmitted: boolean
  /** Current error, or null */
  error: OEXError | null
  /** Reset the submission state (for starting a new call cycle) */
  reset: () => void
}

export function useDisposition(): UseDispositionReturn {
  const context = useContext(OEXCommsContext)
  if (context === null) {
    throw new Error('useDisposition must be used within an OEXCommsProvider')
  }

  const internal = useContext(OEXCommsInternalContext)
  if (internal === null) {
    throw new Error('useDisposition must be used within an OEXCommsProvider')
  }

  const { apiClientRef, lastCallSidRef } = internal
  const { callState } = context

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [error, setError] = useState<OEXError | null>(null)

  // Auto-reset when a new call starts
  useEffect(() => {
    if (callState !== 'idle') {
      setIsSubmitting(false)
      setIsSubmitted(false)
      setError(null)
    }
  }, [callState])

  const setDisposition = useCallback(
    async (disposition: Disposition, notes?: string) => {
      if (!(DISPOSITION_VALUES as readonly string[]).includes(disposition)) {
        setError(createOEXError(0, `Invalid disposition value: ${disposition}`, false))
        return
      }

      const callSid = lastCallSidRef.current
      if (!callSid) {
        setError(createOEXError(0, 'No call SID available for disposition', false))
        return
      }

      if (!apiClientRef.current) {
        setError(createOEXError(0, 'API client not available', false))
        return
      }

      setIsSubmitting(true)
      setError(null)

      try {
        await apiClientRef.current.post<DispositionResponse>(
          `/api/voice/sessions/${callSid}/disposition`,
          { disposition, notes },
        )
        setIsSubmitted(true)
      } catch (err) {
        setError(err as OEXError)
      } finally {
        setIsSubmitting(false)
      }
    },
    [apiClientRef, lastCallSidRef],
  )

  const reset = useCallback(() => {
    setIsSubmitting(false)
    setIsSubmitted(false)
    setError(null)
  }, [])

  return {
    setDisposition,
    lastCallSid: lastCallSidRef.current,
    isSubmitting,
    isSubmitted,
    error,
    reset,
  }
}
