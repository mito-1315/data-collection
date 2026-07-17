'use client';

import { useState, useCallback } from 'react';
import Papa from 'papaparse';

interface AddUserModalProps {
  onClose: () => void;
  onRefresh: () => void;
}

export default function AddUserModal({ onClose, onRefresh }: AddUserModalProps) {
  const [mode, setMode] = useState<'single' | 'multiple'>('multiple');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Single mode state
  const [form, setForm] = useState({
    name: '', email: '', password: '', department: '', roll_number: ''
  });
  const [departments, setDepartments] = useState<string[]>([]);

  // Fetch departments on mount
  useState(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/departments/`)
      .then(r => r.json())
      .then(d => {
        if (d.departments) {
          setDepartments(d.departments);
          if (d.departments.length > 0) setForm(f => ({ ...f, department: d.departments[0] }));
        }
      })
      .catch(console.error);
  });

  // Validation logic
  const validateRollNumber = (roll: string) => {
    if (roll.length !== 9) return 'Roll number must be exactly 9 digits.';
    if (roll.startsWith('2116')) return 'Roll number cannot start with 2116.';
    if (!/^\d+$/.test(roll)) return 'Roll number must contain only digits.';
    return null;
  };

  const handleSingleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    const rollError = validateRollNumber(form.roll_number);
    if (rollError) { setError(rollError); return; }

    setLoading(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/students/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(form)
      });
      if (res.ok) {
        setSuccess('User added successfully.');
        onRefresh();
        setTimeout(onClose, 1500);
      } else {
        const data = await res.json();
        setError(JSON.stringify(data));
      }
    } catch (e) {
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
        const rows = results.data as any[];
        
        // Validate columns
        const required = ['name', 'email', 'password', 'department', 'roll_number'];
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
            setError(`Row ${i+1}: ${rollError} (${row.roll_number})`);
            return;
          }
        }

        setLoading(true);
        try {
          const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/students/bulk/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(rows)
          });
          const data = await res.json();
          if (res.ok && data.errors?.length === 0) {
            setSuccess(`Successfully added ${data.created} users.`);
            onRefresh();
            setTimeout(onClose, 2000);
          } else {
            setError(`Added ${data.created}, Errors: ${JSON.stringify(data.errors)}`);
            onRefresh();
          }
        } catch (err) {
          setError('Failed to upload users.');
        } finally {
          setLoading(false);
        }
      }
    });
  };

  const downloadSample = () => {
    const csvContent = "data:text/csv;charset=utf-8,name,email,password,department,roll_number\nMonkey D Luffy,luffy@example.com,secret123,Computer Science,230701184\n";
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "sample_users.csv");
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100
    }}>
      <div style={{ background: 'var(--bg-card)', padding: 32, borderRadius: 16, width: '100%', maxWidth: 500, border: '1px solid var(--accent-border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h2 style={{ margin: 0, color: '#fff' }}>Add Users</h2>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 20 }}>✕</button>
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

        {mode === 'multiple' ? (
          <div>
            <div style={{ border: '2px dashed var(--accent-border)', padding: 40, textAlign: 'center', borderRadius: 8, position: 'relative' }}>
              <input type="file" accept=".csv" onChange={handleFileUpload} disabled={loading} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} />
              <div style={{ fontSize: 24, marginBottom: 8 }}>📁</div>
              <div style={{ color: 'var(--text-primary)', fontWeight: 500 }}>Click or drag CSV file to upload</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4 }}>Must contain name, email, password, department, roll_number</div>
            </div>
            <div style={{ textAlign: 'center', marginTop: 16 }}>
              <button onClick={downloadSample} style={{ background: 'transparent', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 13, textDecoration: 'underline' }}>Download Sample CSV</button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSingleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="form-field" style={{ marginBottom: 0 }}>
              <label className="form-label">Name</label>
              <input type="text" className="form-input" required value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
            </div>
            <div className="form-field" style={{ marginBottom: 0 }}>
              <label className="form-label">Email</label>
              <input type="email" className="form-input" required value={form.email} onChange={e => setForm({...form, email: e.target.value})} />
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <div className="form-field" style={{ marginBottom: 0, flex: 1 }}>
                <label className="form-label">Roll Number</label>
                <input type="text" className="form-input" required value={form.roll_number} onChange={e => setForm({...form, roll_number: e.target.value})} placeholder="9 digits" />
              </div>
              <div className="form-field" style={{ marginBottom: 0, flex: 1 }}>
                <label className="form-label">Department</label>
                <select className="form-input" required value={form.department} onChange={e => setForm({...form, department: e.target.value})}>
                  <option value="" disabled>Select department...</option>
                  {departments.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
            </div>
            <div className="form-field" style={{ marginBottom: 0 }}>
              <label className="form-label">Password</label>
              <input type="text" className="form-input" required value={form.password} onChange={e => setForm({...form, password: e.target.value})} />
            </div>
            <button type="submit" className="btn-submit" disabled={loading} style={{ marginTop: 16 }}>
              {loading ? 'Adding...' : 'Add User'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
