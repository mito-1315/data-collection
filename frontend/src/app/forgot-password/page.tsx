'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';
const BANNERS = ['/banner-1.jpg', '/banner-2.jpg', '/banner-3.jpg'];

type Step = 'request' | 'verify';

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('request');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [bannerIndex] = useState(0);

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);

    try {
      const res = await fetch(`${API}/api/auth/forgot_password/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        setMessage(data.detail ?? 'Verification code sent to your email.');
        setStep('verify');
      } else {
        setError(data.detail ?? 'Could not start password reset.');
      }
    } catch {
      setError('Could not reach the server. Is the backend running?');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);

    try {
      const res = await fetch(`${API}/api/auth/forgot_password/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), token: token.trim() }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        setMessage(data.detail ?? 'Password reset successful.');
        setTimeout(() => router.push('/'), 1500);
      } else {
        setError(data.detail ?? 'Invalid or expired verification code.');
      }
    } catch {
      setError('Could not reach the server. Is the backend running?');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-slideshow">
        <div className="login-slide" style={{ opacity: 1 }}>
          <Image
            src={BANNERS[bannerIndex]}
            alt="Campus banner"
            fill
            style={{ objectFit: 'cover', objectPosition: 'center' }}
            priority
          />
        </div>
        <div className="login-slide-overlay" />
      </div>

      <div className="login-card">
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

        <h1 className="login-title">{step === 'request' ? 'Forgot Password' : 'Verify Code'}</h1>
        <p className="login-subtitle">
          {step === 'request'
            ? 'Enter your email and choose a new password. We will email you a verification code.'
            : 'Enter the verification code sent to your email.'}
        </p>

        <form
          className="login-form"
          onSubmit={step === 'request' ? handleRequestReset : handleConfirmReset}
        >
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
              readOnly={step === 'verify'}
            />
          </div>

          {step === 'request' ? (
            <div className="form-field">
              <label className="login-field-label" htmlFor="password">New Password</label>
              <input
                id="password"
                type="password"
                className="login-input"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                minLength={6}
                required
              />
            </div>
          ) : (
            <div className="form-field">
              <label className="login-field-label" htmlFor="token">Verification Code</label>
              <input
                id="token"
                type="text"
                className="login-input"
                placeholder="Enter code from email"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                autoComplete="one-time-code"
                required
              />
            </div>
          )}

          {error && <div className="login-error">{error}</div>}
          {message && <div className="login-success">{message}</div>}

          <button type="submit" className="login-submit-btn" disabled={loading}>
            {loading ? 'Please wait…' : step === 'request' ? 'Send Verification Code' : 'Reset Password'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: 16, fontSize: 14 }}>
          <Link href="/" className="login-forgot-link">Back to login</Link>
        </p>
      </div>
    </div>
  );
}
