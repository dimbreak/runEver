import { useMemo, useState } from 'react';
import PosLayout from '../components/PosLayout';
import { productCatalog } from '../data/products';
import { readSession, writeSession } from '../utils/session';

export default function PosOrderPreviewPage() {
  const draft = readSession<any>('runEverMark_pos_draft', null);
  const [status, setStatus] = useState('');

  const lines = useMemo(() => {
    if (!draft?.lines) {
      return [];
    }
    return draft.lines.map((line: any) => {
      const product = productCatalog.find((entry) => entry.id === line.productId);
      const base = product ? product.price * line.quantity : 0;
      const discountValue = (base * line.discount) / 100;
      return {
        name: product?.name ?? line.productId,
        quantity: line.quantity,
        total: base - discountValue
      };
    });
  }, [draft]);

  const total = lines.reduce((sum: number, item: any) => sum + item.total, 0);

  const handleSubmit = () => {
    const existing = readSession<any[]>('runEverMark_pos_orders', []);
    const newOrder = {
      id: `PO-${Math.floor(1000 + Math.random() * 9000)}`,
      client: draft?.clientName ?? 'New client',
      status: 'Submitted',
      total
    };
    writeSession('runEverMark_pos_orders', [newOrder, ...existing]);
    setStatus('Order submitted and added to order list.');
  };

  return (
    <PosLayout title="Order preview">
      <div className="panel-sub">
        {draft ? (
          <>
            <h3>Client summary</h3>
            <p>
              {draft.clientName} · {draft.clientEmail} · {draft.clientPhone}
            </p>
            <p>
              {draft.address}, {draft.city}, {draft.region} {draft.postal}
            </p>
            {draft.supportingDoc && <p>Supporting doc: {draft.supportingDoc}</p>}

            <h3>Line items</h3>
            <ul className="summary-list">
              {lines.map((line: any, index: number) => (
                <li key={`${line.name}-${index}`}>
                  {line.name} × {line.quantity}
                  <span>${line.total.toFixed(2)}</span>
                </li>
              ))}
            </ul>
            <p className="total-row">
              Total <strong>${total.toFixed(2)}</strong>
            </p>
            <button className="button" onClick={handleSubmit}>
              Submit order
            </button>
            {status && <p className="muted">{status}</p>}
          </>
        ) : (
          <p className="muted">No draft order found. Create one first.</p>
        )}
      </div>
    </PosLayout>
  );
}
