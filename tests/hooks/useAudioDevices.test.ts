import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { useAudioDevices } from '../../src/hooks/useAudioDevices'
import { OEXCommsContext, OEXCommsInternalContext } from '../../src/providers/OEXCommsProvider'
import type { OEXCommsContextValue } from '../../src/types'
import type { OEXCommsInternalContextValue } from '../../src/providers/OEXCommsProvider'

vi.spyOn(console, 'error').mockImplementation(() => {})

function createMockContext(overrides?: Partial<OEXCommsContextValue>): OEXCommsContextValue {
  return {
    deviceState: 'registered',
    deviceReady: true,
    identity: 'test-user',
    callState: 'idle',
    callInfo: null,
    error: null,
    connect: vi.fn(),
    disconnect: vi.fn(),
    sendDigits: vi.fn(),
    mute: vi.fn(),
    toggleMute: vi.fn(),
    acceptIncoming: vi.fn(),
    rejectIncoming: vi.fn(),
    ...overrides,
  }
}

function createMockAudio(overrides?: Record<string, unknown>) {
  const inputDevices = new Map([
    ['input-1', { deviceId: 'input-1', label: 'Mic 1', groupId: 'group-1' }],
    ['input-2', { deviceId: 'input-2', label: 'Mic 2', groupId: 'group-2' }],
  ])
  const outputDevices = new Map([
    ['output-1', { deviceId: 'output-1', label: 'Speaker 1', groupId: 'group-3' }],
  ])

  return {
    availableInputDevices: inputDevices,
    availableOutputDevices: outputDevices,
    inputDevice: { deviceId: 'input-1' },
    isOutputSelectionSupported: true,
    setInputDevice: vi.fn().mockResolvedValue(undefined),
    speakerDevices: {
      set: vi.fn().mockResolvedValue(undefined),
      test: vi.fn().mockResolvedValue(undefined),
      get: vi.fn(),
    },
    ...overrides,
  }
}

function createMockInternalContext(
  overrides?: Partial<OEXCommsInternalContextValue>,
): OEXCommsInternalContextValue {
  return {
    deviceRef: { current: { audio: createMockAudio() } as unknown as import('@twilio/voice-sdk').Device },
    callRef: { current: null },
    apiClientRef: { current: null },
    tokenManagerRef: { current: null },
    dispatch: vi.fn(),
    lastCallSidRef: { current: null },
    ...overrides,
  }
}

function createWrapper(
  context: OEXCommsContextValue,
  internal: OEXCommsInternalContextValue,
) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(
      OEXCommsInternalContext.Provider,
      { value: internal },
      createElement(OEXCommsContext.Provider, { value: context }, children),
    )
  }
}

describe('useAudioDevices', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns available input devices from device.audio.availableInputDevices', () => {
    const context = createMockContext()
    const internal = createMockInternalContext()
    const { result } = renderHook(() => useAudioDevices(), {
      wrapper: createWrapper(context, internal),
    })

    expect(result.current.inputDevices).toEqual([
      { deviceId: 'input-1', label: 'Mic 1', groupId: 'group-1' },
      { deviceId: 'input-2', label: 'Mic 2', groupId: 'group-2' },
    ])
  })

  it('returns available output devices from device.audio.availableOutputDevices', () => {
    const context = createMockContext()
    const internal = createMockInternalContext()
    const { result } = renderHook(() => useAudioDevices(), {
      wrapper: createWrapper(context, internal),
    })

    expect(result.current.outputDevices).toEqual([
      { deviceId: 'output-1', label: 'Speaker 1', groupId: 'group-3' },
    ])
  })

  it('setInputDevice calls device.audio.setInputDevice with the device ID', async () => {
    const mockAudio = createMockAudio()
    const context = createMockContext()
    const internal = createMockInternalContext({
      deviceRef: { current: { audio: mockAudio } as unknown as import('@twilio/voice-sdk').Device },
    })
    const { result } = renderHook(() => useAudioDevices(), {
      wrapper: createWrapper(context, internal),
    })

    await act(async () => {
      await result.current.setInputDevice('input-2')
    })

    expect(mockAudio.setInputDevice).toHaveBeenCalledWith('input-2')
  })

  it('setOutputDevice calls device.audio.speakerDevices.set with the device ID', async () => {
    const mockAudio = createMockAudio()
    const context = createMockContext()
    const internal = createMockInternalContext({
      deviceRef: { current: { audio: mockAudio } as unknown as import('@twilio/voice-sdk').Device },
    })
    const { result } = renderHook(() => useAudioDevices(), {
      wrapper: createWrapper(context, internal),
    })

    await act(async () => {
      await result.current.setOutputDevice('output-1')
    })

    expect(mockAudio.speakerDevices.set).toHaveBeenCalledWith('output-1')
  })

  it('setOutputDevice returns error when output selection is not supported', async () => {
    const mockAudio = createMockAudio({ isOutputSelectionSupported: false })
    const context = createMockContext()
    const internal = createMockInternalContext({
      deviceRef: { current: { audio: mockAudio } as unknown as import('@twilio/voice-sdk').Device },
    })
    const { result } = renderHook(() => useAudioDevices(), {
      wrapper: createWrapper(context, internal),
    })

    await act(async () => {
      await result.current.setOutputDevice('output-1')
    })

    expect(result.current.error).not.toBeNull()
    expect(result.current.error!.message).toContain('not supported')
  })

  it('testSpeaker calls device.audio.speakerDevices.test', async () => {
    const mockAudio = createMockAudio()
    const context = createMockContext()
    const internal = createMockInternalContext({
      deviceRef: { current: { audio: mockAudio } as unknown as import('@twilio/voice-sdk').Device },
    })
    const { result } = renderHook(() => useAudioDevices(), {
      wrapper: createWrapper(context, internal),
    })

    await act(async () => {
      await result.current.testSpeaker()
    })

    expect(mockAudio.speakerDevices.test).toHaveBeenCalled()
  })

  it('throws error when used outside OEXCommsProvider', () => {
    expect(() => {
      renderHook(() => useAudioDevices())
    }).toThrow('useAudioDevices must be used within an OEXCommsProvider')
  })
})
