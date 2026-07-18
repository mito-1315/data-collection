'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import './admin.css';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    // If we're on the login page, don't check for auth or render sidebar
    if (pathname === '/admin/login') {
      setIsAdmin(true); // Allow render
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
      } catch (e) {
        router.replace('/admin/login');
      }
    };
    checkAuth();
  }, [pathname, router]);

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

  // Login page doesn't get the sidebar
  if (pathname === '/admin/login') {
    return <>{children}</>;
  }

  return (
    <div className="admin-layout">
      {/* Sidebar */}
      <aside className="admin-sidebar">
        <div className="admin-sidebar-header">
          <div className="admin-logo">🛡️ Admin Portal</div>
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

      {/* Main Content */}
      <main className="admin-main-content">
        {children}
      </main>
    </div>
  );
}
