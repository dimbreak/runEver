import { ReactNode } from 'react';

export default function PosLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="panel pos-layout">
      <aside className="side-menu">
        <h3>POS Console</h3>
        <nav>
          <a href="#/pos/dashboard">Dashboard</a>
          <a href="#/pos/orders">Orders</a>
          <a href="#/pos/create">Create order</a>
          <a href="#/pos/preview">Order preview</a>
        </nav>
      </aside>
      <div className="pos-content">
        <header className="section-header">
          <div>
            <h2>{title}</h2>
            <p className="muted">Session-backed POS workflow.</p>
          </div>
        </header>
        {children}
      </div>
    </section>
  );
}
