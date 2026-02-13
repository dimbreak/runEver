import { ReactNode } from 'react';

// However, original used simple <a> tags. I'll stick to <a> tags with hash.

export default function PosLayout({ title, children }: { title: string; children: ReactNode }) {
  // Simple check for active path if possible, or just render links
  const hash = window.location.hash;

  return (
    <div className="sf-layout">
      {/* Global Header */}
      <header className="sf-header">
        <div className="sf-logo">
          {/* Waffle icon placeholder */}
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <rect x="2" y="2" width="4" height="4" rx="1" />
            <rect x="8" y="2" width="4" height="4" rx="1" />
            <rect x="14" y="2" width="4" height="4" rx="1" />
            <rect x="2" y="8" width="4" height="4" rx="1" />
            <rect x="8" y="8" width="4" height="4" rx="1" />
            <rect x="14" y="8" width="4" height="4" rx="1" />
            <rect x="2" y="14" width="4" height="4" rx="1" />
            <rect x="8" y="14" width="4" height="4" rx="1" />
            <rect x="14" y="14" width="4" height="4" rx="1" />
          </svg>
        </div>
        <span className="sf-app-name">Sellforce POS</span>
      </header>

      <div className="sf-body">
        {/* Sidebar */}
        <aside className="sf-sidebar">
          <nav>
            <a href="#/pos/dashboard" className={`sf-nav-item ${hash.includes('dashboard') ? 'active' : ''}`}>Dashboard</a>
            <a href="#/pos/orders" className={`sf-nav-item ${hash.includes('orders') ? 'active' : ''}`}>Orders</a>
            <a href="#" className="sf-nav-item" onClick={(e) => e.preventDefault()} style={{ opacity: 0.5, cursor: 'not-allowed' }}>Customers</a>
            <a href="#" className="sf-nav-item" onClick={(e) => e.preventDefault()} style={{ opacity: 0.5, cursor: 'not-allowed' }}>Inventory</a>
            <a href="#" className="sf-nav-item" onClick={(e) => e.preventDefault()} style={{ opacity: 0.5, cursor: 'not-allowed' }}>Reports</a>
            <a href="#" className="sf-nav-item" onClick={(e) => e.preventDefault()} style={{ opacity: 0.5, cursor: 'not-allowed' }}>Settings</a>
          </nav>
        </aside>

        {/* Main Content */}
        <main className="sf-main">
          <div className="sf-page-header">
            <div className="sf-page-title">
              <div className="sf-icon-box">
                {/* Generic Standard Object Icon (e.g. Account-like) */}
                <span>📄</span>
              </div>
              <span>{title}</span>
            </div>
            <div className="sf-actions">
               {/* Placeholders for page-level actions */}
               <button className="sf-button">Refresh</button>
            </div>
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}
