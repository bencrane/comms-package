import React from 'react'

export function AudioDeviceSelectorShowcase() {
  return (
    <section className="showcase-section">
      <h2>AudioDeviceSelector</h2>
      <p>Microphone and speaker selection dropdowns with test button.</p>

      <div className="showcase-demo" style={{ maxWidth: 400 }}>
        <div role="group" aria-label="Audio device settings" data-output-supported="true">
          <div>
            <label htmlFor="showcase-mic">Microphone</label>
            <select id="showcase-mic" aria-label="Microphone" defaultValue="default">
              <option value="default">Default - MacBook Pro Microphone</option>
              <option value="usb">USB Condenser Microphone</option>
              <option value="headset">Jabra Evolve2 85</option>
            </select>
          </div>
          <div>
            <label htmlFor="showcase-speaker">Speaker</label>
            <select id="showcase-speaker" aria-label="Speaker" defaultValue="default">
              <option value="default">Default - MacBook Pro Speakers</option>
              <option value="usb">USB Audio Device</option>
              <option value="headset">Jabra Evolve2 85</option>
            </select>
          </div>
          <button aria-label="Test speaker">Test speaker</button>
        </div>
      </div>
    </section>
  )
}
