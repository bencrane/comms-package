import { useContext, useState, useEffect, useCallback, useRef } from 'react'
import { OEXCommsInternalContext } from '../providers/OEXCommsProvider'
import type { OEXError } from '../types'
import type { SmsMessageResponse } from '../types'
import type { OEXMessage, OEXMessageStatus, OEXMessageStatusPollOptions } from '../types'
import { TERMINAL_MESSAGE_STATUSES, mapSmsResponseToOEXMessage } from '../types'

export interface UseMessageStatusReturn {
  /** Current message details, or null if not yet fetched */
  message: OEXMessage | null
  /** Current delivery status */
  status: OEXMessageStatus | null
  /** Whether the message has reached a terminal status */
  isTerminal: boolean
  /** Whether polling is active */
  isPolling: boolean
  /** Current error, or null */
  error: OEXError | null
  /** Manually refresh the status (one-off fetch, independent of polling) */
  refresh: () => Promise<void>
  /** Start polling */
  startPolling: () => void
  /** Stop polling */
  stopPolling: () => void
}

export function useMessageStatus(
  messageSid: string | null,
  options?: OEXMessageStatusPollOptions,
): UseMessageStatusReturn {
  const internal = useContext(OEXCommsInternalContext)
  if (internal === null) {
    throw new Error('useMessageStatus must be used within an OEXCommsProvider')
  }

  const { apiClientRef } = internal

  const [message, setMessage] = useState<OEXMessage | null>(null)
  const [status, setStatus] = useState<OEXMessageStatus | null>(null)
  const [isPolling, setIsPolling] = useState(false)
  const [error, setError] = useState<OEXError | null>(null)

  const isTerminal = status !== null && (TERMINAL_MESSAGE_STATUSES as readonly string[]).includes(status)

  // Use ref so polling effect can read latest without re-running
  const isPollingRef = useRef(isPolling)
  isPollingRef.current = isPolling

  const fetchStatus = useCallback(async () => {
    if (!messageSid || !apiClientRef.current) return

    try {
      const response = await apiClientRef.current.get<SmsMessageResponse>(
        `/api/sms/${messageSid}`,
      )
      const mapped = mapSmsResponseToOEXMessage(response)
      setMessage(mapped)
      setStatus(mapped.status)

      if ((TERMINAL_MESSAGE_STATUSES as readonly string[]).includes(mapped.status)) {
        setIsPolling(false)
      }
    } catch (err) {
      setError(err as OEXError)
    }
  }, [messageSid, apiClientRef])

  const startPolling = useCallback(() => {
    setIsPolling(true)
  }, [])

  const stopPolling = useCallback(() => {
    setIsPolling(false)
  }, [])

  const refresh = useCallback(async () => {
    await fetchStatus()
  }, [fetchStatus])

  // Reset state when messageSid changes
  useEffect(() => {
    setMessage(null)
    setStatus(null)
    setIsPolling(false)
    setError(null)
  }, [messageSid])

  // Polling effect
  useEffect(() => {
    if (!isPolling || !messageSid) return

    // Fetch immediately on start
    fetchStatus()

    const intervalMs = options?.intervalMs ?? 3000
    const timeoutMs = options?.timeoutMs ?? 300000

    const interval = setInterval(() => {
      fetchStatus()
    }, intervalMs)

    const timeout = setTimeout(() => {
      setIsPolling(false)
    }, timeoutMs)

    return () => {
      clearInterval(interval)
      clearTimeout(timeout)
    }
  }, [isPolling, messageSid]) // eslint-disable-line react-hooks/exhaustive-deps

  return {
    message,
    status,
    isTerminal,
    isPolling,
    error,
    refresh,
    startPolling,
    stopPolling,
  }
}
