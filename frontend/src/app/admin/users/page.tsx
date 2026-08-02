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
        <div className="admin-page-actions">
          <button className="admin-btn admin-btn-secondary" onClick={exportData}>
            📥 Export Data
          </button>
          <button className="admin-btn admin-btn-primary" onClick={() => setShowAddModal(true)}>
            + Add User
          </button>
        </div>
      </header>

      <div className="admin-page-body">
        <div className="admin-toolbar">
          <div className="admin-toolbar-filters">
            <input
              type="text"
              className="form-input admin-search-input"
              placeholder="Search by email or admission no..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
            />
            <select
              className="form-input admin-filter-select"
              value={filterStatus}
              onChange={e => { setFilterStatus(e.target.value); setPage(1); }}
            >
              <option value="ALL">All Status</option>
              <option value="FILLED">Filled</option>
              <option value="UNFILLED">Unfilled</option>
            </select>
            <button
              id="load-roads-btn"
              onClick={handleLoadRoads}
              disabled={loadingRoads}
              className="admin-load-roads-btn"
            >
              {loadingRoads ? (
                <><div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Loading…</>
              ) : (
                <>🗺️ Load Roads</>
              )}
            </button>
            {roadsMsg && (
              <span className={`admin-roads-msg ${roadsMsg.ok ? 'admin-roads-msg-ok' : 'admin-roads-msg-err'}`}>
                {roadsMsg.text}
              </span>
            )}
          </div>

          {selectedIds.size > 0 && (
            <button className="admin-btn admin-btn-danger" onClick={handleBulkDelete}>
              🗑️ Delete Selected ({selectedIds.size})
            </button>
          )}
        </div>

        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th className="admin-table-check">
                  <input
                    type="checkbox"
                    checked={paginatedUsers.length > 0 && selectedIds.size === paginatedUsers.length}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th>Admission Number</th>
                <th>Email</th>
                <th className="admin-table-hide-sm">Password</th>
                <th>Status</th>
                <th className="admin-table-hide-xs">Latitude</th>
                <th className="admin-table-hide-xs">Longitude</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="admin-table-empty">Loading users...</td></tr>
              ) : paginatedUsers.length === 0 ? (
                <tr><td colSpan={7} className="admin-table-empty">No users found.</td></tr>
              ) : (
                paginatedUsers.map(u => (
                  <tr key={u.id}>
                    <td className="admin-table-check">
                      <input type="checkbox" checked={selectedIds.has(u.id)} onChange={() => toggleSelect(u.id)} />
                    </td>
                    <td className="admin-table-mono">{u.admission_number}</td>
                    <td>{u.email}</td>
                    <td className="admin-table-mono admin-table-hide-sm">{u.admission_number}</td>
                    <td>
                      <span className={`admin-status-badge ${u.status === 'FILLED' ? 'admin-status-filled' : 'admin-status-unfilled'}`}>
                        {u.status}
                      </span>
                    </td>
                    <td className="admin-table-muted admin-table-hide-xs">{u.lat ?? '-'}</td>
                    <td className="admin-table-muted admin-table-hide-xs">{u.lng ?? '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {!loading && totalPages > 1 && (
            <div className="admin-pagination">
              <div className="admin-pagination-info">
                Showing {(page - 1) * perPage + 1} to {Math.min(page * perPage, filteredUsers.length)} of {filteredUsers.length}
              </div>
              <div className="admin-pagination-btns">
                <button disabled={page === 1} onClick={() => setPage(p => p - 1)}>Prev</button>
                <button disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Next</button>
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
