import { useContext, useState, useRef, useCallback } from 'react'
import { OEXCommsInternalContext } from '../providers/OEXCommsProvider'
import type { OEXError } from '../types'
import type { SendSmsRequest, SendSmsResponse, SmsMessageResponse } from '../types'
import type { OEXMessage, OEXSendMessageOptions, OEXMessageListParams } from '../types'
import { mapSmsResponseToOEXMessage } from '../types'

export interface UseMessagingReturn {
  /** Send an SMS/MMS message */
  sendMessage: (to: string, body: string, options?: OEXSendMessageOptions) => Promise<OEXMessage | null>
  /** Recent messages (from last fetchMessages/refreshMessages call) */
  messages: OEXMessage[]
  /** Fetch messages with optional filters and pagination */
  fetchMessages: (params?: OEXMessageListParams) => Promise<void>
  /** Re-fetch messages with the last used params */
  refreshMessages: () => Promise<void>
  /** Whether a send or fetch operation is in progress */
  isLoading: boolean
  /** Whether a send is in progress specifically */
  isSending: boolean
  /** Current error, or null */
  error: OEXError | null
}

export function useMessaging(): UseMessagingReturn {
  const internal = useContext(OEXCommsInternalContext)
  if (internal === null) {
    throw new Error('useMessaging must be used within an OEXCommsProvider')
  }

  const { apiClientRef } = internal

  const [messages, setMessages] = useState<OEXMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState<OEXError | null>(null)
  const lastFetchParamsRef = useRef<OEXMessageListParams | undefined>(undefined)

  const sendMessage = useCallback(
    async (to: string, body: string, options?: OEXSendMessageOptions): Promise<OEXMessage | null> => {
      if (!apiClientRef.current) {
        setError({ code: 0, message: 'API client not available', recoverable: false })
        return null
      }

      setIsSending(true)
      setError(null)

      try {
        const requestBody: SendSmsRequest = {
          to,
          body,
          from_number: options?.fromNumber ?? null,
          messaging_service_sid: options?.messagingServiceSid ?? null,
          media_url: options?.mediaUrls ?? null,
          company_campaign_id: options?.campaignId ?? null,
          company_campaign_lead_id: options?.campaignLeadId ?? null,
        }

        const response = await apiClientRef.current.post<SendSmsResponse>('/api/sms', requestBody)

        // Fetch the full message record for a complete OEXMessage
        try {
          const fullMessage = await apiClientRef.current.get<SmsMessageResponse>(
            `/api/sms/${response.message_sid}`,
          )
          const mapped = mapSmsResponseToOEXMessage(fullMessage)
          setIsSending(false)
          return mapped
        } catch {
          // If fetch fails, construct a partial OEXMessage from SendSmsResponse
          const partial: OEXMessage = {
            id: '',
            messageSid: response.message_sid,
            direction: response.direction as OEXMessage['direction'],
            from: response.from_number,
            to: response.to,
            body,
            status: response.status as OEXMessage['status'],
            errorCode: null,
            errorMessage: null,
            segments: null,
            mediaCount: null,
            mediaUrls: options?.mediaUrls ?? null,
            sentAt: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }
          setIsSending(false)
          return partial
        }
      } catch (err) {
        setError(err as OEXError)
        setIsSending(false)
        return null
      }
    },
    [apiClientRef],
  )

  const fetchMessages = useCallback(
    async (params?: OEXMessageListParams): Promise<void> => {
      if (!apiClientRef.current) {
        setError({ code: 0, message: 'API client not available', recoverable: false })
        return
      }

      setIsLoading(true)
      setError(null)
      lastFetchParamsRef.current = params

      try {
        const queryParams: Record<string, string> = {}
        if (params?.direction) queryParams.direction = params.direction
        if (params?.status) queryParams.status = params.status
        if (params?.limit !== undefined) queryParams.limit = String(params.limit)
        if (params?.offset !== undefined) queryParams.offset = String(params.offset)

        const response = await apiClientRef.current.get<SmsMessageResponse[]>('/api/sms', queryParams)
        setMessages(response.map(mapSmsResponseToOEXMessage))
      } catch (err) {
        setError(err as OEXError)
      } finally {
        setIsLoading(false)
      }
    },
    [apiClientRef],
  )

  const refreshMessages = useCallback(async (): Promise<void> => {
    await fetchMessages(lastFetchParamsRef.current)
  }, [fetchMessages])

  return {
    sendMessage,
    messages,
    fetchMessages,
    refreshMessages,
    isLoading,
    isSending,
    error,
  }
}
