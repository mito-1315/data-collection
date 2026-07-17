'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  APIProvider,
  Map,
  AdvancedMarker,
  useMap,
} from '@vis.gl/react-google-maps';

const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!;
const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

// Default centre: Chennai District
const CHENNAI_CENTER = { lat: 13.0827, lng: 80.2707 };
const DEFAULT_ZOOM = 11;

// ─── Types ───────────────────────────────────────────────────────
interface FormData {
  rollNo: string;
  name: string;
  lat: number | null;
  lng: number | null;
  address: string;
}

// ─── Inner map component (needs access to map instance) ──────────
function LocationPickerInner({
  markerPos,
  onMapClick,
}: {
  markerPos: { lat: number; lng: number } | null;
  onMapClick: (lat: number, lng: number) => void;
}) {
  const map = useMap();

  useEffect(() => {
    if (!map) return;
    const listener = map.addListener(
      'click',
      (e: google.maps.MapMouseEvent) => {
        if (e.latLng) {
          onMapClick(e.latLng.lat(), e.latLng.lng());
        }
      }
    );
    return () => google.maps.event.removeListener(listener);
  }, [map, onMapClick]);

  return markerPos ? (
    <AdvancedMarker position={markerPos} title="Boarding point" />
  ) : null;
}

// ─── Main Form Page ───────────────────────────────────────────────
export default function FormPage() {
  const router = useRouter();
  const [user, setUser] = useState<string | null>(null);

  const [form, setForm] = useState<FormData>({
    rollNo: '', // Will be set once auth resolves
    name: '',
    lat: null,
    lng: null,
    address: '',
  });

  const [markerPos, setMarkerPos] = useState<{ lat: number; lng: number } | null>(null);
  const [addressLoading, setAddressLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  // Auth guard – verify the session is still valid with the backend
  useEffect(() => {
    const stored = sessionStorage.getItem('rec_auth');
    if (!stored) {
      router.replace('/');
      return;
    }

    fetch(`${API}/api/auth/me/`, { credentials: 'include' })
      .then((res) => {
        if (res.ok) return res.json();
        throw new Error('Not authenticated');
      })
      .then((data) => {
        setUser(data.username);
        setForm((f) => ({ ...f, rollNo: data.username }));
      })
      .catch(() => {
        sessionStorage.removeItem('rec_auth');
        router.replace('/');
      });
  }, [router]);

  const handleLogout = async () => {
    await fetch(`${API}/api/auth/logout/`, {
      method: 'POST',
      credentials: 'include',
    }).catch(() => {});
    sessionStorage.removeItem('rec_auth');
    router.replace('/');
  };

  // Reverse-geocode when a pin is dropped
  const reverseGeocode = useCallback(async (lat: number, lng: number) => {
    setAddressLoading(true);
    setForm((f) => ({ ...f, lat, lng, address: '' }));
    try {
      const res = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${GOOGLE_MAPS_API_KEY}`
      );
      const data = await res.json();
      const addr: string =
        data.results?.[0]?.formatted_address ?? `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
      setForm((f) => ({ ...f, address: addr }));
    } catch {
      setForm((f) => ({
        ...f,
        address: `${lat.toFixed(6)}, ${lng.toFixed(6)}`,
      }));
    } finally {
      setAddressLoading(false);
    }
  }, []);

  const handleMapClick = useCallback(
    (lat: number, lng: number) => {
      setMarkerPos({ lat, lng });
      reverseGeocode(lat, lng);
    },
    [reverseGeocode]
  );

  // Form submission — POST to Django backend
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!form.lat || !form.lng) {
      setError('Please drop a pin on the map to set the boarding location.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${API}/api/entries/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          roll_no: form.rollNo,
          name: form.name,
          lat: form.lat,
          lng: form.lng,
          address: form.address,
        }),
      });

      if (res.ok) {
        setSuccess(true);
      } else {
        const data = await res.json().catch(() => ({}));
        // Surface field-level errors (e.g. duplicate roll_no)
        const msg =
          data.roll_no?.[0] ??
          data.non_field_errors?.[0] ??
          data.detail ??
          'Failed to save entry. Please try again.';
        setError(msg);
      }
    } catch {
      setError('Could not reach the server. Is the backend running?');
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setForm({ rollNo: '', name: '', lat: null, lng: null, address: '' });
    setMarkerPos(null);
    setSuccess(false);
    setError('');
  };

  if (!user) return null; // waiting for auth check

  return (
    <APIProvider apiKey={GOOGLE_MAPS_API_KEY}>
      <div className="form-page">
        {/* ── Topbar ── */}
        <header className="form-topbar">
          <div className="form-topbar-logo">
            <div className="form-topbar-icon">🎓</div>
            <div className="form-topbar-label">
              Rajalakshmi Engineering College
              <span>Student Location Collection</span>
            </div>
          </div>

          <div className="topbar-user">
            <div className="topbar-user-avatar">
              {user.slice(0, 1).toUpperCase()}
            </div>
            <span>{user}</span>
            <button id="logout-btn" className="btn-logout" onClick={handleLogout}>
              Sign out
            </button>
          </div>
        </header>

        {/* ── Body ── */}
        <main className="form-body">
          <div className="form-heading">
            <h1>Submit Boarding Location</h1>
            <p>
              Enter the student&apos;s details and drop a pin on the map at their
              preferred boarding point. The address will be fetched automatically
              from Google Maps.
            </p>
          </div>

          <form onSubmit={handleSubmit}>
            {/* Step 1 — Student Info */}
            <div className="form-step-card">
              <div className="form-step-header">
                <div className="step-number">1</div>
                <h2>Student Details</h2>
              </div>
              <div className="form-step-body">
                <div className="field-row">
                  <div className="form-field">
                    <label className="form-label" htmlFor="rollNo">
                      Roll Number
                    </label>
                    <input
                      id="rollNo"
                      type="text"
                      className="form-input form-input-readonly"
                      placeholder="e.g. 2116230101001"
                      value={form.rollNo}
                      readOnly
                      disabled
                    />
                  </div>

                  <div className="form-field">
                    <label className="form-label" htmlFor="studentName">
                      Full Name
                    </label>
                    <input
                      id="studentName"
                      type="text"
                      className="form-input"
                      placeholder="e.g. Priya Rajan"
                      value={form.name}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, name: e.target.value }))
                      }
                      required
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Step 2 — Location Picker */}
            <div className="form-step-card">
              <div className="form-step-header">
                <div className="step-number">2</div>
                <h2>Boarding Location</h2>
              </div>
              <div className="form-step-body">
                <p
                  style={{
                    fontSize: 13,
                    color: 'var(--text-secondary)',
                    marginBottom: 4,
                  }}
                >
                  Click anywhere on the map to drop a pin at the student&apos;s
                  preferred boarding stop.
                </p>

                {/* Map */}
                <div className="map-picker-container">
                  <Map
                    defaultCenter={CHENNAI_CENTER}
                    defaultZoom={DEFAULT_ZOOM}
                    mapId="rec-boarding-map"
                    gestureHandling="greedy"
                    disableDefaultUI={false}
                    style={{ width: '100%', height: '100%' }}
                  >
                    <LocationPickerInner
                      markerPos={markerPos}
                      onMapClick={handleMapClick}
                    />
                  </Map>
                </div>

                <div className="map-hint">
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  The map is centred on Chennai District. Zoom and pan to find the
                  exact location.
                </div>

                {/* Coordinates badge */}
                <div>
                  <div className="form-label" style={{ marginBottom: 6 }}>
                    Coordinates (auto-captured)
                  </div>
                  {form.lat && form.lng ? (
                    <div className="coord-badge">
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                      >
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
                        <circle cx="12" cy="10" r="3" />
                      </svg>
                      {form.lat.toFixed(7)} / {form.lng.toFixed(7)}
                    </div>
                  ) : (
                    <div className="coord-badge coord-badge-empty">
                      No pin dropped yet
                    </div>
                  )}
                </div>

                {/* Auto-fetched address */}
                <div className="form-field">
                  <label className="form-label">Pref Boarding Address</label>
                  {addressLoading ? (
                    <div className="address-loading">
                      <div className="spinner" />
                      Fetching address from Google Maps…
                    </div>
                  ) : (
                    <div className="form-input-readonly">
                      {form.address || (
                        <span style={{ color: 'var(--text-muted)' }}>
                          Address will appear after dropping a pin
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div
                className="login-error"
                style={{ marginBottom: 16, marginTop: -4 }}
              >
                {error}
              </div>
            )}

            {/* Submit */}
            <div className="form-submit-row">
              <button
                id="submit-btn"
                type="submit"
                className="btn-submit"
                disabled={
                  submitting ||
                  !form.rollNo ||
                  !form.name ||
                  !form.lat ||
                  addressLoading
                }
              >
                {submitting ? (
                  <>
                    <div className="spinner" />
                    Saving…
                  </>
                ) : (
                  <>
                    <svg
                      width="15"
                      height="15"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    Save Entry
                  </>
                )}
              </button>
            </div>
          </form>
        </main>

        {/* ── Success Overlay ── */}
        {success && (
          <div className="success-overlay">
            <div className="success-card">
              <div className="success-icon">✓</div>
              <h2>Entry saved!</h2>
              <p>
                <strong>{form.name}</strong>&apos;s boarding location has been
                saved to the database.
              </p>
              <button
                id="add-another-btn"
                className="btn-another"
                onClick={resetForm}
              >
                Add another student →
              </button>
            </div>
          </div>
        )}
      </div>
    </APIProvider>
  );
}
