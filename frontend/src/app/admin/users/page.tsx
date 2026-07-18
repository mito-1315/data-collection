'use client';

import { useState, useEffect, useMemo } from 'react';
import Papa from 'papaparse';
import AddUserModal from './components/AddUserModal';

interface User {
  id: number;
  roll_number: string;
  name: string;
  email: string;
  department: string;
  status: 'FILLED' | 'UNFILLED';
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showAddModal, setShowAddModal] = useState(false);
  const [page, setPage] = useState(1);
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

  // Filtering
  const filteredUsers = useMemo(() => {
    return users.filter(u => {
      const matchesSearch = u.name.toLowerCase().includes(search.toLowerCase()) || 
                            u.roll_number.toLowerCase().includes(search.toLowerCase());
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
    } catch (e) {
      alert("Error deleting users");
    }
  };

  const exportData = () => {
    const dataToExport = selectedIds.size > 0 
      ? users.filter(u => selectedIds.has(u.id))
      : filteredUsers;
    
    if (dataToExport.length === 0) return;

    const csv = Papa.unparse(dataToExport.map(u => ({
      'Roll Number': u.roll_number,
      'Name': u.name,
      'Email': u.email,
      'Department': u.department,
      'Status': u.status
    })));

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "students_export.csv");
    document.body.appendChild(link);
    link.click();
    link.remove();
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
          <div style={{ display: 'flex', gap: 16 }}>
            <input 
              type="text" 
              className="form-input" 
              placeholder="Search by name or roll..." 
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
                <th style={{ padding: '16px', color: 'var(--text-secondary)', fontWeight: 500 }}>Roll Number</th>
                <th style={{ padding: '16px', color: 'var(--text-secondary)', fontWeight: 500 }}>Name</th>
                <th style={{ padding: '16px', color: 'var(--text-secondary)', fontWeight: 500 }}>Email</th>
                <th style={{ padding: '16px', color: 'var(--text-secondary)', fontWeight: 500 }}>Department</th>
                <th style={{ padding: '16px', color: 'var(--text-secondary)', fontWeight: 500 }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} style={{ padding: 32, textAlign: 'center', color: 'var(--text-secondary)' }}>Loading users...</td></tr>
              ) : paginatedUsers.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: 32, textAlign: 'center', color: 'var(--text-secondary)' }}>No users found.</td></tr>
              ) : (
                paginatedUsers.map(u => (
                  <tr key={u.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ padding: '16px' }}>
                      <input type="checkbox" checked={selectedIds.has(u.id)} onChange={() => toggleSelect(u.id)} />
                    </td>
                    <td style={{ padding: '16px', color: '#fff' }}>{u.roll_number}</td>
                    <td style={{ padding: '16px', color: 'var(--text-primary)' }}>{u.name}</td>
                    <td style={{ padding: '16px', color: 'var(--text-secondary)' }}>{u.email}</td>
                    <td style={{ padding: '16px', color: 'var(--text-secondary)' }}>{u.department}</td>
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
