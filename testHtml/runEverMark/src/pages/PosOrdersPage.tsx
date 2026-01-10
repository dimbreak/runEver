import { useMemo, useState } from 'react';
import PosLayout from '../components/PosLayout';
import { readSession } from '../utils/session';

const fallbackOrders = [
  {
    id: 'PO-1041',
    client: 'Northwind Travel',
    status: 'Awaiting pickup',
    total: 1240.5
  },
  {
    id: 'PO-1042',
    client: 'Nova Foods',
    status: 'Packed',
    total: 875.2
  },
  {
    id: 'PO-1043',
    client: 'Atlas Retail',
    status: 'Out for delivery',
    total: 214.9
  }
];

export default function PosOrdersPage() {
  const storedOrders = readSession<typeof fallbackOrders>('runEverMark_pos_orders', []);
  const orders = storedOrders.length ? storedOrders : fallbackOrders;
  const [activeId, setActiveId] = useState(orders[0]?.id ?? '');

  const activeOrder = useMemo(
    () => orders.find((order) => order.id === activeId) ?? orders[0],
    [orders, activeId]
  );

  return (
    <PosLayout title="Order list">
      <div className="split">
        <aside className="list">
          {orders.map((order) => (
            <button
              key={order.id}
              type="button"
              className={`list-item ${order.id === activeId ? 'active' : ''}`}
              onClick={() => setActiveId(order.id)}
            >
              <div>
                <p className="list-title">{order.id}</p>
                <p className="list-meta">{order.client}</p>
              </div>
              <span className="badge">{order.status}</span>
            </button>
          ))}
        </aside>
        <article className="detail">
          {activeOrder ? (
            <>
              <h3>{activeOrder.id}</h3>
              <p className="muted">Client: {activeOrder.client}</p>
              <p>Status: {activeOrder.status}</p>
              <p className="price">Total ${activeOrder.total.toFixed(2)}</p>
            </>
          ) : (
            <p className="muted">Pick an order to preview.</p>
          )}
        </article>
      </div>
    </PosLayout>
  );
}
