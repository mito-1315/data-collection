'use client';

import { useState } from 'react';
import Papa from 'papaparse';

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

  // Single mode state — no password field; it's auto-derived from email
  const [form, setForm] = useState({
    name: '', email: '', department: '', roll_number: ''
  });
  const [departments, setDepartments] = useState<{code: string, name: string}[]>([]);

  // Fetch departments on mount
  useState(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/departments/`)
      .then(r => r.json())
      .then(d => {
        if (d.departments) {
          setDepartments(d.departments);
          if (d.departments.length > 0) setForm(f => ({ ...f, department: d.departments[0].code }));
        }
      })
      .catch(console.error);
  });

  // Validation logic
  const validateRollNumber = (roll: string) => {
    if (roll.length !== 9) return 'Roll number must be exactly 9 digits.';
    if (!/^\d+$/.test(roll)) return 'Roll number must contain only digits.';
    return null;
  };

  const handleSingleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setDuplicates([]);

    const rollError = validateRollNumber(form.roll_number);
    if (rollError) { setError(rollError); return; }

    setLoading(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/students/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        // Password is intentionally NOT sent — backend derives it from email
        body: JSON.stringify(form)
      });
      const data = await res.json();
      if (res.ok) {
        const email = form.email;
        const prefix = email.split('@')[0];
        setSuccess(`User added. Default password: ${prefix}@123`);
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
      setError('Failed to create user.');
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        setError('');
        setDuplicates([]);
        const rows = results.data as Record<string, string>[];

        // Required columns (password is NOT required — it is auto-derived from email)
        const required = ['name', 'email', 'department', 'roll_number'];
        const firstRow = rows[0] || {};
        const missing = required.filter(col => !(col in firstRow));
        if (missing.length > 0) {
          setError(`Missing columns: ${missing.join(', ')}`);
          return;
        }

        // Validate rows
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          const rollError = validateRollNumber(String(row.roll_number));
          if (rollError) {
            setError(`Row ${i + 1}: ${rollError} (${row.roll_number})`);
            return;
          }
        }

        setLoading(true);
        try {
          const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/students/bulk/`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            // Password fields in CSV are silently ignored by the backend
            body: JSON.stringify(rows)
          });
          const data = await res.json();
          if (res.ok) {
            const hasDuplicates = data.duplicates && data.duplicates.length > 0;
            const hasErrors = data.errors && data.errors.length > 0;

            if (data.created > 0) {
              setSuccess(`✅ Successfully added ${data.created} student${data.created !== 1 ? 's' : ''}. Passwords are set to emailprefix@123.`);
              onRefresh();
            }

            if (hasDuplicates) {
              setDuplicates(data.duplicates);
              if (data.created === 0) {
                setError(`No new students added — ${data.duplicates.length} duplicate${data.duplicates.length !== 1 ? 's' : ''} found.`);
              }
            }

            if (hasErrors) {
              setError((prev => prev ? prev : '') + ` ${data.errors.length} row(s) had validation errors.`);
            }

            // Auto-close only if everything was clean
            if (data.created > 0 && !hasDuplicates && !hasErrors) {
              setTimeout(onClose, 2500);
            }
          } else {
            setError(`Upload failed: ${JSON.stringify(data)}`);
          }
        } catch {
          setError('Failed to upload users.');
        } finally {
          setLoading(false);
        }
      }
    });
  };

  const downloadSample = () => {
    // Password column is intentionally omitted — passwords are auto-derived from email
    const csvContent = "data:text/csv;charset=utf-8,name,email,department,roll_number\nMonkey D Luffy,luffy@example.com,Computer Science,230701184\nNami Shimizu,nami@example.com,Electronics,230701185\n";
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "sample_students.csv");
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

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

        {/* Password note banner */}
        <div style={{
          background: 'rgba(155,89,245,0.1)', border: '1px solid rgba(155,89,245,0.3)',
          borderRadius: 8, padding: '10px 14px', marginBottom: 20, fontSize: 13,
          color: 'var(--text-secondary)', display: 'flex', gap: 8, alignItems: 'flex-start',
        }}>
          <span style={{ fontSize: 16 }}>🔑</span>
          <span>
            Passwords are <strong style={{ color: '#fff' }}>automatically set</strong> from each student&apos;s email.{' '}
            Example: <code style={{ color: '#9b59f5' }}>mithesh@gmail.com</code> → password: <code style={{ color: '#9b59f5' }}>mithesh@123</code>
          </span>
        </div>

        <div style={{ display: 'flex', gap: 8, background: 'rgba(255,255,255,0.05)', padding: 4, borderRadius: 8, marginBottom: 24 }}>
          <button
            style={{ flex: 1, padding: '8px 0', border: 'none', borderRadius: 4, background: mode === 'multiple' ? 'var(--accent)' : 'transparent', color: mode === 'multiple' ? '#fff' : 'var(--text-secondary)', cursor: 'pointer', fontWeight: 600 }}
            onClick={() => setMode('multiple')}
          >Multiple (CSV)</button>
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
                    <th style={{ padding: '8px 14px', color: 'var(--text-secondary)', fontWeight: 600, textAlign: 'left', whiteSpace: 'nowrap' }}>Roll Number</th>
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
              <input type="file" accept=".csv" onChange={handleFileUpload} disabled={loading} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} />
              <div style={{ fontSize: 24, marginBottom: 8 }}>{loading ? '⏳' : '📁'}</div>
              <div style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                {loading ? 'Uploading…' : 'Click or drag CSV file to upload'}
              </div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4 }}>
                Required columns: <code>name</code>, <code>email</code>, <code>department</code>, <code>roll_number</code>
              </div>
              <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 4 }}>
                No password column needed — auto-set from email
              </div>
            </div>
            <div style={{ textAlign: 'center', marginTop: 16 }}>
              <button onClick={downloadSample} style={{ background: 'transparent', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 13, textDecoration: 'underline' }}>
                Download Sample CSV
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSingleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="form-field" style={{ marginBottom: 0 }}>
              <label className="form-label">Full Name</label>
              <input type="text" className="form-input" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Priya Rajan" />
            </div>
            <div className="form-field" style={{ marginBottom: 0 }}>
              <label className="form-label">Email</label>
              <input type="email" className="form-input" required value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="e.g. priya@gmail.com" />
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <div className="form-field" style={{ marginBottom: 0, flex: 1 }}>
                <label className="form-label">Roll Number</label>
                <input type="text" className="form-input" required value={form.roll_number} onChange={e => setForm({ ...form, roll_number: e.target.value })} placeholder="9 digits" maxLength={9} />
              </div>
              <div className="form-field" style={{ marginBottom: 0, flex: 1 }}>
                <label className="form-label">Department</label>
                <select className="form-input" required value={form.department} onChange={e => setForm({ ...form, department: e.target.value })}>
                  <option value="" disabled>Select department...</option>
                  {departments.map(d => <option key={d.code} value={d.code}>{d.name} ({d.code})</option>)}
                </select>
              </div>
            </div>
            {/* Password field intentionally removed — auto-derived from email */}
            <div style={{
              background: 'rgba(155,89,245,0.08)', borderRadius: 6, padding: '8px 12px',
              fontSize: 12, color: 'var(--text-secondary)',
            }}>
              🔑 Password will be auto-set to: <strong style={{ color: '#9b59f5' }}>{form.email ? `${form.email.split('@')[0]}@123` : 'emailprefix@123'}</strong>
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
