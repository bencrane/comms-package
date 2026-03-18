import React, { useState } from 'react'

const MESSAGES = [
  { sid: 'm1', index: 1, author: 'agent', body: 'Hi Sarah, this is Mike from StaffingEdge. How are you today?', direction: 'outbound' as const, time: '10:32 AM', read: true },
  { sid: 'm2', index: 2, author: 'sarah', body: 'Hi Mike! I\'m doing well, thanks. I saw you called earlier — is this about the warehouse position?', direction: 'inbound' as const, time: '10:33 AM', read: false },
  { sid: 'm3', index: 3, author: 'agent', body: 'Yes exactly! We have a full-time warehouse associate opening in Fremont. The shift is Mon-Fri 7am-3:30pm, starting at $22/hr. Would you be interested?', direction: 'outbound' as const, time: '10:34 AM', read: true },
  { sid: 'm4', index: 4, author: 'sarah', body: 'That sounds great! Is there any overtime available?', direction: 'inbound' as const, time: '10:35 AM', read: false },
  { sid: 'm5', index: 5, author: 'agent', body: 'Absolutely — overtime is available during peak season and pays time-and-a-half. I can set up an interview for you this week if you\'re interested.', direction: 'outbound' as const, time: '10:36 AM', read: false },
]

export function ConversationThreadShowcase() {
  const [typing, setTyping] = useState(true)
  const [draft, setDraft] = useState('')

  return (
    <section className="showcase-section">
      <h2>ConversationThread</h2>
      <p>Chat thread with message bubbles, typing indicator, and compose input.</p>

      <div className="showcase-controls">
        <label>Typing:</label>
        <button data-selected={String(typing)} onClick={() => setTyping((t) => !t)}>
          {typing ? 'On' : 'Off'}
        </button>
      </div>

      <div className="showcase-demo showcase-demo-constrained">
        <div
          data-state="ready"
          data-typing={String(typing)}
          data-unread="false"
          role="region"
          aria-label="Conversation"
          style={{ display: 'flex', flexDirection: 'column', height: '100%' }}
        >
          {/* MessageList */}
          <div role="log" aria-label="Messages" aria-live="polite">
            <button data-action="load-more" aria-label="Load older messages">Load more</button>
            {MESSAGES.map((msg) => (
              <div
                key={msg.sid}
                data-direction={msg.direction}
                data-type="text"
                data-message-sid={msg.sid}
                data-read={String(msg.read)}
                role="listitem"
              >
                <span data-part="author">{msg.author}</span>
                <span data-part="body">{msg.body}</span>
                <time data-part="timestamp">{msg.time}</time>
              </div>
            ))}
          </div>

          {/* TypingIndicator */}
          {typing && (
            <div aria-live="polite" role="status" data-typing="true">
              Sarah is typing...
            </div>
          )}

          {/* ComposeInput */}
          <form onSubmit={(e) => e.preventDefault()}>
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              aria-label="Type a message"
              placeholder="Type a message..."
              data-part="compose-input"
            />
            <button
              type="submit"
              aria-label="Send message"
              data-part="send-button"
              disabled={draft.trim().length === 0}
            >
              Send
            </button>
          </form>
        </div>
      </div>
    </section>
  )
}
