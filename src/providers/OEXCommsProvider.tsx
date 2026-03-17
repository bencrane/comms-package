import React, {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from 'react'
import { Device, Call } from '@twilio/voice-sdk'
import type { OEXCommsContextValue, OEXDeviceState, OEXCallState, OEXCallInfo } from '../types'
import type { OEXError } from '../types'
import { ApiClient } from '../services/api-client'
import { TokenManager } from '../services/token-manager'
import { createOEXError, createTwilioOEXError } from '../utils/errors'

// --- Context ---

export const OEXCommsContext = createContext<OEXCommsContextValue | null>(null)

// --- Internal Context (not exported from src/index.ts) ---

export interface OEXCommsInternalContextValue {
  deviceRef: React.RefObject<Device | null>
  callRef: React.RefObject<Call | null>
  apiClientRef: React.RefObject<ApiClient | null>
  tokenManagerRef: React.RefObject<TokenManager | null>
  dispatch: React.Dispatch<CommsAction>
  lastCallSidRef: React.RefObject<string | null>
}

export const OEXCommsInternalContext = createContext<OEXCommsInternalContextValue | null>(null)

// --- State & Reducer ---

interface CommsState {
  deviceState: OEXDeviceState
  identity: string | null
  callState: OEXCallState
  callInfo: OEXCallInfo | null
  error: OEXError | null
}

export type CommsAction =
  | { type: 'DEVICE_STATE_CHANGED'; state: OEXDeviceState }
  | { type: 'IDENTITY_SET'; identity: string }
  | { type: 'CALL_STATE_CHANGED'; callState: OEXCallState; callInfo: OEXCallInfo | null }
  | { type: 'CALL_MUTE_CHANGED'; isMuted: boolean }
  | { type: 'CALL_ENDED' }
  | { type: 'ERROR'; error: OEXError }
  | { type: 'CLEAR_ERROR' }
  | { type: 'INCOMING_CALL'; callInfo: OEXCallInfo }
  | { type: 'CALL_SID_SET'; callSid: string }

const initialState: CommsState = {
  deviceState: 'unregistered',
  identity: null,
  callState: 'idle',
  callInfo: null,
  error: null,
}

function commsReducer(state: CommsState, action: CommsAction): CommsState {
  switch (action.type) {
    case 'DEVICE_STATE_CHANGED':
      return { ...state, deviceState: action.state, error: null }
    case 'IDENTITY_SET':
      return { ...state, identity: action.identity }
    case 'CALL_STATE_CHANGED':
      return {
        ...state,
        callState: action.callState,
        callInfo: action.callInfo ?? state.callInfo,
        error: null,
      }
    case 'CALL_MUTE_CHANGED':
      if (!state.callInfo) return state
      return { ...state, callInfo: { ...state.callInfo, isMuted: action.isMuted } }
    case 'CALL_ENDED':
      return { ...state, callState: 'idle', callInfo: null }
    case 'ERROR':
      return { ...state, error: action.error }
    case 'CLEAR_ERROR':
      return { ...state, error: null }
    case 'INCOMING_CALL':
      return { ...state, callState: 'pending', callInfo: action.callInfo }
    case 'CALL_SID_SET':
      if (!state.callInfo) return state
      return { ...state, callInfo: { ...state.callInfo, callSid: action.callSid } }
    default:
      return state
  }
}

// --- Provider Props ---

interface OEXCommsProviderProps {
  apiBaseUrl: string
  authToken: string
  children: ReactNode
}

// --- Provider Component ---

export function OEXCommsProvider({ apiBaseUrl, authToken, children }: OEXCommsProviderProps) {
  const [state, dispatch] = useReducer(commsReducer, initialState)
  const deviceRef = useRef<Device | null>(null)
  const tokenManagerRef = useRef<TokenManager | null>(null)
  const callRef = useRef<Call | null>(null)
  const apiClientRef = useRef<ApiClient | null>(null)
  const lastCallSidRef = useRef<string | null>(null)

  // Subscribe to all events on a Call instance
  const wireCallEvents = useCallback((call: Call) => {
    call.on('ringing', () => {
      dispatch({
        type: 'CALL_STATE_CHANGED',
        callState: 'ringing',
        callInfo: null,
      })
    })

    call.on('accept', () => {
      dispatch({
        type: 'CALL_STATE_CHANGED',
        callState: 'open',
        callInfo: null,
      })
      const callSid = call.parameters?.CallSid ?? null
      if (callSid) {
        dispatch({ type: 'CALL_SID_SET', callSid })
      }
    })

    call.on('reconnecting', () => {
      dispatch({
        type: 'CALL_STATE_CHANGED',
        callState: 'reconnecting',
        callInfo: null,
      })
    })

    call.on('reconnected', () => {
      dispatch({
        type: 'CALL_STATE_CHANGED',
        callState: 'open',
        callInfo: null,
      })
    })

    call.on('disconnect', () => {
      if (callRef.current) {
        lastCallSidRef.current = callRef.current.parameters?.CallSid ?? null
      }
      callRef.current = null
      dispatch({ type: 'CALL_ENDED' })
    })

    call.on('cancel', () => {
      if (callRef.current) {
        lastCallSidRef.current = callRef.current.parameters?.CallSid ?? null
      }
      callRef.current = null
      dispatch({ type: 'CALL_ENDED' })
    })

    call.on('reject', () => {
      if (callRef.current) {
        lastCallSidRef.current = callRef.current.parameters?.CallSid ?? null
      }
      callRef.current = null
      dispatch({ type: 'CALL_ENDED' })
    })

    call.on('error', (error: { code?: number; message?: string }) => {
      dispatch({
        type: 'ERROR',
        error: error.code ? createTwilioOEXError(error.code, error.message) : createOEXError(0, error.message ?? 'Call error'),
      })
    })

    call.on('mute', (isMuted: boolean) => {
      dispatch({ type: 'CALL_MUTE_CHANGED', isMuted })
    })
  }, [])

  // Initialization effect
  useEffect(() => {
    if (!Device.isSupported) {
      dispatch({
        type: 'ERROR',
        error: createOEXError(0, 'Browser does not support WebRTC voice calling', false),
      })
      return
    }

    let destroyed = false
    const apiClient = new ApiClient({ apiBaseUrl, authToken })
    apiClientRef.current = apiClient
    const tokenManager = new TokenManager(apiClient)
    tokenManagerRef.current = tokenManager

    async function init() {
      let tokenValue: string
      let identity: string

      try {
        const tokenResponse = await tokenManager.fetchToken()
        tokenValue = tokenResponse.token
        identity = tokenResponse.identity
      } catch (err) {
        if (destroyed) return
        const error = err as { code?: number; message?: string }
        dispatch({
          type: 'ERROR',
          error: error.code ? createTwilioOEXError(error.code, error.message) : createOEXError(0, error.message ?? 'Failed to fetch voice token'),
        })
        return
      }

      if (destroyed) return

      const device = new Device(tokenValue, {
        closeProtection: true,
        codecPreferences: [Call.Codec.Opus, Call.Codec.PCMU],
        enableImprovedSignalingErrorPrecision: true,
      })
      deviceRef.current = device

      // Device event wiring
      device.on('registering', () => {
        dispatch({ type: 'DEVICE_STATE_CHANGED', state: 'registering' })
      })

      device.on('registered', () => {
        dispatch({ type: 'DEVICE_STATE_CHANGED', state: 'registered' })
        if (device.identity) {
          dispatch({ type: 'IDENTITY_SET', identity: device.identity })
        }
      })

      device.on('unregistered', () => {
        dispatch({ type: 'DEVICE_STATE_CHANGED', state: 'unregistered' })
      })

      device.on('destroyed', () => {
        dispatch({ type: 'DEVICE_STATE_CHANGED', state: 'destroyed' })
      })

      device.on('error', (error: { code?: number; message?: string }) => {
        dispatch({
          type: 'ERROR',
          error: error.code ? createTwilioOEXError(error.code, error.message) : createOEXError(0, error.message ?? 'Device error'),
        })
      })

      device.on('tokenWillExpire', async () => {
        try {
          const response = await tokenManager.fetchToken()
          device.updateToken(response.token)
        } catch (err) {
          const error = err as { code?: number; message?: string }
          dispatch({
            type: 'ERROR',
            error: error.code ? createTwilioOEXError(error.code, error.message) : createOEXError(0, error.message ?? 'Token refresh failed'),
          })
        }
      })

      device.on('incoming', (incomingCall: Call) => {
        callRef.current = incomingCall
        wireCallEvents(incomingCall)

        const callInfo: OEXCallInfo = {
          direction: 'inbound',
          from: incomingCall.parameters?.From ?? '',
          to: incomingCall.parameters?.To ?? '',
          isMuted: false,
          callSid: incomingCall.parameters?.CallSid ?? null,
        }
        dispatch({ type: 'INCOMING_CALL', callInfo })
      })

      // Register device
      try {
        await device.register()
      } catch (err) {
        if (destroyed) return
        const error = err as { code?: number; message?: string }
        dispatch({
          type: 'ERROR',
          error: error.code ? createTwilioOEXError(error.code, error.message) : createOEXError(0, error.message ?? 'Device registration failed'),
        })
      }

      // Start proactive auto-refresh
      tokenManager.startAutoRefresh()

      // Wire proactive refresh path
      tokenManager.onTokenUpdated((event) => {
        try {
          device.updateToken(event.token)
        } catch {
          // Device may be destroyed — ignore
        }
      })

      tokenManager.onTokenError((event) => {
        dispatch({
          type: 'ERROR',
          error: { code: event.code, message: event.message, recoverable: event.recoverable },
        })
      })

      // Set identity from initial token
      dispatch({ type: 'IDENTITY_SET', identity })
    }

    init()

    return () => {
      destroyed = true
      try {
        deviceRef.current?.destroy()
      } catch {
        // Ignore destroy errors during cleanup
      }
      deviceRef.current = null
      tokenManager.destroy()
      tokenManagerRef.current = null
      apiClientRef.current = null
      callRef.current = null
    }
  }, [apiBaseUrl, authToken, wireCallEvents])

  // --- Action methods ---

  const connect = useCallback(
    async (to: string) => {
      const device = deviceRef.current
      if (!device || state.deviceState !== 'registered') {
        dispatch({
          type: 'ERROR',
          error: createOEXError(0, 'Device is not registered', false),
        })
        return
      }
      if (callRef.current) {
        dispatch({
          type: 'ERROR',
          error: createOEXError(0, 'Already on a call', false),
        })
        return
      }

      const callInfo: OEXCallInfo = {
        direction: 'outbound',
        from: state.identity ?? '',
        to,
        isMuted: false,
        callSid: null,
      }
      dispatch({ type: 'CALL_STATE_CHANGED', callState: 'connecting', callInfo })

      try {
        const call = await device.connect({ params: { To: to } })
        callRef.current = call
        wireCallEvents(call)
      } catch (err) {
        dispatch({ type: 'CALL_ENDED' })
        const error = err as { code?: number; message?: string }
        dispatch({
          type: 'ERROR',
          error: error.code ? createTwilioOEXError(error.code, error.message) : createOEXError(0, error.message ?? 'Failed to connect call'),
        })
      }
    },
    [state.deviceState, state.identity, wireCallEvents],
  )

  const disconnect = useCallback(() => {
    try {
      callRef.current?.disconnect()
    } catch {
      // Ignore errors during disconnect
    }
  }, [])

  const sendDigits = useCallback(
    (digits: string) => {
      if (callRef.current && state.callState === 'open') {
        try {
          callRef.current.sendDigits(digits)
        } catch {
          // Ignore errors during sendDigits
        }
      }
    },
    [state.callState],
  )

  const mute = useCallback((shouldMute: boolean) => {
    try {
      callRef.current?.mute(shouldMute)
    } catch {
      // Ignore errors during mute
    }
  }, [])

  const toggleMute = useCallback(() => {
    const call = callRef.current
    if (call) {
      try {
        call.mute(!call.isMuted())
      } catch {
        // Ignore errors during toggleMute
      }
    }
  }, [])

  const acceptIncoming = useCallback(() => {
    if (callRef.current && state.callState === 'pending') {
      try {
        callRef.current.accept()
      } catch {
        // Ignore errors during accept
      }
    }
  }, [state.callState])

  const rejectIncoming = useCallback(() => {
    if (callRef.current && state.callState === 'pending') {
      try {
        callRef.current.reject()
      } catch {
        // Ignore errors during reject
      }
    }
  }, [state.callState])

  // --- Context value ---

  const contextValue = useMemo<OEXCommsContextValue>(
    () => ({
      deviceState: state.deviceState,
      deviceReady: state.deviceState === 'registered',
      identity: state.identity,
      callState: state.callState,
      callInfo: state.callInfo,
      error: state.error,
      connect,
      disconnect,
      sendDigits,
      mute,
      toggleMute,
      acceptIncoming,
      rejectIncoming,
    }),
    [
      state.deviceState,
      state.identity,
      state.callState,
      state.callInfo,
      state.error,
      connect,
      disconnect,
      sendDigits,
      mute,
      toggleMute,
      acceptIncoming,
      rejectIncoming,
    ],
  )

  const internalContextValue = useMemo<OEXCommsInternalContextValue>(
    () => ({
      deviceRef,
      callRef,
      apiClientRef,
      tokenManagerRef,
      dispatch,
      lastCallSidRef,
    }),
    [], // refs and dispatch are stable
  )

  return (
    <OEXCommsInternalContext.Provider value={internalContextValue}>
      <OEXCommsContext.Provider value={contextValue}>{children}</OEXCommsContext.Provider>
    </OEXCommsInternalContext.Provider>
  )
}
