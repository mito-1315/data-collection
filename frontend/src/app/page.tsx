'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

// Known admin email domains / patterns — extend as needed
const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL ?? 'admin@example.com';

function isAdminEmail(email: string): boolean {
  return email.trim().toLowerCase() === ADMIN_EMAIL.toLowerCase();
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Guard: admin email in student portal
    if (isAdminEmail(email)) {
      setError(
        'This looks like an admin account. Please use the Admin Portal to log in.'
      );
      return;
    }

    setLoading(true);

    try {
      const res = await fetch(`${API}/api/auth/login/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });

      if (res.ok) {
        const data = await res.json();
        // Guard: if backend somehow returns admin role, block it
        if (data.role === 'admin') {
          setError(
            'This looks like an admin account. Please use the Admin Portal to log in.'
          );
          return;
        }
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

  const showAdminRedirect = email.trim().length > 0 && isAdminEmail(email);

  return (
    <div className="login-page">
      <div className="login-bg-glow" />

      <div className="login-card">
        {/* College Logo */}
        <div className="login-logo" style={{ justifyContent: 'center', marginBottom: 24 }}>
          <Image
            src="/image.png"
            alt="Rajalakshmi Engineering College"
            width={260}
            height={72}
            style={{ objectFit: 'contain', maxWidth: '100%' }}
            priority
          />
        </div>

        {/* Heading */}
        <h1 className="login-title">Student Portal</h1>
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

        <p style={{ textAlign: 'center', marginTop: 20, fontSize: 12, color: 'var(--text-muted)' }}>
          Are you an admin?{' '}
          <Link href="/admin/login" style={{ color: 'var(--accent)', textDecoration: 'underline' }}>
            Go to Admin Portal
          </Link>
        </p>
      </div>
    </div>
  );
}
