'use client';

import { useState, useEffect, useMemo } from 'react';
import Papa from 'papaparse';
import AddUserModal from './components/AddUserModal';

interface User {
  id: number;
  admission_number: string;
  email: string;
  status: 'FILLED' | 'UNFILLED';
  lat: number | null;
  lng: number | null;
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showAddModal, setShowAddModal] = useState(false);
  const [page, setPage] = useState(1);
  const [loadingRoads, setLoadingRoads] = useState(false);
  const [roadsMsg, setRoadsMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const perPage = 10;

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/students/`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleLoadRoads = async () => {
    setLoadingRoads(true);
    setRoadsMsg(null);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/roads/load/`,
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
        }
      );
      const data = await res.json();
      if (res.ok) {
        setRoadsMsg({ text: `✅ Roads loaded: ${data.loaded} new, ${data.total_in_db} total in DB`, ok: true });
      } else {
        setRoadsMsg({ text: `❌ ${data.detail || 'Failed to load roads'}`, ok: false });
      }
    } catch {
      setRoadsMsg({ text: '❌ Could not reach server', ok: false });
    } finally {
      setLoadingRoads(false);
      setTimeout(() => setRoadsMsg(null), 6000);
    }
  };

  // Filtering
  const filteredUsers = useMemo(() => {
    return users.filter(u => {
      const matchesSearch =
        u.email.toLowerCase().includes(search.toLowerCase()) ||
        u.admission_number.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = filterStatus === 'ALL' || u.status === filterStatus;
      return matchesSearch && matchesStatus;
    });
  }, [users, search, filterStatus]);

  // Pagination
  const totalPages = Math.ceil(filteredUsers.length / perPage);
  const paginatedUsers = filteredUsers.slice((page - 1) * perPage, page * perPage);

  // Selection
  const toggleSelectAll = () => {
    if (selectedIds.size === paginatedUsers.length && paginatedUsers.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(paginatedUsers.map(u => u.id)));
    }
  };

  const toggleSelect = (id: number) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Are you sure you want to delete ${selectedIds.size} users?`)) return;

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/students/bulk_delete/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ ids: Array.from(selectedIds) })
      });
      if (res.ok) {
        setSelectedIds(new Set());
        fetchUsers();
      }
    } catch {
      alert('Error deleting users');
    }
  };

  const exportData = () => {
    const dataToExport = selectedIds.size > 0
      ? users.filter(u => selectedIds.has(u.id))
      : filteredUsers;

    if (dataToExport.length === 0) return;

    const csv = Papa.unparse(dataToExport.map(u => ({
      'Admission Number': u.admission_number,
      'Email': u.email,
      'Status': u.status,
      'Latitude': u.lat ?? '',
      'Longitude': u.lng ?? ''
    })));

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'students_export.csv');
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <header className="admin-page-header">
        <h1>Users Management</h1>
        <div style={{ display: 'flex', gap: 12 }}>
          <button className="btn-submit" style={{ width: 'auto', padding: '10px 16px', background: 'var(--bg-card)', border: '1px solid var(--accent-border)' }} onClick={exportData}>
            📥 Export Data
          </button>
          <button className="btn-submit" style={{ width: 'auto', padding: '10px 16px' }} onClick={() => setShowAddModal(true)}>
            + Add User
          </button>
        </div>
      </header>

      <div style={{ padding: 32 }}>
        {/* Toolbar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <input
              type="text"
              className="form-input"
              placeholder="Search by email or admission no..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              style={{ width: 300 }}
            />
            <select
              className="form-input"
              value={filterStatus}
              onChange={e => { setFilterStatus(e.target.value); setPage(1); }}
              style={{ width: 150 }}
            >
              <option value="ALL">All Status</option>
              <option value="FILLED">Filled</option>
              <option value="UNFILLED">Unfilled</option>
            </select>
            <button
              id="load-roads-btn"
              onClick={handleLoadRoads}
              disabled={loadingRoads}
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                padding: '10px 16px',
                background: loadingRoads ? 'rgba(155,89,245,0.3)' : 'rgba(155,89,245,0.15)',
                border: '1px solid rgba(155,89,245,0.5)',
                color: '#c084fc',
                borderRadius: 8, cursor: loadingRoads ? 'not-allowed' : 'pointer',
                fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap',
                transition: 'background 0.2s',
              }}
            >
              {loadingRoads ? (
                <><div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Loading…</>
              ) : (
                <>🗺️ Load Roads</>
              )}
            </button>
            {roadsMsg && (
              <span style={{
                fontSize: 13, fontWeight: 500,
                color: roadsMsg.ok ? '#50fa7b' : '#ff5555',
                background: roadsMsg.ok ? 'rgba(80,250,123,0.08)' : 'rgba(255,85,85,0.08)',
                border: `1px solid ${roadsMsg.ok ? 'rgba(80,250,123,0.25)' : 'rgba(255,85,85,0.25)'}`,
                borderRadius: 6, padding: '6px 12px',
              }}>{roadsMsg.text}</span>
            )}
          </div>

          {selectedIds.size > 0 && (
            <button className="btn-submit" style={{ width: 'auto', background: '#ff5555', color: '#fff', padding: '8px 16px' }} onClick={handleBulkDelete}>
              🗑️ Delete Selected ({selectedIds.size})
            </button>
          )}
        </div>

        {/* Table */}
        <div style={{ background: 'var(--bg-card)', borderRadius: 12, border: '1px solid var(--accent-border)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--accent-border)' }}>
                <th style={{ padding: '16px', width: 40 }}>
                  <input
                    type="checkbox"
                    checked={paginatedUsers.length > 0 && selectedIds.size === paginatedUsers.length}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th style={{ padding: '16px', color: 'var(--text-secondary)', fontWeight: 500 }}>Admission Number</th>
                <th style={{ padding: '16px', color: 'var(--text-secondary)', fontWeight: 500 }}>Email</th>
                <th style={{ padding: '16px', color: 'var(--text-secondary)', fontWeight: 500 }}>Password</th>
                <th style={{ padding: '16px', color: 'var(--text-secondary)', fontWeight: 500 }}>Status</th>
                <th style={{ padding: '16px', color: 'var(--text-secondary)', fontWeight: 500 }}>Latitude</th>
                <th style={{ padding: '16px', color: 'var(--text-secondary)', fontWeight: 500 }}>Longitude</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} style={{ padding: 32, textAlign: 'center', color: 'var(--text-secondary)' }}>Loading users...</td></tr>
              ) : paginatedUsers.length === 0 ? (
                <tr><td colSpan={7} style={{ padding: 32, textAlign: 'center', color: 'var(--text-secondary)' }}>No users found.</td></tr>
              ) : (
                paginatedUsers.map(u => (
                  <tr key={u.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ padding: '16px' }}>
                      <input type="checkbox" checked={selectedIds.has(u.id)} onChange={() => toggleSelect(u.id)} />
                    </td>
                    <td style={{ padding: '16px', color: '#fff', fontFamily: 'monospace' }}>{u.admission_number}</td>
                    <td style={{ padding: '16px', color: 'var(--text-primary)' }}>{u.email}</td>
                    <td style={{ padding: '16px', color: 'var(--text-secondary)', fontFamily: 'monospace', fontSize: 13 }}>
                      {u.admission_number}
                    </td>
                    <td style={{ padding: '16px' }}>
                      <span style={{
                        padding: '4px 10px',
                        borderRadius: 20,
                        fontSize: 12,
                        fontWeight: 600,
                        background: u.status === 'FILLED' ? 'rgba(80,250,123,0.1)' : 'rgba(255,184,108,0.1)',
                        color: u.status === 'FILLED' ? '#50fa7b' : '#ffb86c'
                      }}>
                        {u.status}
                      </span>
                    </td>
                    <td style={{ padding: '16px', color: 'var(--text-secondary)', fontSize: 13 }}>{u.lat ?? '-'}</td>
                    <td style={{ padding: '16px', color: 'var(--text-secondary)', fontSize: 13 }}>{u.lng ?? '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {/* Pagination */}
          {!loading && totalPages > 1 && (
            <div style={{ padding: '16px', borderTop: '1px solid var(--accent-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
                Showing {(page - 1) * perPage + 1} to {Math.min(page * perPage, filteredUsers.length)} of {filteredUsers.length}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  disabled={page === 1}
                  onClick={() => setPage(p => p - 1)}
                  style={{ padding: '6px 12px', background: 'var(--bg)', border: '1px solid var(--accent-border)', color: '#fff', borderRadius: 4, cursor: page === 1 ? 'not-allowed' : 'pointer' }}
                >Prev</button>
                <button
                  disabled={page === totalPages}
                  onClick={() => setPage(p => p + 1)}
                  style={{ padding: '6px 12px', background: 'var(--bg)', border: '1px solid var(--accent-border)', color: '#fff', borderRadius: 4, cursor: page === totalPages ? 'not-allowed' : 'pointer' }}
                >Next</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {showAddModal && (
        <AddUserModal onClose={() => setShowAddModal(false)} onRefresh={fetchUsers} />
      )}
    </div>
  );
}
