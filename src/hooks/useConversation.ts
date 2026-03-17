import { useContext, useState, useEffect, useCallback } from 'react'
import { OEXCommsInternalContext } from '../providers/OEXCommsProvider'
import type { OEXError } from '../types'
import type { SendSmsResponse, SmsMessageResponse } from '../types'
import type { OEXMessage, OEXSendMessageOptions } from '../types'
import { mapSmsResponseToOEXMessage } from '../types'

export interface UseConversationReturn {
  /** Messages in this conversation thread, sorted chronologically (oldest first) */
  messages: OEXMessage[]
  /** Send a message to this conversation's phone number */
  send: (body: string, options?: Omit<OEXSendMessageOptions, 'fromNumber' | 'messagingServiceSid'>) => Promise<OEXMessage | null>
  /** Refresh the conversation thread */
  refresh: () => Promise<void>
  /** Whether messages are being loaded */
  isLoading: boolean
  /** Whether a send is in progress */
  isSending: boolean
  /** Current error, or null */
  error: OEXError | null
  /** The phone number this conversation is with */
  phoneNumber: string
}

export function useConversation(phoneNumber: string): UseConversationReturn {
  const internal = useContext(OEXCommsInternalContext)
  if (internal === null) {
    throw new Error('useConversation must be used within an OEXCommsProvider')
  }

  const { apiClientRef } = internal

  const [messages, setMessages] = useState<OEXMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState<OEXError | null>(null)

  const fetchThread = useCallback(async () => {
    if (!apiClientRef.current) {
      setError({ code: 0, message: 'API client not available', recoverable: false })
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const response = await apiClientRef.current.get<SmsMessageResponse[]>('/api/sms', {
        limit: '200',
      })
      const allMessages = response.map(mapSmsResponseToOEXMessage)
      const filtered = allMessages
        .filter((msg) => msg.from === phoneNumber || msg.to === phoneNumber)
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      setMessages(filtered)
    } catch (err) {
      setError(err as OEXError)
    } finally {
      setIsLoading(false)
    }
  }, [apiClientRef, phoneNumber])

  const refresh = useCallback(async () => {
    await fetchThread()
  }, [fetchThread])

  const send = useCallback(
    async (
      body: string,
      options?: Omit<OEXSendMessageOptions, 'fromNumber' | 'messagingServiceSid'>,
    ): Promise<OEXMessage | null> => {
      if (!apiClientRef.current) {
        setError({ code: 0, message: 'API client not available', recoverable: false })
        return null
      }

      setIsSending(true)
      setError(null)

      try {
        const requestBody = {
          to: phoneNumber,
          body,
          media_url: options?.mediaUrls ?? null,
          company_campaign_id: options?.campaignId ?? null,
          company_campaign_lead_id: options?.campaignLeadId ?? null,
        }

        const response = await apiClientRef.current.post<SendSmsResponse>('/api/sms', requestBody)

        // Fetch the full message record
        try {
          const fullMessage = await apiClientRef.current.get<SmsMessageResponse>(
            `/api/sms/${response.message_sid}`,
          )
          const mapped = mapSmsResponseToOEXMessage(fullMessage)
          setMessages((prev) => [...prev, mapped])
          setIsSending(false)
          return mapped
        } catch {
          // Construct partial OEXMessage from SendSmsResponse
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
          setMessages((prev) => [...prev, partial])
          setIsSending(false)
          return partial
        }
      } catch (err) {
        setError(err as OEXError)
        setIsSending(false)
        return null
      }
    },
    [apiClientRef, phoneNumber],
  )

  // Auto-fetch on mount and when phoneNumber changes
  useEffect(() => {
    setMessages([])
    setError(null)
    fetchThread()
  }, [fetchThread])

  return {
    messages,
    send,
    refresh,
    isLoading,
    isSending,
    error,
    phoneNumber,
  }
}
