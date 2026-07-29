'use client';

import { useState } from 'react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';

interface AddUserModalProps {
  onClose: () => void;
  onRefresh: () => void;
}

interface DuplicateEntry {
  roll_number: string;
  name: string;
  email: string;
  department: string;
}

export default function AddUserModal({ onClose, onRefresh }: AddUserModalProps) {
  const [mode, setMode] = useState<'single' | 'multiple'>('multiple');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [duplicates, setDuplicates] = useState<DuplicateEntry[]>([]);

  // Single mode state — only email and admission_number
  const [form, setForm] = useState({ email: '', admission_number: '' });

  // Validate admission number: digits only, any length >= 4
  const validateAdmissionNumber = (num: string): string | null => {
    if (!num) return 'Admission number is required.';
    if (!/^\d+$/.test(num)) return 'Admission number must contain only digits.';
    return null;
  };

  const handleSingleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setDuplicates([]);

    const admError = validateAdmissionNumber(form.admission_number);
    if (admError) { setError(admError); return; }

    setLoading(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/students/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(form)
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess(`Student added! Password: ${form.admission_number} (full admission number)`);
        onRefresh();
        setTimeout(onClose, 2500);
      } else if (res.status === 409 && data.duplicate) {
        // Duplicate found — display it neatly
        setDuplicates([data.duplicate]);
        setError('This student already exists in the system.');
      } else {
        setError(JSON.stringify(data));
      }
    } catch {
      setError('Failed to create student.');
    } finally {
      setLoading(false);
    }
  };

  const processRows = async (rows: Record<string, string>[]) => {
    setError('');

    // Required columns
    const required = ['email', 'admission_number'];
    const firstRow = rows[0] || {};
    const missing = required.filter(col => !(col in firstRow));
    if (missing.length > 0) {
      setError(`Missing columns: ${missing.join(', ')}. Only "email" and "admission_number" columns are required.`);
      return;
    }

    // Validate all rows
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const admError = validateAdmissionNumber(String(row.admission_number || '').trim());
      if (admError) {
        setError(`Row ${i + 1}: ${admError} (value: "${row.admission_number}")`);
        return;
      }
      if (!row.email || !row.email.includes('@')) {
        setError(`Row ${i + 1}: Invalid email address "${row.email}".`);
        return;
      }
    }

    setLoading(true);
    try {
      const payload = rows.map(r => ({
        email: String(r.email).trim(),
        admission_number: String(r.admission_number).trim(),
      }));

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/students/bulk/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok && data.errors?.length === 0) {
        setSuccess(`Successfully added ${data.created} students. Passwords = full admission number for each student.`);
        onRefresh();
        setTimeout(onClose, 2500);
      } else {
        setError(`Added ${data.created}. Errors: ${JSON.stringify(data.errors)}`);
        onRefresh();
      }
    } catch {
      setError('Failed to upload students.');
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.split('.').pop()?.toLowerCase();

    if (ext === 'csv') {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: async (results) => {
          await processRows(results.data as Record<string, string>[]);
        }
      });
    } else if (ext === 'xlsx' || ext === 'xls') {
      const reader = new FileReader();
      reader.onload = async (ev) => {
        try {
          const data = ev.target?.result;
          const workbook = XLSX.read(data, { type: 'array' });
          const sheet = workbook.Sheets[workbook.SheetNames[0]];
          const rows = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { defval: '' });
          await processRows(rows);
        } catch {
          setError('Failed to read Excel file. Please use a valid .xlsx or .xls file.');
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      setError('Unsupported file type. Please upload a .csv, .xlsx, or .xls file.');
    }
  };

  const downloadSampleCSV = () => {
    const csvContent = 'email,admission_number\nluffy@example.com,230701184\nnami@example.com,230701185\n';
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
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

  const passwordPreview = form.admission_number || 'full admission number';

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100
    }}>
      <div style={{
        background: 'var(--bg-card)', padding: 32, borderRadius: 16,
        width: '100%', maxWidth: duplicates.length > 0 ? 680 : 520,
        border: '1px solid var(--accent-border)',
        maxHeight: '90vh', overflowY: 'auto',
        transition: 'max-width 0.25s ease',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h2 style={{ margin: 0, color: '#fff' }}>Add Students</h2>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 20 }}>✕</button>
        </div>

        {/* Password info banner */}
        <div style={{
          background: 'rgba(155,89,245,0.1)', border: '1px solid rgba(155,89,245,0.3)',
          borderRadius: 8, padding: '10px 14px', marginBottom: 20, fontSize: 13,
          color: 'var(--text-secondary)', display: 'flex', gap: 8, alignItems: 'flex-start',
        }}>
          <span style={{ fontSize: 16 }}>🔑</span>
          <span>
            Password is automatically set to the{' '}
            <strong style={{ color: '#fff' }}>full admission number</strong>.{' '}
            Example: admission <code style={{ color: '#9b59f5' }}>01202519421</code> → password:{' '}
            <code style={{ color: '#9b59f5' }}>01202519421</code>
          </span>
        </div>

        {/* Mode tabs */}
        <div style={{ display: 'flex', gap: 8, background: 'rgba(255,255,255,0.05)', padding: 4, borderRadius: 8, marginBottom: 24 }}>
          <button
            style={{ flex: 1, padding: '8px 0', border: 'none', borderRadius: 4, background: mode === 'multiple' ? 'var(--accent)' : 'transparent', color: mode === 'multiple' ? '#fff' : 'var(--text-secondary)', cursor: 'pointer', fontWeight: 600 }}
            onClick={() => setMode('multiple')}
          >Multiple (CSV / Excel)</button>
          <button
            style={{ flex: 1, padding: '8px 0', border: 'none', borderRadius: 4, background: mode === 'single' ? 'var(--accent)' : 'transparent', color: mode === 'single' ? '#fff' : 'var(--text-secondary)', cursor: 'pointer', fontWeight: 600 }}
            onClick={() => setMode('single')}
          >Single Form</button>
        </div>

        {error && <div style={{ color: '#ff5555', background: 'rgba(255,85,85,0.1)', padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 13 }}>{error}</div>}
        {success && <div style={{ color: '#50fa7b', background: 'rgba(80,250,123,0.1)', padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 13 }}>{success}</div>}

        {/* ── Duplicates Panel ── */}
        {duplicates.length > 0 && (
          <div style={{
            background: 'rgba(255,184,108,0.06)',
            border: '1px solid rgba(255,184,108,0.3)',
            borderRadius: 10,
            marginBottom: 20,
            overflow: 'hidden',
          }}>
            <div style={{
              padding: '10px 16px',
              borderBottom: '1px solid rgba(255,184,108,0.2)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: 'rgba(255,184,108,0.08)',
            }}>
              <span style={{ fontSize: 16 }}>⚠️</span>
              <strong style={{ color: '#ffb86c', fontSize: 13 }}>
                {duplicates.length} Duplicate{duplicates.length !== 1 ? 's' : ''} Found — Already in System
              </strong>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.02)' }}>
                    <th style={{ padding: '8px 14px', color: 'var(--text-secondary)', fontWeight: 600, textAlign: 'left', whiteSpace: 'nowrap' }}>Admission Number</th>
                    <th style={{ padding: '8px 14px', color: 'var(--text-secondary)', fontWeight: 600, textAlign: 'left' }}>Name</th>
                    <th style={{ padding: '8px 14px', color: 'var(--text-secondary)', fontWeight: 600, textAlign: 'left' }}>Email</th>
                    <th style={{ padding: '8px 14px', color: 'var(--text-secondary)', fontWeight: 600, textAlign: 'left' }}>Department</th>
                  </tr>
                </thead>
                <tbody>
                  {duplicates.map((d, i) => (
                    <tr key={i} style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                      <td style={{ padding: '8px 14px', color: '#ffb86c', fontFamily: 'monospace', fontWeight: 600 }}>{d.roll_number}</td>
                      <td style={{ padding: '8px 14px', color: 'var(--text-primary)' }}>{d.name}</td>
                      <td style={{ padding: '8px 14px', color: 'var(--text-secondary)' }}>{d.email}</td>
                      <td style={{ padding: '8px 14px', color: 'var(--text-secondary)' }}>{d.department}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {mode === 'multiple' ? (
          <div>
            <div style={{ border: '2px dashed var(--accent-border)', padding: 40, textAlign: 'center', borderRadius: 8, position: 'relative' }}>
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleFileUpload}
                disabled={loading}
                style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%' }}
              />
              <div style={{ fontSize: 24, marginBottom: 8 }}>📁</div>
              <div style={{ color: 'var(--text-primary)', fontWeight: 500 }}>Click or drag CSV / Excel file to upload</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4 }}>
                Required columns: <code>email</code>, <code>admission_number</code>
              </div>
              <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 4 }}>
                Supports .csv, .xlsx, .xls — No password column needed
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
        ) : (
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
            {/* Live password preview */}
            <div style={{
              background: 'rgba(155,89,245,0.08)', borderRadius: 6, padding: '8px 12px',
              fontSize: 12, color: 'var(--text-secondary)',
            }}>
              🔑 Password will be: <strong style={{ color: '#9b59f5' }}>{passwordPreview}</strong>
            </div>
            <button type="submit" className="btn-submit" disabled={loading} style={{ marginTop: 8 }}>
              {loading ? 'Adding...' : 'Add Student'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
