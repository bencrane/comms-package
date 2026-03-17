import React, {
  createContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from 'react'
import { Client } from '@twilio/conversations'
import type {
  OEXConversationsClientState,
  OEXConversationsConnectionState,
  OEXConversationsContextValue,
} from '../types'
import type { OEXError, VoiceTokenResponse } from '../types'
import { ApiClient } from '../services/api-client'
import { createOEXError } from '../utils/errors'

// --- Public Context ---

export const OEXConversationsContext = createContext<OEXConversationsContextValue | null>(null)

// --- Internal Context (not exported from src/index.ts) ---

export interface OEXConversationsInternalContextValue {
  clientRef: React.RefObject<Client | null>
  apiClientRef: React.RefObject<ApiClient | null>
}

export const OEXConversationsInternalContext =
  createContext<OEXConversationsInternalContextValue | null>(null)

// --- State & Reducer ---

interface ConversationsState {
  clientState: OEXConversationsClientState
  connectionState: OEXConversationsConnectionState
  identity: string | null
  error: OEXError | null
}

type ConversationsAction =
  | { type: 'CLIENT_STATE_CHANGED'; state: OEXConversationsClientState }
  | { type: 'CONNECTION_STATE_CHANGED'; state: OEXConversationsConnectionState }
  | { type: 'IDENTITY_SET'; identity: string }
  | { type: 'ERROR'; error: OEXError }
  | { type: 'CLEAR_ERROR' }

const initialState: ConversationsState = {
  clientState: 'uninitialized',
  connectionState: 'disconnected',
  identity: null,
  error: null,
}

function conversationsReducer(
  state: ConversationsState,
  action: ConversationsAction,
): ConversationsState {
  switch (action.type) {
    case 'CLIENT_STATE_CHANGED':
      return { ...state, clientState: action.state, error: null }
    case 'CONNECTION_STATE_CHANGED':
      return { ...state, connectionState: action.state }
    case 'IDENTITY_SET':
      return { ...state, identity: action.identity }
    case 'ERROR':
      return { ...state, error: action.error }
    case 'CLEAR_ERROR':
      return { ...state, error: null }
    default:
      return state
  }
}

// --- Provider Props ---

interface OEXConversationsProviderProps {
  apiBaseUrl: string
  authToken: string
  tokenUrl?: string
  children: ReactNode
}

// --- Provider Component ---

export function OEXConversationsProvider({
  apiBaseUrl,
  authToken,
  tokenUrl = '/api/conversations/token',
  children,
}: OEXConversationsProviderProps) {
  const [state, dispatch] = useReducer(conversationsReducer, initialState)
  const clientRef = useRef<Client | null>(null)
  const apiClientRef = useRef<ApiClient | null>(null)

  // Initialization effect
  useEffect(() => {
    let destroyed = false
    const apiClient = new ApiClient({ apiBaseUrl, authToken })
    apiClientRef.current = apiClient

    dispatch({ type: 'CLIENT_STATE_CHANGED', state: 'initializing' })

    async function init() {
      let tokenValue: string
      let identity: string

      try {
        const tokenResponse = await apiClient.get<VoiceTokenResponse>(tokenUrl)
        tokenValue = tokenResponse.token
        identity = tokenResponse.identity
      } catch (err) {
        if (destroyed) return
        const error = err as { code?: number; message?: string }
        dispatch({
          type: 'ERROR',
          error: createOEXError(
            error.code ?? 0,
            error.message ?? 'Failed to fetch conversations token',
          ),
        })
        dispatch({ type: 'CLIENT_STATE_CHANGED', state: 'failed' })
        return
      }

      if (destroyed) return

      const client = new Client(tokenValue)
      clientRef.current = client

      // Wire stateChanged
      client.on('stateChanged', (clientState: string) => {
        if (destroyed) return
        if (clientState === 'initialized') {
          dispatch({ type: 'CLIENT_STATE_CHANGED', state: 'initialized' })
          dispatch({ type: 'IDENTITY_SET', identity })
        } else if (clientState === 'failed') {
          dispatch({ type: 'CLIENT_STATE_CHANGED', state: 'failed' })
          dispatch({
            type: 'ERROR',
            error: createOEXError(0, 'Conversations client initialization failed'),
          })
        }
      })

      // Wire connectionStateChanged
      client.on('connectionStateChanged', (connectionState: string) => {
        if (destroyed) return
        dispatch({
          type: 'CONNECTION_STATE_CHANGED',
          state: connectionState as OEXConversationsConnectionState,
        })
      })

      // Wire tokenAboutToExpire
      client.on('tokenAboutToExpire', async () => {
        try {
          const response = await apiClient.get<VoiceTokenResponse>(tokenUrl)
          await client.updateToken(response.token)
        } catch (err) {
          if (destroyed) return
          const error = err as { code?: number; message?: string }
          dispatch({
            type: 'ERROR',
            error: createOEXError(
              error.code ?? 0,
              error.message ?? 'Conversations token refresh failed',
            ),
          })
        }
      })

      // Wire tokenExpired (fallback)
      client.on('tokenExpired', async () => {
        try {
          const response = await apiClient.get<VoiceTokenResponse>(tokenUrl)
          await client.updateToken(response.token)
        } catch (err) {
          if (destroyed) return
          const error = err as { code?: number; message?: string }
          dispatch({
            type: 'ERROR',
            error: createOEXError(
              error.code ?? 0,
              error.message ?? 'Conversations token refresh failed (expired)',
            ),
          })
        }
      })
    }

    init()

    return () => {
      destroyed = true
      try {
        clientRef.current?.shutdown()
      } catch {
        // Ignore shutdown errors during cleanup
      }
      clientRef.current = null
      apiClientRef.current = null
    }
  }, [apiBaseUrl, authToken, tokenUrl])

  // --- Context values ---

  const contextValue = useMemo<OEXConversationsContextValue>(
    () => ({
      clientState: state.clientState,
      connectionState: state.connectionState,
      isReady: state.clientState === 'initialized' && state.connectionState === 'connected',
      identity: state.identity,
      error: state.error,
    }),
    [state],
  )

  const internalContextValue = useMemo<OEXConversationsInternalContextValue>(
    () => ({
      clientRef,
      apiClientRef,
    }),
    [], // refs are stable
  )

  return (
    <OEXConversationsInternalContext.Provider value={internalContextValue}>
      <OEXConversationsContext.Provider value={contextValue}>
        {children}
      </OEXConversationsContext.Provider>
    </OEXConversationsInternalContext.Provider>
  )
}
