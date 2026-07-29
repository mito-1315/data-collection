'use client';

import { useEffect, useState, useCallback, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import NextImage from 'next/image';
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

interface ExistingEntry {
  id: number;
  roll_no: string;
  name: string;
  lat: number;
  lng: number;
  address: string;
  submitted_by: string;
  submitted_at: string;
}

type LatLng = [number, number]; // [lng, lat] — GeoJSON order
type RoadLine = LatLng[];

// ─── Haversine distance in metres ─────────────────────────────────────────────
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

function findNearestRoadPoint(
  lat: number,
  lng: number,
  roads: RoadLine[],
  maxDistanceMetres: number,
): { lat: number; lng: number } | null {
  let bestDist = Infinity;
  let bestLat = lat;
  let bestLng = lng;

  for (const coords of roads) {
    for (const [roadLng, roadLat] of coords) {
      const d = haversine(lat, lng, roadLat, roadLng);
      if (d < bestDist) {
        bestDist = d;
        bestLat = roadLat;
        bestLng = roadLng;
      }
    }
  }

  if (bestDist <= maxDistanceMetres) {
    return { lat: bestLat, lng: bestLng };
  }

  return null;
}

const CHENNAI_BOUNDS = {
  south: 12.8,
  west: 80.0,
  north: 13.35,
  east: 80.35,
};
const SEARCH_SNAP_RADIUS_METRES = 800;

// ─── Map layer for submitting (with road polylines) ────────────────────────────
function MapLayerWithRoads({
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
  const markerLib = useMapsLibrary('marker');

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
    const snapped = findNearestRoadPoint(clickedLat, clickedLng, roads, snapRadiusMetres);

    if (snapped) {
      onSnappedClick(snapped.lat, snapped.lng);
    }
  }, [map, roads, onSnappedClick]);

  // Draw polylines
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
        strokeWeight: 4,
        zIndex: 1,
        clickable: true,
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
    const initialZoom = map.getZoom() ?? DEFAULT_ZOOM;
    onZoomChange(initialZoom >= 14);

    const listener = map.addListener('zoom_changed', () => {
      const z = map.getZoom() ?? DEFAULT_ZOOM;
      const shouldShow = z >= 14;
      onZoomChange(shouldShow);
      polylinesRef.current.forEach((p) => p.setMap(shouldShow ? map : null));
    });

    return () => { google.maps.event.removeListener(listener); };
  }, [map, onZoomChange]);

  // Click listener
  useEffect(() => {
    if (!map) return;
    if (clickListenerRef.current) google.maps.event.removeListener(clickListenerRef.current);
    clickListenerRef.current = map.addListener('click', handleMapOrPolyClick);
    return () => {
      if (clickListenerRef.current) google.maps.event.removeListener(clickListenerRef.current);
    };
  }, [map, handleMapOrPolyClick]);

  // Marker
  useEffect(() => {
    if (!map || !markerLib) return;
    if (!markerPos) {
      if (markerRef.current) markerRef.current.map = null;
      return;
    }
    if (!markerRef.current) {
      const pin = document.createElement('div');
      pin.style.cssText = `width:20px;height:20px;background:#9b59f5;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 8px rgba(155,89,245,.6);`;
      markerRef.current = new markerLib.AdvancedMarkerElement({ map, content: pin, title: 'Boarding point' });
    }
    markerRef.current.position = { lat: markerPos.lat, lng: markerPos.lng };
    markerRef.current.map = map;
  }, [map, markerLib, markerPos]);

  return null;
}

// ─── Pan map when user searches a location ─────────────────────────────────────
function MapPanTo({ target }: { target: { lat: number; lng: number } | null }) {
  const map = useMap();

  useEffect(() => {
    if (!map || !target) return;
    map.panTo(target);
    map.setZoom(15);
  }, [map, target]);

  return null;
}

// ─── Google Places search — overlaid on map like Google Maps ───────────────────
function MapSearchControl({
  onSelect,
  overlayRef,
}: {
  onSelect: (lat: number, lng: number, address: string) => void;
  overlayRef: React.RefObject<HTMLDivElement | null>;
}) {
  const map = useMap();
  const inputRef = useRef<HTMLInputElement>(null);
  const placesLib = useMapsLibrary('places');
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const [overlayReady, setOverlayReady] = useState(false);

  useLayoutEffect(() => {
    if (overlayRef.current) setOverlayReady(true);
  }, [overlayRef]);

  useEffect(() => {
    if (!placesLib || !inputRef.current || autocompleteRef.current) return;

    const bounds = new google.maps.LatLngBounds(
      { lat: CHENNAI_BOUNDS.south, lng: CHENNAI_BOUNDS.west },
      { lat: CHENNAI_BOUNDS.north, lng: CHENNAI_BOUNDS.east },
    );

    const autocomplete = new placesLib.Autocomplete(inputRef.current, {
      fields: ['geometry', 'formatted_address', 'name'],
      componentRestrictions: { country: 'in' },
      bounds,
      strictBounds: false,
    });
    autocompleteRef.current = autocomplete;

    if (map) {
      autocomplete.bindTo('bounds', map);
    }

    const listener = autocomplete.addListener('place_changed', () => {
      const place = autocomplete.getPlace();
      const location = place.geometry?.location;
      if (!location) return;

      const lat = location.lat();
      const lng = location.lng();
      const address = place.formatted_address ?? place.name ?? `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
      onSelect(lat, lng, address);

      if (inputRef.current) {
        inputRef.current.value = address;
      }
    });

    return () => {
      google.maps.event.removeListener(listener);
      if (map) autocomplete.unbind('bounds');
      autocompleteRef.current = null;
    };
  }, [placesLib, map, onSelect]);

  if (!overlayReady || !overlayRef.current) return null;

  return createPortal(
    <div className="map-search-overlay">
      <div className="map-search-bar">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          className="map-search-input"
          placeholder="Search Google Maps"
          autoComplete="off"
          aria-label="Search location on map"
        />
      </div>
    </div>,
    overlayRef.current,
  );
}

// ─── Map layer for read-only view (just a pin, no roads) ──────────────────────
function MapLayerReadOnly({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  const markerLib = useMapsLibrary('marker');
  const markerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);

  useEffect(() => {
    if (!map || !markerLib) return;
    if (!markerRef.current) {
      const pin = document.createElement('div');
      pin.style.cssText = `
        width: 24px; height: 24px;
        background: #50fa7b; border: 3px solid #fff;
        border-radius: 50%; box-shadow: 0 2px 12px rgba(80,250,123,.7);
      `;
      markerRef.current = new markerLib.AdvancedMarkerElement({
        map,
        content: pin,
        title: 'Your boarding point',
      });
    }
    markerRef.current.position = { lat, lng };
    markerRef.current.map = map;

    // Pan map to marker
    map.panTo({ lat, lng });
    map.setZoom(15);
  }, [map, markerLib, lat, lng]);

  return null;
}

// ─── Confirmation Modal ────────────────────────────────────────────────────────
function ConfirmModal({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center',
      justifyContent: 'center', zIndex: 200,
    }}>
      <div style={{
        background: 'var(--bg-card)', borderRadius: 16, padding: 32, maxWidth: 440, width: '90%',
        border: '1px solid rgba(255, 85, 85, 0.4)', boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
      }}>
        <div style={{ fontSize: 40, textAlign: 'center', marginBottom: 16 }}>⚠️</div>
        <h2 style={{ color: '#ff5555', margin: '0 0 12px', textAlign: 'center', fontSize: 20 }}>
          This cannot be undone
        </h2>
        <p style={{ color: 'var(--text-secondary)', textAlign: 'center', lineHeight: 1.6, margin: '0 0 24px' }}>
          Once submitted, your boarding location is <strong style={{ color: '#fff' }}>permanently recorded</strong> in
          the database and <strong style={{ color: '#ff5555' }}>cannot be changed or removed</strong> by you.
          Please make sure the pin is placed at your correct boarding point.
        </p>
        <div style={{ display: 'flex', gap: 12 }}>
          <button
            id="confirm-cancel-btn"
            onClick={onCancel}
            style={{
              flex: 1, padding: '12px 0', background: 'var(--bg)', border: '1px solid var(--accent-border)',
              color: 'var(--text-primary)', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 15,
            }}
          >
            ← Go Back
          </button>
          <button
            id="confirm-submit-btn"
            onClick={onConfirm}
            style={{
              flex: 1, padding: '12px 0', background: '#ff5555', border: 'none',
              color: '#fff', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 15,
            }}
          >
            Yes, Submit Permanently
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Form Page ────────────────────────────────────────────────────────────
export default function FormPage() {
  const router = useRouter();
  const [user, setUser] = useState<string | null>(null);
  const [roads, setRoads] = useState<RoadLine[]>([]);
  const [roadsLoaded, setRoadsLoaded] = useState(false);
  const [isZoomedIn, setIsZoomedIn] = useState(false);
  const [existingEntry, setExistingEntry] = useState<ExistingEntry | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const [form, setForm] = useState<FormData>({
    rollNo: '',
    name: '',
    lat: null,
    lng: null,
    address: '',
    email: '',
  });

  const [markerPos, setMarkerPos] = useState<{ lat: number; lng: number } | null>(null);
  const [mapPanTarget, setMapPanTarget] = useState<{ lat: number; lng: number } | null>(null);
  const mapControlsRef = useRef<HTMLDivElement>(null);
  const [addressLoading, setAddressLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  // Load roads from Django API (only if no existing entry)
  useEffect(() => {
    if (existingEntry) return; // Don't bother loading roads for read-only view
    fetch(`${API}/api/roads/`)
      .then((r) => r.json())
      .then((data: { segments: RoadLine[] }) => {
        setRoads(data.segments);
        setRoadsLoaded(true);
      })
      .catch(() => setRoadsLoaded(true));
  }, [existingEntry]);

  // Auth guard + check for existing entry
  useEffect(() => {
    const stored = sessionStorage.getItem('rec_auth');
    const token = localStorage.getItem('token');
    if (!stored || !token) { router.replace('/'); return; }

    // Step 1: Verify auth & get user info
    fetch(`${API}/api/auth/me/`, { headers: { 'Authorization': `Bearer ${token}` } })
      .then((res) => { if (res.ok) return res.json(); throw new Error(); })
      .then((data) => {
        setUser(data.email);
        setForm((f) => ({ ...f, rollNo: data.admission_number || data.email, email: data.email, name: data.name || f.name }));

        // Step 2: Check if student already has a submission
        return fetch(`${API}/api/auth/my-entry/`, { headers: { 'Authorization': `Bearer ${token}` } });
      })
      .then((res) => {
        if (res.ok) return res.json();
        if (res.status === 404) return null; // No entry yet — normal case
        throw new Error();
      })
      .then((entryData) => {
        if (entryData && entryData.id) {
          setExistingEntry(entryData);
          setForm((f) => ({
            ...f,
            rollNo: entryData.roll_no,
            name: entryData.name,
            lat: entryData.lat,
            lng: entryData.lng,
            address: entryData.address,
          }));
        }
        setAuthLoading(false);
      })
      .catch(() => { sessionStorage.removeItem('rec_auth'); router.replace('/'); });
  }, [router]);

  const handleLogout = async () => {
    await fetch(`${API}/api/auth/logout/`, { method: 'POST' }).catch(() => {});
    sessionStorage.removeItem('rec_auth');
    localStorage.removeItem('token');
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

  const handleSearchSelect = useCallback(
    (lat: number, lng: number, address: string) => {
      setMapPanTarget({ lat, lng });
      const snapped = findNearestRoadPoint(lat, lng, roads, SEARCH_SNAP_RADIUS_METRES);
      const finalLat = snapped?.lat ?? lat;
      const finalLng = snapped?.lng ?? lng;

      setMarkerPos({ lat: finalLat, lng: finalLng });
      setForm((f) => ({
        ...f,
        lat: finalLat,
        lng: finalLng,
        address: snapped ? address : `${address} (click nearest purple road to snap to bus route)`,
      }));
      setAddressLoading(false);
      setError('');
    },
    [roads]
  );

  // Called when user clicks "Submit" — shows confirm modal first
  const handleSubmitRequest = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.lat || !form.lng) {
      setError('Please search for your location or click on a purple road line on the map to set your boarding location.');
      return;
    }
    setShowConfirmModal(true);
  };

  // Called when user confirms in the modal
  const handleConfirmedSubmit = async () => {
    setShowConfirmModal(false);
    setSubmitting(true);
    try {
      const res = await fetch(`${API}/api/entries/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          roll_no: form.rollNo,
          lat: form.lat,
          lng: form.lng,
          address: form.address,
        }),
      });
      if (res.ok) {
        const saved = await res.json();
        setExistingEntry(saved);
        setSuccess(true);
      } else if (res.status === 409) {
        // Already submitted — shouldn't happen (we check on load), but handle gracefully
        const data = await res.json();
        if (data.entry) setExistingEntry(data.entry);
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.detail ?? 'Failed to save. Please try again.');
      }
    } catch {
      setError('Could not reach the server. Is the backend running?');
    } finally {
      setSubmitting(false);
    }
  };

  // Loading state
  if (authLoading || !user) return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <div className="spinner" style={{ width: 32, height: 32 }} />
    </div>
  );

  return (
    <APIProvider apiKey={GOOGLE_MAPS_API_KEY} libraries={['places', 'marker']}>
      <div className="form-page">
        {/* ── Topbar ── */}
        <header className="form-topbar">
          <div className="form-topbar-logo">
            <div style={{ position: 'relative', width: 160, height: 44, flexShrink: 0 }}>
              <NextImage
                src="/image.png"
                alt="Rajalakshmi Engineering College"
                fill
                style={{ objectFit: 'contain', objectPosition: 'left center' }}
                priority
              />
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

          {/* ── READ-ONLY VIEW: Student already submitted ── */}
          {existingEntry ? (
            <div>
              {/* Success banner */}
              <div style={{
                background: 'rgba(80,250,123,0.08)', border: '1px solid rgba(80,250,123,0.3)',
                borderRadius: 12, padding: '16px 24px', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 12,
              }}>
                <span style={{ fontSize: 22 }}>✅</span>
                <div>
                  <div style={{ color: '#50fa7b', fontWeight: 700, fontSize: 15 }}>Location already recorded</div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 2 }}>
                    Submitted on {new Date(existingEntry.submitted_at).toLocaleString('en-IN', { dateStyle: 'long', timeStyle: 'short' })}.
                    This submission is permanent and cannot be changed.
                  </div>
                </div>
              </div>

              {/* Read-only form details */}
              <div className="form-step-card" style={{ marginBottom: 24 }}>
                <div className="form-step-header">
                  <div className="step-number">📋</div>
                  <h2>Your Submitted Details</h2>
                </div>
                <div className="form-step-body">
                  <div className="field-row">
                    <div className="form-field">
                      <label className="form-label">Email Address</label>
                      <div className="form-input form-input-readonly">{existingEntry.submitted_by}</div>
                    </div>
                    <div className="form-field">
                      <label className="form-label">Admission Number</label>
                      <div className="form-input form-input-readonly">{existingEntry.roll_no}</div>
                    </div>
                  </div>
                  <div className="form-field" style={{ marginTop: 12 }}>
                    <label className="form-label">Boarding Address</label>
                    <div className="form-input form-input-readonly" style={{ minHeight: 48 }}>{existingEntry.address}</div>
                  </div>
                  <div className="form-field" style={{ marginTop: 12 }}>
                    <label className="form-label">Coordinates</label>
                    <div className="coord-badge">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/>
                        <circle cx="12" cy="10" r="3"/>
                      </svg>
                      {existingEntry.lat.toFixed(7)} / {existingEntry.lng.toFixed(7)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Read-only map with just a pin */}
              <div className="form-step-card">
                <div className="form-step-header">
                  <div className="step-number">📍</div>
                  <h2>Your Boarding Location</h2>
                </div>
                <div className="form-step-body">
                  <div className="map-picker-container">
                    <Map
                      defaultCenter={CHENNAI_CENTER}
                      defaultZoom={DEFAULT_ZOOM}
                      mapId="rec-boarding-map-readonly"
                      gestureHandling="greedy"
                      disableDefaultUI={false}
                      style={{ width: '100%', height: '100%' }}
                    >
                      <MapLayerReadOnly lat={existingEntry.lat} lng={existingEntry.lng} />
                    </Map>
                  </div>
                  <div className="map-hint" style={{ color: '#50fa7b' }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                    Green pin shows your recorded boarding point. No changes can be made.
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* ── SUBMISSION FORM: First time ── */
            <>
              <div className="form-heading">
                <h1>Submit Boarding Location</h1>
                <p>
                  <strong>Search for your area</strong> or <strong>click a purple road line</strong> on the map
                  to set your boarding location. Your pin will snap to the nearest bus route point automatically.
                </p>
              </div>

              <form onSubmit={handleSubmitRequest}>
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
                        <label className="form-label" htmlFor="admissionNo">Admission Number</label>
                        <input id="admissionNo" type="text" className="form-input form-input-readonly"
                          value={form.rollNo} readOnly disabled />
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
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/>
                        <circle cx="12" cy="10" r="3"/>
                      </svg>
                      <span>
                        Use the <strong>search bar on the map</strong> or click the{' '}
                        <span className="road-highlight">purple lines</span> — your pin will
                        snap to the nearest point on the bus route automatically.
                      </span>
                    </div>

                    {/* Map */}
                    <div className="map-picker-container">
                      <div ref={mapControlsRef} className="map-controls-layer">
                      {!isZoomedIn && roadsLoaded && (
                        <div className="map-zoom-hint">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <circle cx="11" cy="11" r="8"/>
                            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                            <line x1="11" y1="8" x2="11" y2="14"/>
                            <line x1="8" y1="11" x2="14" y2="11"/>
                          </svg>
                          Zoom in closer to view the bus routes (zoom level 14+)
                        </div>
                      )}
                      {!roadsLoaded && (
                        <div className="map-loading-overlay">
                          <div className="spinner" />
                          <span>Loading bus routes…</span>
                        </div>
                      )}
                      </div>
                      <div className="map-canvas">
                        <Map
                          defaultCenter={CHENNAI_CENTER}
                          defaultZoom={DEFAULT_ZOOM}
                          mapId="rec-boarding-map"
                          gestureHandling="greedy"
                          disableDefaultUI={false}
                          style={{ width: '100%', height: '100%' }}
                        >
                          <MapSearchControl onSelect={handleSearchSelect} overlayRef={mapControlsRef} />
                          <MapLayerWithRoads
                            roads={roads}
                            markerPos={markerPos}
                            onSnappedClick={handleSnappedClick}
                            onZoomChange={setIsZoomedIn}
                          />
                          <MapPanTo target={mapPanTarget} />
                        </Map>
                      </div>
                    </div>

                    <div className="map-hint">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10"/>
                        <line x1="12" y1="8" x2="12" y2="12"/>
                        <line x1="12" y1="16" x2="12.01" y2="16"/>
                      </svg>
                      Map centred on Chennai. Search on the map or zoom in to find your boarding road.
                    </div>

                    {/* Coordinates */}
                    <div>
                      <div className="form-label" style={{ marginBottom: 6 }}>Coordinates (auto-captured)</div>
                      {form.lat && form.lng ? (
                        <div className="coord-badge">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/>
                            <circle cx="12" cy="10" r="3"/>
                          </svg>
                          {form.lat.toFixed(7)} / {form.lng.toFixed(7)}
                        </div>
                      ) : (
                        <div className="coord-badge coord-badge-empty">
                          No pin dropped yet — search on the map or click a purple road
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
                              Address will appear after you search on the map or click a road
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
                    disabled={submitting || !form.lat || addressLoading}>
                    {submitting ? (
                      <><div className="spinner" /> Saving…</>
                    ) : (
                      <>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                        Save Entry
                      </>
                    )}
                  </button>
                </div>
              </form>
            </>
          )}
        </main>

        {/* ── Confirmation Modal ── */}
        {showConfirmModal && (
          <ConfirmModal
            onConfirm={handleConfirmedSubmit}
            onCancel={() => setShowConfirmModal(false)}
          />
        )}

        {/* ── Success Overlay (after first submission) ── */}
        {success && existingEntry && (
          <div className="success-overlay">
            <div className="success-card">
              <div className="success-icon">✓</div>
              <h2>Entry saved!</h2>
              <p>
                <strong>{existingEntry.name}</strong>&apos;s boarding location has been permanently saved to the database.
              </p>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 8 }}>
                This page will now show your submitted location in read-only mode.
              </p>
              <button id="view-entry-btn" className="btn-another" onClick={() => setSuccess(false)}>
                View My Submission →
              </button>
            </div>
          </div>
        )}
      </div>
    </APIProvider>
  );
}
