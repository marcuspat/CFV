/**
 * ConversationInput — capture conversation text and launch the analysis pipeline.
 */
import React, { useState } from 'react';

interface ConversationInputProps {
  onSubmit: (conversationText: string) => void;
  isLoading?: boolean;
  onLogout?: () => void;
}

const SAMPLE = `User: Can you explain why the sky is blue?
Assistant: The sky appears blue because of Rayleigh scattering. Shorter blue wavelengths scatter more than longer red ones as sunlight passes through the atmosphere.
User: Interesting — so would the sky be a different color on Mars?
Assistant: Good inference. Mars has a thin, dusty atmosphere, so its daytime sky looks butterscotch and sunsets appear bluish — the opposite of Earth. I'm fairly confident about this, though exact hues depend on dust load.`;

export default function ConversationInput({ onSubmit, isLoading, onLogout }: ConversationInputProps) {
  const [text, setText] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;
    onSubmit(trimmed);
  };

  return (
    <div className="input-screen">
      <div className="glass-panel input-card">
        <div className="input-header">
          <div>
            <h2 className="input-title">Analyze a Conversation</h2>
            <p className="input-subtitle">
              Paste a dialogue or transcript. We&apos;ll decompose it into a 3D
              map of factual, logical, creative, and metacognitive thought.
            </p>
          </div>
          {onLogout && (
            <button type="button" className="btn btn-ghost" onClick={onLogout}>
              Sign out
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit} className="input-form">
          <textarea
            className="input-textarea"
            placeholder="Paste your conversation here…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={14}
          />

          <div className="input-actions">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setText(SAMPLE)}
              disabled={isLoading}
            >
              Use sample
            </button>
            <div className="input-actions-right">
              <span className="char-count">{text.trim().length} chars</span>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={isLoading || text.trim().length === 0}
              >
                {isLoading ? 'Analyzing…' : 'Analyze →'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
