'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch(`${API}/api/auth/login/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });

      if (res.ok) {
        const data = await res.json();
        // Save token and email
        localStorage.setItem('token', data.access);
        sessionStorage.setItem('rec_auth', data.email);
        router.push('/form');
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.detail ?? 'Invalid username or password. Please try again.');
      }
    } catch {
      setError('Could not reach the server. Is the backend running?');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-bg-glow" />

      <div className="login-card">
        {/* Logo */}
        <div className="login-logo">
          <div className="login-logo-icon">🎓</div>
          <div className="login-logo-text">
            Rajalakshmi Engineering College
            <span>Transport Data Collection</span>
          </div>
        </div>

        {/* Heading */}
        <h1 className="login-title">Welcome back</h1>
        <p className="login-subtitle">
          Sign in with your email and the last 4 digits of your admission number as your password.
        </p>

        {/* Form */}
        <form className="login-form" onSubmit={handleSubmit}>
          <div className="form-field">
            <label className="form-label" htmlFor="email">
              Email Address
            </label>
            <input
              id="email"
              type="email"
              className="form-input"
              placeholder="e.g. student@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </div>

          <div className="form-field">
            <label className="form-label" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              className="form-input"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>

          {error && <div className="login-error">{error}</div>}

          <button
            id="login-submit-btn"
            type="submit"
            className="btn-primary"
            disabled={loading || !email || !password}
          >
            {loading ? 'Signing in…' : 'Sign in →'}
          </button>
        </form>
      </div>
    </div>
  );
}
