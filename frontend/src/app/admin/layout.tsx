'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import './admin.css';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (pathname === '/admin/login') {
      setIsAdmin(true);
      return;
    }

    const checkAuth = async () => {
      const token = localStorage.getItem('token');
      if (!token) {
        router.replace('/admin/login');
        return;
      }

      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/auth/me/`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          if (data.role === 'admin') {
            setIsAdmin(true);
          } else {
            localStorage.removeItem('token');
            router.replace('/admin/login');
          }
        } else {
          localStorage.removeItem('token');
          router.replace('/admin/login');
        }
      } catch {
        router.replace('/admin/login');
      }
    };
    checkAuth();
  }, [pathname, router]);

  // Close mobile drawer on route change
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  const handleLogout = async () => {
    localStorage.removeItem('token');
    await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/auth/logout/`, {
      method: 'POST',
    }).catch(() => {});
    setIsAdmin(false);
    router.replace('/admin/login');
  };

  if (isAdmin === null) {
    return <div className="admin-loading">Checking authorization...</div>;
  }

  if (pathname === '/admin/login') {
    return <>{children}</>;
  }

  return (
    <div className="admin-layout">
      {sidebarOpen && (
        <button
          type="button"
          className="admin-sidebar-backdrop"
          aria-label="Close menu"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside className={`admin-sidebar ${sidebarOpen ? 'admin-sidebar-open' : ''}`}>
        <div className="admin-sidebar-header">
          <div className="admin-logo">🛡️ Admin Portal</div>
          <button
            type="button"
            className="admin-sidebar-close"
            aria-label="Close menu"
            onClick={() => setSidebarOpen(false)}
          >
            ✕
          </button>
        </div>
        <nav className="admin-nav">
          <Link href="/admin/users" className={`admin-nav-item ${pathname === '/admin/users' ? 'active' : ''}`}>
            👥 User Management
          </Link>
        </nav>
        <div className="admin-sidebar-footer">
          <button className="admin-logout-btn" onClick={handleLogout}>Log Out</button>
        </div>
      </aside>

      <div className="admin-main-wrap">
        <header className="admin-mobile-topbar">
          <button
            type="button"
            className="admin-menu-btn"
            aria-label="Open menu"
            onClick={() => setSidebarOpen(true)}
          >
            ☰
          </button>
          <span className="admin-mobile-title">Admin Portal</span>
        </header>
        <main className="admin-main-content">
          {children}
        </main>
      </div>
    </div>
  );
}
