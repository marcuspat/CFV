/**
 * AuthForm — glassmorphism sign-in card.
 * Submitting triggers the auto-register-then-login flow via the provided handler.
 */
import React, { useState } from 'react';

interface AuthFormProps {
  onSubmit: (email: string, password: string) => Promise<void>;
  isLoading?: boolean;
  error?: string | null;
}

export default function AuthForm({ onSubmit, isLoading, error }: AuthFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || isLoading) return;
    try {
      await onSubmit(email, password);
    } catch {
      // error surfaced via the `error` prop
    }
  };

  const passwordTooShort = password.length > 0 && password.length < 8;

  return (
    <div className="auth-screen">
      <div className="glass-panel auth-card">
        <div className="brand">
          <div className="brand-mark" />
          <h1 className="brand-title">Cognitive Fabric</h1>
          <p className="brand-subtitle">Visualize the architecture of thought</p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          <label className="field">
            <span className="field-label">Email</span>
            <input
              type="email"
              autoComplete="email"
              className="field-input"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>

          <label className="field">
            <span className="field-label">Password</span>
            <input
              type="password"
              autoComplete="current-password"
              className="field-input"
              placeholder="At least 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>

          {passwordTooShort && (
            <div className="form-hint">Password must be at least 8 characters.</div>
          )}
          {error && <div className="form-error">{error}</div>}

          <button
            type="submit"
            className="btn btn-primary"
            disabled={isLoading || passwordTooShort || !email || !password}
          >
            {isLoading ? 'Signing in…' : 'Enter the Fabric'}
          </button>

          <p className="auth-footnote">
            New here? An account is created automatically on first sign-in.
          </p>
        </form>
      </div>
    </div>
  );
}
