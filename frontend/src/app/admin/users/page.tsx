'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import Papa from 'papaparse';
import AddUserModal, { ParsedStudentRow } from './components/AddUserModal';

interface User {
  id: number;
  admission_number: string;
  email: string;
  status: 'FILLED' | 'UNFILLED';
  lat: number | null;
  lng: number | null;
}

interface DuplicateEntry {
  roll_number: string;
  name: string;
  email: string;
  department: string;
}

interface ImportError {
  admission_number: string;
  errors: Record<string, string[]>;
}

interface ImportJob {
  status: 'running' | 'done' | 'cancelled';
  totalRows: number;
  totalBatches: number;
  batchesDone: number;
  created: number;
  duplicateCount: number;
  errorCount: number;
  errors: ImportError[];
  duplicates: DuplicateEntry[];
  showErrors: boolean;
}

const BATCH_SIZE = 100;
const CONCURRENCY = 5; // 5 parallel requests at a time
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

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
  const [clearingAll, setClearingAll] = useState(false);
  const [importJob, setImportJob] = useState<ImportJob | null>(null);
  const importAbortRef = useRef<AbortController | null>(null);
  const perPage = 10;

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/students/`, {
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
      const res = await fetch(`${API_BASE}/api/roads/load/`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
      });
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

  const handleClearAll = async () => {
    const count = users.length;
    if (count === 0) { alert('There are no students to delete.'); return; }
    if (!confirm(`⚠️ Are you sure you want to permanently delete ALL ${count} students?\n\nThis will also delete their location data. This action cannot be undone.`)) return;

    setClearingAll(true);
    try {
      const res = await fetch(`${API_BASE}/api/students/clear_all/`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
      });
      if (res.ok) {
        const data = await res.json();
        alert(`✅ Successfully deleted ${data.deleted} students.`);
        setSelectedIds(new Set());
        fetchUsers();
      } else {
        const data = await res.json();
        alert(`❌ Failed to clear students: ${data.detail || 'Unknown error'}`);
      }
    } catch {
      alert('❌ Could not reach server.');
    } finally {
      setClearingAll(false);
    }
  };

  // ── Background batch import (5 parallel workers) ────────────────────────────
  const startBatchImport = async (rows: ParsedStudentRow[]) => {
    // Build batches of BATCH_SIZE
    const batches: ParsedStudentRow[][] = [];
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      batches.push(rows.slice(i, i + BATCH_SIZE));
    }

    // Mutable job object — we spread into state after each group so React re-renders
    const job: ImportJob = {
      status: 'running',
      totalRows: rows.length,
      totalBatches: batches.length,
      batchesDone: 0,
      created: 0,
      duplicateCount: 0,
      errorCount: 0,
      errors: [],
      duplicates: [],
      showErrors: false,
    };

    setImportJob({ ...job });
    importAbortRef.current = new AbortController();

    // Process in parallel groups of CONCURRENCY
    for (let i = 0; i < batches.length; i += CONCURRENCY) {
      if (importAbortRef.current?.signal.aborted) {
        job.status = 'cancelled';
        setImportJob({ ...job });
        return;
      }

      const group = batches.slice(i, i + CONCURRENCY);

      await Promise.allSettled(
        group.map(async (batch) => {
          try {
            const res = await fetch(`${API_BASE}/api/students/bulk/`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`,
              },
              body: JSON.stringify(batch),
              signal: importAbortRef.current?.signal,
            });
            const data = await res.json();
            if (res.ok) {
              job.created += data.created ?? 0;
              job.duplicateCount += data.duplicates?.length ?? 0;
              job.errorCount += data.errors?.length ?? 0;
              if (data.duplicates?.length) job.duplicates.push(...data.duplicates);
              if (data.errors?.length) job.errors.push(...data.errors);
            } else {
              job.errorCount += batch.length;
            }
          } catch (err) {
            if (!(err instanceof Error && err.name === 'AbortError')) {
              job.errorCount += batch.length;
            }
          }
          job.batchesDone += 1;
        })
      );

      // Update UI after every parallel group
      setImportJob({ ...job });
    }

    job.status = 'done';
    setImportJob({ ...job });
    fetchUsers(); // Refresh table after import
    importAbortRef.current = null;
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
      const res = await fetch(`${API_BASE}/api/students/bulk_delete/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
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
      'Longitude': u.lng ?? '',
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

  const importPct = importJob
    ? Math.round((importJob.batchesDone / Math.max(importJob.totalBatches, 1)) * 100)
    : 0;

  return (
    <div>
      <header className="admin-page-header">
        <h1>Users Management</h1>
        <div className="admin-page-actions">
          <button className="admin-btn admin-btn-secondary" onClick={exportData}>
            📥 Export Data
          </button>
          <button
            className="admin-btn admin-btn-danger"
            onClick={handleClearAll}
            disabled={clearingAll || users.length === 0}
            title="Delete ALL students from the database"
          >
            {clearingAll ? (
              <><div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Clearing…</>
            ) : (
              <>🗑️ Clear All ({users.length})</>
            )}
          </button>
          <button className="admin-btn admin-btn-primary" onClick={() => setShowAddModal(true)}>
            + Add User
          </button>
        </div>
      </header>

      <div className="admin-page-body">

        {/* ── Import Status Banner (visible on main page, persists after modal closes) ── */}
        {importJob && (
          <div className={`import-banner${importJob.status === 'done' ? ' import-banner-done' : ''}${importJob.status === 'cancelled' ? ' import-banner-cancelled' : ''}`}>

            {/* Header */}
            <div className="import-banner-header">
              <div className="import-banner-title">
                {importJob.status === 'running' && (
                  <span className="import-banner-spinner" />
                )}
                {importJob.status === 'running'
                  ? `Importing ${importJob.totalRows.toLocaleString()} students (${CONCURRENCY} parallel workers)…`
                  : importJob.status === 'cancelled'
                  ? '⛔ Import cancelled'
                  : `✅ Import complete — ${importJob.created.toLocaleString()} students added`}
              </div>
              <div className="import-banner-actions">
                {importJob.status === 'running' && (
                  <button
                    className="import-cancel-btn"
                    onClick={() => importAbortRef.current?.abort()}
                  >
                    ⛔ Cancel
                  </button>
                )}
                {importJob.status !== 'running' && (
                  <button
                    className="import-dismiss-btn"
                    onClick={() => setImportJob(null)}
                    title="Dismiss"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            {/* Progress bar */}
            <div className="import-progress-bar-track">
              <div
                className={`import-progress-bar-fill${importJob.status === 'done' ? ' import-progress-bar-done' : ''}`}
                style={{ width: `${importPct}%` }}
              />
            </div>

            {/* Stats pills + percentage */}
            <div className="import-banner-stats-row">
              <div className="import-progress-stats">
                <span className="import-stat import-stat-created">
                  ✅ {importJob.created.toLocaleString()} created
                </span>
                {importJob.duplicateCount > 0 && (
                  <span className="import-stat import-stat-dup">
                    ⚠️ {importJob.duplicateCount} skipped
                  </span>
                )}
                {importJob.errorCount > 0 && (
                  <button
                    className="import-stat import-stat-err import-stat-btn"
                    onClick={() =>
                      setImportJob(j => j ? { ...j, showErrors: !j.showErrors } : null)
                    }
                  >
                    ❌ {importJob.errorCount} errors {importJob.showErrors ? '▲' : '▼'}
                  </button>
                )}
                <span className="import-stat import-stat-batch">
                  {importJob.batchesDone}/{importJob.totalBatches} batches
                </span>
              </div>
              <span className="import-progress-pct">{importPct}%</span>
            </div>

            {/* Error details panel — expandable */}
            {importJob.showErrors && importJob.errors.length > 0 && (
              <div className="import-error-panel">
                <div className="import-error-panel-title">
                  ❌ Error Details ({importJob.errors.length} rows failed)
                </div>
                <div className="import-error-list">
                  {importJob.errors.slice(0, 50).map((e, i) => {
                    const msgs = Object.entries(e.errors)
                      .flatMap(([field, errs]) =>
                        errs.map(msg => `${field}: ${msg}`)
                      )
                      .join(' · ');
                    return (
                      <div key={i} className="import-error-row">
                        <span className="import-error-adm">{e.admission_number || '—'}</span>
                        <span className="import-error-msg">{msgs}</span>
                      </div>
                    );
                  })}
                  {importJob.errors.length > 50 && (
                    <div className="import-error-more">
                      …and {importJob.errors.length - 50} more errors not shown
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

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
        <AddUserModal
          onClose={() => setShowAddModal(false)}
          onRefresh={fetchUsers}
          onStartImport={(rows) => {
            setShowAddModal(false);     // Close modal immediately
            startBatchImport(rows);     // Run import in background
          }}
        />
      )}
    </div>
  );
}
