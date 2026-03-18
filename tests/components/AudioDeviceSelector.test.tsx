import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { AudioDeviceSelector } from '../../src/components/AudioDeviceSelector'
import { useAudioDevices } from '../../src/hooks/useAudioDevices'

vi.mock('../../src/hooks/useAudioDevices', () => ({ useAudioDevices: vi.fn() }))

const mockUseAudioDevices = useAudioDevices as ReturnType<typeof vi.fn>

function setupMocks(overrides: { isOutputSelectionSupported?: boolean } = {}) {
  const setInputDevice = vi.fn()
  const setOutputDevice = vi.fn()
  const testSpeaker = vi.fn()

  mockUseAudioDevices.mockReturnValue({
    inputDevices: [
      { deviceId: 'mic-1', label: 'Built-in Mic', groupId: 'g1' },
      { deviceId: 'mic-2', label: 'USB Mic', groupId: 'g2' },
    ],
    outputDevices: [
      { deviceId: 'spk-1', label: 'Built-in Speaker', groupId: 'g1' },
    ],
    selectedInputDeviceId: 'mic-1',
    isOutputSelectionSupported: overrides.isOutputSelectionSupported ?? true,
    setInputDevice,
    setOutputDevice,
    testSpeaker,
    error: null,
  })

  return { setInputDevice, setOutputDevice, testSpeaker }
}

describe('AudioDeviceSelector', () => {
  it('renders input device select with available devices as options', () => {
    setupMocks()
    render(<AudioDeviceSelector />)
    const select = screen.getByLabelText('Microphone') as HTMLSelectElement
    expect(select.options.length).toBe(2)
    expect(select.options[0].textContent).toBe('Built-in Mic')
    expect(select.options[1].textContent).toBe('USB Mic')
  })

  it('selecting an input device calls setInputDevice with the device ID', () => {
    const { setInputDevice } = setupMocks()
    render(<AudioDeviceSelector />)
    fireEvent.change(screen.getByLabelText('Microphone'), { target: { value: 'mic-2' } })
    expect(setInputDevice).toHaveBeenCalledWith('mic-2')
  })

  it('speaker section is hidden when isOutputSelectionSupported is false', () => {
    setupMocks({ isOutputSelectionSupported: false })
    render(<AudioDeviceSelector />)
    expect(screen.queryByLabelText('Speaker')).toBeNull()
    expect(screen.queryByLabelText('Test speaker')).toBeNull()
  })

  it('test speaker button calls testSpeaker', () => {
    const { testSpeaker } = setupMocks()
    render(<AudioDeviceSelector />)
    fireEvent.click(screen.getByLabelText('Test speaker'))
    expect(testSpeaker).toHaveBeenCalled()
  })

  it('renderInputSelect render prop overrides the default select element', () => {
    setupMocks()
    render(
      <AudioDeviceSelector
        renderInputSelect={({ devices }) => (
          <div data-testid="custom-input">
            {devices.map((d) => (
              <span key={d.deviceId}>{d.label}</span>
            ))}
          </div>
        )}
      />,
    )
    expect(screen.getByTestId('custom-input')).toBeDefined()
    // Default select should not be present
    expect(screen.queryByLabelText('Microphone')).toBeNull()
  })
})
