'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';
const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL ?? 'admin@example.com';

const BANNERS = ['/banner-1.jpg', '/banner-2.jpg', '/banner-3.jpg'];

function isAdminEmail(email: string): boolean {
  return email.trim().toLowerCase() === ADMIN_EMAIL.toLowerCase();
}

interface LoginConfig {
  is_open: boolean;
  note_message: string;
  bypass_emails: string[];
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [bannerIndex, setBannerIndex] = useState(0);

  // Login gate state
  const [loginConfig, setLoginConfig] = useState<LoginConfig | null>(null);
  const [showClosedModal, setShowClosedModal] = useState(false);

  // Slideshow: advance every 4 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setBannerIndex((i) => (i + 1) % BANNERS.length);
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  // Fetch login gate status on mount
  useEffect(() => {
    fetch(`${API}/api/auth/login-status/`)
      .then((res) => res.json())
      .then((data: LoginConfig) => setLoginConfig(data))
      .catch(() => {
        // If status fetch fails, default to open so users aren't locked out by a network error
        setLoginConfig({ is_open: true, note_message: '', bypass_emails: [] });
      });
  }, []);

  // Derived: is the current email in the bypass list?
  const isBypassUser = Boolean(
    email && loginConfig?.bypass_emails?.includes(email.trim().toLowerCase())
  );
  // Is login effectively closed for this email?
  const isClosed = loginConfig !== null && !loginConfig.is_open && !isBypassUser;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (isAdminEmail(email)) {
      setError('This looks like an admin account. Please use the Admin Portal to log in.');
      return;
    }

    // Frontend gate: block submission if login is closed and not bypassed
    if (isClosed) {
      setShowClosedModal(true);
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
        if (data.role === 'admin') {
          setError('This looks like an admin account. Please use the Admin Portal to log in.');
          return;
        }
        localStorage.setItem('token', data.access);
        sessionStorage.setItem('rec_auth', data.email);
        router.push('/form');
      } else {
        const data = await res.json().catch(() => ({}));
        // Backend enforces login gate too — surface a modal for login_closed
        if (data.code === 'login_closed') {
          setShowClosedModal(true);
        } else {
          setError(data.detail ?? 'Invalid username or password. Please try again.');
        }
      }
    } catch {
      setError('Could not reach the server. Is the backend running?');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      {/* ── Slideshow Background ── */}
      <div className="login-slideshow">
        {BANNERS.map((src, i) => (
          <div
            key={src}
            className="login-slide"
            style={{ opacity: i === bannerIndex ? 1 : 0 }}
          >
            <Image
              src={src}
              alt={`Campus banner ${i + 1}`}
              fill
              style={{ objectFit: 'cover', objectPosition: 'center' }}
              priority={i === 0}
            />
          </div>
        ))}
        {/* Dark overlay so text is readable */}
        <div className="login-slide-overlay" />
      </div>

      {/* ── Login Card ── */}
      <div className="login-card">
        {/* Logo */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
          <Image
            src="/image.png"
            alt="Rajalakshmi Engineering College"
            width={220}
            height={60}
            style={{ objectFit: 'contain' }}
            priority
          />
        </div>

        {/* Heading */}
        <h1 className="login-title">Login</h1>
        <p className="login-subtitle">
          Sign in with your email and your full admission number as your password.
        </p>

        {/* ── Notice Banner (shown when login is closed) ── */}
        {loginConfig && !loginConfig.is_open && (
          <div className="login-notice-banner" role="alert">
            <span className="login-notice-icon">⚠️</span>
            <div className="login-notice-content">
              <span className="login-notice-title">Student Login Closed</span>
              <span className="login-notice-message">
                {loginConfig.note_message || 'Student login is currently closed. Please check back later.'}
              </span>
            </div>
          </div>
        )}

        {/* Form */}
        <form className="login-form" onSubmit={handleSubmit}>
          <div className="form-field">
            <label className="login-field-label" htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              className="login-input"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </div>

          <div className="form-field">
            <label className="login-field-label" htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              className="login-input"
              placeholder="••••••••"
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
            className="login-submit-btn"
            disabled={loading || !email || !password || isClosed}
            title={isClosed ? 'Login is currently closed' : undefined}
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>

          {/* Bypass hint: shown only if login is closed but current email is a bypass */}
          {loginConfig && !loginConfig.is_open && isBypassUser && (
            <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--green)', marginTop: 4 }}>
              ✓ Your email has bypass access — you may log in.
            </p>
          )}
        </form>
      </div>

      {/* ── Closed Modal Popup ── */}
      {showClosedModal && (
        <div className="login-closed-overlay" onClick={() => setShowClosedModal(false)}>
          <div className="login-closed-modal" onClick={(e) => e.stopPropagation()}>
            <div className="login-closed-modal-icon">⚠️</div>
            <div className="login-closed-modal-title">Student Login Closed</div>
            <div className="login-closed-modal-message">
              {loginConfig?.note_message || 'Student login is currently closed. Please check back later or contact support.'}
            </div>
            <button
              className="login-closed-modal-btn"
              onClick={() => setShowClosedModal(false)}
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
