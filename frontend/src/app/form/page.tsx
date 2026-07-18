'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  APIProvider,
  Map,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';

const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!;
const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

const CHENNAI_CENTER = { lat: 13.0827, lng: 80.2707 };
const DEFAULT_ZOOM = 11;
const SNAP_RADIUS_PX = 60;

interface FormData {
  rollNo: string;
  name: string;
  lat: number | null;
  lng: number | null;
  address: string;
  email: string;
}

type LatLng = [number, number]; // [lng, lat] — GeoJSON order
type RoadLine = LatLng[];

// ─── Haversine distance in metres ────────────────────────────────────────────
function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function metresPerPixel(lat: number, zoom: number): number {
  return (Math.cos((lat * Math.PI) / 180) * 2 * Math.PI * 6_378_137) / (256 * 2 ** zoom);
}

// ─── Inner map component ─────────────────────────────────────────────────────
function MapLayer({
  roads,
  markerPos,
  onSnappedClick,
  onZoomChange,
}: {
  roads: RoadLine[];
  markerPos: { lat: number; lng: number } | null;
  onSnappedClick: (lat: number, lng: number) => void;
  onZoomChange: (isZoomedIn: boolean) => void;
}) {
  const map = useMap();
  const mapsLib = useMapsLibrary('maps');
  const markerLib = useMapsLibrary('marker');   // ← loads the marker library

  const polylinesRef = useRef<google.maps.Polyline[]>([]);
  const polyListenersRef = useRef<google.maps.MapsEventListener[]>([]);
  const markerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const clickListenerRef = useRef<google.maps.MapsEventListener | null>(null);

  const handleMapOrPolyClick = useCallback((e: google.maps.MapMouseEvent) => {
    if (!e.latLng || !map) return;
    const clickedLat = e.latLng.lat();
    const clickedLng = e.latLng.lng();

    const zoom = map.getZoom() ?? DEFAULT_ZOOM;
    const snapRadiusMetres = SNAP_RADIUS_PX * metresPerPixel(clickedLat, zoom);

    let bestDist = Infinity;
    let bestLat = clickedLat;
    let bestLng = clickedLng;

    for (const coords of roads) {
      for (const [lng, lat] of coords) {
        const d = haversine(clickedLat, clickedLng, lat, lng);
        if (d < bestDist && d < snapRadiusMetres) {
          bestDist = d;
          bestLat = lat;
          bestLng = lng;
        }
      }
    }

    if (bestDist <= snapRadiusMetres) {
      onSnappedClick(bestLat, bestLng);
    }
  }, [map, roads, onSnappedClick]);

  // Draw polylines once roads are loaded
  useEffect(() => {
    if (!map || !mapsLib || roads.length === 0) return;
    polylinesRef.current.forEach((p) => p.setMap(null));
    polyListenersRef.current.forEach((l) => google.maps.event.removeListener(l));
    polylinesRef.current = [];
    polyListenersRef.current = [];

    const currentZoom = map.getZoom() ?? DEFAULT_ZOOM;
    const shouldShow = currentZoom >= 14;

    roads.forEach((coords) => {
      const path = coords.map(([lng, lat]) => ({ lat, lng }));
      const poly = new google.maps.Polyline({
        path,
        map: shouldShow ? map : null,
        strokeColor: '#9b59f5',
        strokeOpacity: 0.85,
        strokeWeight: 4, // slightly thicker for easier clicking
        zIndex: 1,
        clickable: true, // enables hand cursor
      });
      polylinesRef.current.push(poly);

      const listener = poly.addListener('click', handleMapOrPolyClick);
      polyListenersRef.current.push(listener);
    });

    return () => {
      polyListenersRef.current.forEach((l) => google.maps.event.removeListener(l));
      polyListenersRef.current = [];
    };
  }, [map, mapsLib, roads, handleMapOrPolyClick]);

  // Handle zoom changes
  useEffect(() => {
    if (!map) return;
    
    // Set initial
    const initialZoom = map.getZoom() ?? DEFAULT_ZOOM;
    onZoomChange(initialZoom >= 14);

    const listener = map.addListener('zoom_changed', () => {
      const z = map.getZoom() ?? DEFAULT_ZOOM;
      const shouldShow = z >= 14;
      onZoomChange(shouldShow);
      
      polylinesRef.current.forEach((p) => p.setMap(shouldShow ? map : null));
    });

    return () => {
      google.maps.event.removeListener(listener);
    };
  }, [map, onZoomChange]);

  // Click → snap → callback
  useEffect(() => {
    if (!map) return;
    if (clickListenerRef.current) google.maps.event.removeListener(clickListenerRef.current);

    clickListenerRef.current = map.addListener('click', handleMapOrPolyClick);

    return () => {
      if (clickListenerRef.current) google.maps.event.removeListener(clickListenerRef.current);
    };
  }, [map, handleMapOrPolyClick]);

  // Create/move the pin marker — only after markerLib is available
  useEffect(() => {
    if (!map || !markerLib) return;

    if (!markerPos) {
      if (markerRef.current) markerRef.current.map = null;
      return;
    }

    if (!markerRef.current) {
      const pin = document.createElement('div');
      pin.style.cssText = `
        width:20px;height:20px;
        background:#9b59f5;border:3px solid #fff;
        border-radius:50%;box-shadow:0 2px 8px rgba(155,89,245,.6);
      `;
      markerRef.current = new markerLib.AdvancedMarkerElement({
        map,
        content: pin,
        title: 'Boarding point',
      });
    }

    markerRef.current.position = { lat: markerPos.lat, lng: markerPos.lng };
    markerRef.current.map = map;
  }, [map, markerLib, markerPos]);

  return null;
}

// ─── Main Form Page ───────────────────────────────────────────────────────────
export default function FormPage() {
  const router = useRouter();
  const [user, setUser] = useState<string | null>(null);
  const [roads, setRoads] = useState<RoadLine[]>([]);
  const [roadsLoaded, setRoadsLoaded] = useState(false);
  const [isZoomedIn, setIsZoomedIn] = useState(false);

  const [form, setForm] = useState<FormData>({
    rollNo: '',
    name: '',
    lat: null,
    lng: null,
    address: '',
    email: '',
  });

  const [markerPos, setMarkerPos] = useState<{ lat: number; lng: number } | null>(null);
  const [addressLoading, setAddressLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  // Load roads from Django API
  useEffect(() => {
    fetch(`${API}/api/roads/`)
      .then((r) => r.json())
      .then((data: { segments: RoadLine[] }) => {
        setRoads(data.segments);
        setRoadsLoaded(true);
      })
      .catch(() => setRoadsLoaded(true));
  }, []);

  // Auth guard
  useEffect(() => {
    const stored = sessionStorage.getItem('rec_auth');
    const token = localStorage.getItem('token');
    if (!stored || !token) { router.replace('/'); return; }

    fetch(`${API}/api/auth/me/`, { headers: { 'Authorization': `Bearer ${token}` } })
      .then((res) => { if (res.ok) return res.json(); throw new Error(); })
      .then((data) => {
        setUser(data.email);
        setForm((f) => ({ ...f, rollNo: data.email, email: data.email }));
      })
      .catch(() => { sessionStorage.removeItem('rec_auth'); router.replace('/'); });
  }, [router]);

  const handleLogout = async () => {
    await fetch(`${API}/api/auth/logout/`, { method: 'POST', credentials: 'include' }).catch(() => {});
    sessionStorage.removeItem('rec_auth');
    router.replace('/');
  };

  const reverseGeocode = useCallback(async (lat: number, lng: number) => {
    setAddressLoading(true);
    setForm((f) => ({ ...f, lat, lng, address: '' }));
    try {
      const res = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${GOOGLE_MAPS_API_KEY}`
      );
      const data = await res.json();
      const addr = data.results?.[0]?.formatted_address ?? `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
      setForm((f) => ({ ...f, address: addr }));
    } catch {
      setForm((f) => ({ ...f, address: `${lat.toFixed(6)}, ${lng.toFixed(6)}` }));
    } finally {
      setAddressLoading(false);
    }
  }, []);

  const handleSnappedClick = useCallback(
    (lat: number, lng: number) => { setMarkerPos({ lat, lng }); reverseGeocode(lat, lng); },
    [reverseGeocode]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.lat || !form.lng) {
      setError('Please click on a purple road line on the map to set your boarding location.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`${API}/api/entries/`, {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ email: form.email, name: form.name, lat: form.lat, lng: form.lng, address: form.address }),
      });
      if (res.ok) {
        setSuccess(true);
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.email?.[0] ?? data.detail ?? 'Failed to save. Please try again.');
      }
    } catch {
      setError('Could not reach the server. Is the backend running?');
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setForm((f) => ({ ...f, name: '', lat: null, lng: null, address: '' }));
    setMarkerPos(null);
    setSuccess(false);
    setError('');
  };

  if (!user) return null;

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
            <div className="topbar-user-avatar">{user.slice(0, 1).toUpperCase()}</div>
            <span>{user}</span>
            <button id="logout-btn" className="btn-logout" onClick={handleLogout}>Sign out</button>
          </div>
        </header>

        {/* ── Body ── */}
        <main className="form-body">
          <div className="form-heading">
            <h1>Submit Boarding Location</h1>
            <p>
              Enter your name, then <strong>click directly on a purple road line</strong> on the map.
              Your pin will snap to the nearest bus route point automatically.
            </p>
          </div>

          <form onSubmit={handleSubmit}>
            {/* Step 1 */}
            <div className="form-step-card">
              <div className="form-step-header">
                <div className="step-number">1</div>
                <h2>Student Details</h2>
              </div>
              <div className="form-step-body">
                <div className="field-row">
                  <div className="form-field">
                    <label className="form-label" htmlFor="email">Email Address</label>
                    <input id="email" type="email" className="form-input form-input-readonly"
                      value={form.email} readOnly disabled />
                  </div>
                  <div className="form-field">
                    <label className="form-label" htmlFor="studentName">Full Name</label>
                    <input id="studentName" type="text" className="form-input"
                      placeholder="e.g. Priya Rajan" value={form.name}
                      onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
                  </div>
                </div>
              </div>
            </div>

            {/* Step 2 */}
            <div className="form-step-card">
              <div className="form-step-header">
                <div className="step-number">2</div>
                <h2>Boarding Location</h2>
              </div>
              <div className="form-step-body">
                {/* Instruction banner */}
                <div className="map-instruction-banner">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2.5">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/>
                    <circle cx="12" cy="10" r="3"/>
                  </svg>
                  <span>
                    The <span className="road-highlight">purple lines</span> show the roads your
                    college bus travels. Click anywhere on or near a purple line — your pin will
                    snap to the nearest point on the bus route automatically.
                  </span>
                </div>

                {/* Map */}
                <div className="map-picker-container">
                  {!isZoomedIn && roadsLoaded && (
                    <div className="map-zoom-hint">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="2.5">
                        <circle cx="11" cy="11" r="8"/>
                        <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                        <line x1="11" y1="8" x2="11" y2="14"/>
                        <line x1="8" y1="11" x2="14" y2="11"/>
                      </svg>
                      Zoom in closer to view the bus routes
                    </div>
                  )}
                  {!roadsLoaded && (
                    <div className="map-loading-overlay">
                      <div className="spinner" />
                      <span>Loading bus routes…</span>
                    </div>
                  )}
                  <Map
                    defaultCenter={CHENNAI_CENTER}
                    defaultZoom={DEFAULT_ZOOM}
                    mapId="rec-boarding-map"
                    gestureHandling="greedy"
                    disableDefaultUI={false}
                    style={{ width: '100%', height: '100%' }}
                  >
                    <MapLayer
                      roads={roads}
                      markerPos={markerPos}
                      onSnappedClick={handleSnappedClick}
                      onZoomChange={setIsZoomedIn}
                    />
                  </Map>
                </div>

                <div className="map-hint">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="12" y1="8" x2="12" y2="12"/>
                    <line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                  Map centred on Chennai. Zoom in to find the exact road you board from.
                </div>

                {/* Coordinates */}
                <div>
                  <div className="form-label" style={{ marginBottom: 6 }}>Coordinates (auto-captured)</div>
                  {form.lat && form.lng ? (
                    <div className="coord-badge">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="2.5">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/>
                        <circle cx="12" cy="10" r="3"/>
                      </svg>
                      {form.lat.toFixed(7)} / {form.lng.toFixed(7)}
                    </div>
                  ) : (
                    <div className="coord-badge coord-badge-empty">
                      No pin dropped yet — click a purple road on the map
                    </div>
                  )}
                </div>

                {/* Address */}
                <div className="form-field">
                  <label className="form-label">Preferred Boarding Address</label>
                  {addressLoading ? (
                    <div className="address-loading">
                      <div className="spinner" /> Fetching address from Google Maps…
                    </div>
                  ) : (
                    <div className="form-input-readonly">
                      {form.address || (
                        <span style={{ color: 'var(--text-muted)' }}>
                          Address will appear after you click a road on the map
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {error && (
              <div className="login-error" style={{ marginBottom: 16, marginTop: -4 }}>{error}</div>
            )}

            <div className="form-submit-row">
              <button id="submit-btn" type="submit" className="btn-submit"
                disabled={submitting || !form.rollNo || !form.name || !form.lat || addressLoading}>
                {submitting ? (
                  <><div className="spinner" /> Saving…</>
                ) : (
                  <>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="2.5">
                      <polyline points="20 6 9 17 4 12"/>
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
                <strong>{form.name}</strong>&apos;s boarding location has been saved to the database.
              </p>
              <button id="add-another-btn" className="btn-another" onClick={resetForm}>
                Add another student →
              </button>
            </div>
          </div>
        )}
      </div>
    </APIProvider>
  );
}
