'use client';

import { useState } from 'react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';

export interface ParsedStudentRow {
  email: string;
  admission_number: string;
}

interface AddUserModalProps {
  onClose: () => void;
  onRefresh: () => void;
  onStartImport: (rows: ParsedStudentRow[], batchSize: number) => void;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

const BATCH_PRESETS = [
  { label: '10', value: 10, hint: 'Safest' },
  { label: '25', value: 25, hint: 'Recommended' },
  { label: '50', value: 50, hint: 'Balanced' },
  { label: '100', value: 100, hint: 'Faster' },
];

export default function AddUserModal({ onClose, onRefresh, onStartImport }: AddUserModalProps) {
  const [mode, setMode] = useState<'single' | 'multiple'>('multiple');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Batch config step
  const [pendingRows, setPendingRows] = useState<ParsedStudentRow[] | null>(null);
  const [batchSize, setBatchSize] = useState(25);
  const [customBatch, setCustomBatch] = useState('');

  // Single mode
  const [form, setForm] = useState({ email: '', admission_number: '' });

  const validateAdmissionNumber = (num: string): string | null => {
    if (!num) return 'Admission number is required.';
    if (!/^\d+$/.test(num)) return 'Admission number must contain only digits.';
    return null;
  };

  const handleSingleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const admError = validateAdmissionNumber(form.admission_number);
    if (admError) { setError(admError); return; }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/students/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess(`✅ Student added! Password: ${form.admission_number}`);
        onRefresh();
        setTimeout(onClose, 2000);
      } else if (res.status === 409 && data.duplicate) {
        setError(`Duplicate: ${data.duplicate.email} (${data.duplicate.roll_number}) already exists.`);
      } else {
        const msgs = Object.entries(data as Record<string, unknown>)
          .flatMap(([field, errs]) =>
            Array.isArray(errs) ? errs.map(m => `${field}: ${m}`) : [`${field}: ${String(errs)}`]
          )
          .join('\n');
        setError(msgs || JSON.stringify(data));
      }
    } catch {
      setError('Failed to create student. Check your connection.');
    } finally {
      setLoading(false);
    }
  };

  // Parse & validate file — stop at config step before starting import
  const processRows = (rows: Record<string, string>[]) => {
    setError('');

    if (rows.length === 0) {
      setError('The file is empty.');
      return;
    }

    const required = ['email', 'admission_number'];
    const firstRow = rows[0] || {};
    const missing = required.filter(col => !(col in firstRow));
    if (missing.length > 0) {
      setError(`Missing columns: ${missing.join(', ')}. Required: "email" and "admission_number".`);
      return;
    }

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const admError = validateAdmissionNumber(String(row.admission_number || '').trim());
      if (admError) {
        setError(`Row ${i + 1}: ${admError} (got: "${row.admission_number}")`);
        return;
      }
      if (!row.email || !row.email.includes('@')) {
        setError(`Row ${i + 1}: Invalid email "${row.email}".`);
        return;
      }
    }

    const parsed: ParsedStudentRow[] = rows.map(r => ({
      email: String(r.email).trim(),
      admission_number: String(r.admission_number).trim(),
    }));

    // Show config step instead of starting immediately
    setPendingRows(parsed);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.split('.').pop()?.toLowerCase();

    if (ext === 'csv') {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          processRows(results.data as Record<string, string>[]);
        },
      });
    } else if (ext === 'xlsx' || ext === 'xls') {
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = ev.target?.result;
          const workbook = XLSX.read(data, { type: 'array' });
          const sheet = workbook.Sheets[workbook.SheetNames[0]];
          const rows = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { defval: '' });
          processRows(rows);
        } catch {
          setError('Failed to read Excel file. Please use a valid .xlsx or .xls file.');
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      setError('Unsupported file type. Please upload .csv, .xlsx, or .xls.');
    }

    e.target.value = '';
  };

  const handleStartImport = () => {
    if (!pendingRows) return;
    const effective = Math.max(1, Math.min(500, batchSize));
    onStartImport(pendingRows, effective);
  };

  const downloadSampleCSV = () => {
    const csv = 'email,admission_number\nluffy@example.com,230701184\nnami@example.com,230701185\n';
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'sample_students.csv');
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const downloadSampleExcel = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['email', 'admission_number'],
      ['luffy@example.com', '230701184'],
      ['nami@example.com', '230701185'],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Students');
    XLSX.writeFile(wb, 'sample_students.xlsx');
  };

  const estimatedBatches = pendingRows
    ? Math.ceil(pendingRows.length / Math.max(1, batchSize))
    : 0;

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
    }}>
      <div style={{
        background: 'var(--bg-card)', padding: 32, borderRadius: 16,
        width: '100%', maxWidth: 520,
        border: '1px solid var(--accent-border)',
        maxHeight: '90vh', overflowY: 'auto',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h2 style={{ margin: 0, color: '#fff' }}>
            {pendingRows ? '⚙️ Configure Import' : 'Add Students'}
          </h2>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 20 }}>✕</button>
        </div>

        {/* ── Batch Config Step ─────────────────────────────────────────────── */}
        {pendingRows ? (
          <div>
            {/* File summary */}
            <div style={{
              background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.25)',
              borderRadius: 10, padding: '14px 16px', marginBottom: 24,
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <span style={{ fontSize: 24 }}>📄</span>
              <div>
                <div style={{ color: '#4ade80', fontWeight: 700, fontSize: 15 }}>
                  {pendingRows.length.toLocaleString()} students ready to import
                </div>
                <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 2 }}>
                  File parsed and validated successfully
                </div>
              </div>
            </div>

            {/* Batch size setting */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', color: 'var(--text-primary)', fontWeight: 600, fontSize: 13, marginBottom: 10 }}>
                Batch Size (rows per request)
              </label>

              {/* Preset pills */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                {BATCH_PRESETS.map(preset => (
                  <button
                    key={preset.value}
                    onClick={() => { setBatchSize(preset.value); setCustomBatch(''); }}
                    style={{
                      padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
                      fontWeight: 700, fontSize: 13, fontFamily: 'var(--font)',
                      background: batchSize === preset.value && !customBatch
                        ? 'var(--accent)' : 'rgba(255,255,255,0.06)',
                      color: batchSize === preset.value && !customBatch
                        ? '#fff' : 'var(--text-secondary)',
                      transition: 'all 0.15s',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                    }}
                  >
                    <span>{preset.label}</span>
                    <span style={{ fontSize: 10, fontWeight: 400, opacity: 0.75 }}>{preset.hint}</span>
                  </button>
                ))}

                {/* Custom input */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    type="number"
                    min={1}
                    max={500}
                    placeholder="Custom…"
                    value={customBatch}
                    onChange={e => {
                      setCustomBatch(e.target.value);
                      const v = parseInt(e.target.value);
                      if (!isNaN(v) && v > 0) setBatchSize(v);
                    }}
                    style={{
                      width: 80, padding: '8px 10px', borderRadius: 8, fontSize: 13,
                      background: customBatch ? 'rgba(139,92,246,0.15)' : 'rgba(255,255,255,0.06)',
                      border: customBatch ? '1px solid var(--accent)' : '1px solid var(--accent-border)',
                      color: '#fff', fontFamily: 'var(--font)', outline: 'none',
                    }}
                  />
                </div>
              </div>

              {/* Guidance card */}
              <div style={{
                background: 'rgba(255,255,255,0.03)', border: '1px solid var(--accent-border)',
                borderRadius: 8, padding: '10px 14px', fontSize: 12, color: 'var(--text-secondary)',
                lineHeight: 1.6,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span>🔢 <strong style={{ color: 'var(--text-primary)' }}>Batch size:</strong> {batchSize}</span>
                  <span>📦 <strong style={{ color: 'var(--text-primary)' }}>{estimatedBatches} batches</strong> total</span>
                  <span>⚡ <strong style={{ color: 'var(--text-primary)' }}>5 parallel workers</strong></span>
                </div>
                <div style={{ borderTop: '1px solid var(--accent-border)', paddingTop: 6 }}>
                  {batchSize <= 10 && '🐢 Very safe — use this if you keep getting Gateway Timeout errors.'}
                  {batchSize > 10 && batchSize <= 25 && '✅ Recommended — reliable for most servers. Good starting point.'}
                  {batchSize > 25 && batchSize <= 50 && '⚖️ Balanced — fast with low risk. Try this first.'}
                  {batchSize > 50 && batchSize <= 100 && '⚡ Fast — may timeout on slow servers. Try 25 if errors occur.'}
                  {batchSize > 100 && '⚠️ Large batch — high timeout risk. Only use on fast/local servers.'}
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => { setPendingRows(null); setError(''); }}
                style={{
                  flex: 1, padding: '11px 0', borderRadius: 8, border: '1px solid var(--accent-border)',
                  background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer',
                  fontWeight: 600, fontSize: 14, fontFamily: 'var(--font)',
                }}
              >
                ← Back
              </button>
              <button
                onClick={handleStartImport}
                style={{
                  flex: 2, padding: '11px 0', borderRadius: 8, border: 'none',
                  background: 'var(--accent)', color: '#fff', cursor: 'pointer',
                  fontWeight: 700, fontSize: 14, fontFamily: 'var(--font)',
                  boxShadow: '0 4px 16px rgba(139,92,246,0.35)',
                }}
              >
                🚀 Start Import ({pendingRows.length.toLocaleString()} rows, batch {batchSize})
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* ── Normal upload UI ──────────────────────────────────────────── */}

            {/* Password info */}
            <div style={{
              background: 'rgba(155,89,245,0.1)', border: '1px solid rgba(155,89,245,0.3)',
              borderRadius: 8, padding: '10px 14px', marginBottom: 20, fontSize: 13,
              color: 'var(--text-secondary)', display: 'flex', gap: 8, alignItems: 'flex-start',
            }}>
              <span style={{ fontSize: 16 }}>🔑</span>
              <span>
                Password is automatically set to the{' '}
                <strong style={{ color: '#fff' }}>full admission number</strong>.{' '}
                Example: <code style={{ color: '#9b59f5' }}>01202519421</code> → password:{' '}
                <code style={{ color: '#9b59f5' }}>01202519421</code>
              </span>
            </div>

            {/* Mode tabs */}
            <div style={{ display: 'flex', gap: 8, background: 'rgba(255,255,255,0.05)', padding: 4, borderRadius: 8, marginBottom: 24 }}>
              {(['multiple', 'single'] as const).map(m => (
                <button
                  key={m}
                  style={{
                    flex: 1, padding: '8px 0', border: 'none', borderRadius: 4,
                    background: mode === m ? 'var(--accent)' : 'transparent',
                    color: mode === m ? '#fff' : 'var(--text-secondary)',
                    cursor: 'pointer', fontWeight: 600, fontFamily: 'var(--font)',
                  }}
                  onClick={() => setMode(m)}
                >
                  {m === 'multiple' ? 'Multiple (CSV / Excel)' : 'Single Form'}
                </button>
              ))}
            </div>

            {/* Alerts */}
            {error && (
              <div style={{
                color: '#ff5555', background: 'rgba(255,85,85,0.1)', padding: 12,
                borderRadius: 8, marginBottom: 16, fontSize: 13, whiteSpace: 'pre-line',
              }}>
                {error}
              </div>
            )}
            {success && (
              <div style={{ color: '#50fa7b', background: 'rgba(80,250,123,0.1)', padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
                {success}
              </div>
            )}

            {/* Multiple mode */}
            {mode === 'multiple' && (
              <div>
                <div style={{
                  border: '2px dashed var(--accent-border)', padding: 40,
                  textAlign: 'center', borderRadius: 8, position: 'relative',
                }}>
                  <input
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    onChange={handleFileUpload}
                    style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%' }}
                  />
                  <div style={{ fontSize: 32, marginBottom: 10 }}>📁</div>
                  <div style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: 15 }}>
                    Click or drag CSV / Excel file here
                  </div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 6 }}>
                    Required columns: <code>email</code>, <code>admission_number</code>
                  </div>
                  <div style={{
                    marginTop: 12, padding: '7px 14px', borderRadius: 6, fontSize: 12,
                    background: 'rgba(139,92,246,0.08)', color: '#a78bfa', display: 'inline-block',
                  }}>
                    You'll set the batch size before import starts
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'center', gap: 24, marginTop: 16 }}>
                  <button onClick={downloadSampleCSV} style={{ background: 'transparent', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 13, textDecoration: 'underline' }}>
                    📄 Download Sample CSV
                  </button>
                  <button onClick={downloadSampleExcel} style={{ background: 'transparent', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 13, textDecoration: 'underline' }}>
                    📊 Download Sample Excel
                  </button>
                </div>
              </div>
            )}

            {/* Single mode */}
            {mode === 'single' && (
              <form onSubmit={handleSingleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div className="form-field" style={{ marginBottom: 0 }}>
                  <label className="form-label">Email Address</label>
                  <input
                    type="email"
                    className="form-input"
                    required
                    value={form.email}
                    onChange={e => setForm({ ...form, email: e.target.value })}
                    placeholder="e.g. student@example.com"
                  />
                </div>
                <div className="form-field" style={{ marginBottom: 0 }}>
                  <label className="form-label">Admission Number</label>
                  <input
                    type="text"
                    className="form-input"
                    required
                    value={form.admission_number}
                    onChange={e => setForm({ ...form, admission_number: e.target.value.replace(/\D/g, '') })}
                    placeholder="e.g. 230701184 (digits only)"
                    inputMode="numeric"
                  />
                </div>
                <div style={{
                  background: 'rgba(155,89,245,0.08)', borderRadius: 6, padding: '8px 12px',
                  fontSize: 12, color: 'var(--text-secondary)',
                }}>
                  🔑 Password will be: <strong style={{ color: '#9b59f5' }}>{form.admission_number || 'full admission number'}</strong>
                </div>
                <button type="submit" className="btn-submit" disabled={loading} style={{ marginTop: 8 }}>
                  {loading ? 'Adding...' : 'Add Student'}
                </button>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
}
