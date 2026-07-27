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

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [bannerIndex, setBannerIndex] = useState(0);

  // Slideshow: advance every 4 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setBannerIndex((i) => (i + 1) % BANNERS.length);
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (isAdminEmail(email)) {
      setError('This looks like an admin account. Please use the Admin Portal to log in.');
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
          Sign in with your email and the last 4 digits of your admission number as your password.
        </p>

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
            disabled={loading || !email || !password}
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>


      </div>
    </div>
  );
}
