import React, { useState } from 'react'

const CONVERSATIONS = [
  { sid: 'c1', name: 'Sarah Johnson', preview: 'That sounds great! Is there any overtime available?', time: '10:35 AM', unread: 2 },
  { sid: 'c2', name: 'James Rodriguez', preview: 'I can start on Monday, just send me the details.', time: '9:45 AM', unread: 0 },
  { sid: 'c3', name: 'Emily Chen', preview: 'Thanks for the info. Let me think about it and get back to you.', time: 'Yesterday', unread: 1 },
  { sid: 'c4', name: 'Marcus Thompson', preview: 'Is the forklift cert required before starting?', time: 'Yesterday', unread: 0 },
  { sid: 'c5', name: 'Lisa Park', preview: 'Perfect, see you at the orientation on Wednesday!', time: 'Mar 14', unread: 0 },
]

export function ConversationListShowcase() {
  const [selectedSid, setSelectedSid] = useState('c1')

  return (
    <section className="showcase-section">
      <h2>ConversationList</h2>
      <p>Conversation list with selection state, unread badges, and message previews.</p>

      <div className="showcase-demo" style={{ maxWidth: 400 }}>
        <div
          data-state="ready"
          role="listbox"
          aria-label="Conversations"
        >
          {CONVERSATIONS.map((conv) => (
            <div
              key={conv.sid}
              role="option"
              aria-selected={conv.sid === selectedSid}
              data-active={String(conv.sid === selectedSid)}
              data-unread={String(conv.unread > 0)}
              data-conversation-sid={conv.sid}
              tabIndex={0}
              onClick={() => setSelectedSid(conv.sid)}
            >
              <span data-part="name">{conv.name}</span>
              <span data-part="preview">{conv.preview}</span>
              <time data-part="timestamp">{conv.time}</time>
              {conv.unread > 0 && (
                <span data-part="unread-badge" aria-label={`${conv.unread} unread messages`}>
                  {conv.unread}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
