import { useMemo, useState } from 'react';
import PosLayout from '../components/PosLayout';
import { productCatalog } from '../data/products';
import { readSession, writeSession, setBenchmarkResult } from '../utils/session';
import { jsPDF } from 'jspdf';

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
    const entryPoint = readSession<string>('runEverMark_active_entryPoint', '');
    if (entryPoint === '#/pos/basic') {
      setBenchmarkResult(entryPoint, 'submit_order', true);
      //end test
    }
    if (entryPoint === '#/pos/pro') {
        setBenchmarkResult(entryPoint, 'submit_order', true);
    }
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

  const handleDownloadPdf = () => {
      const doc = new jsPDF();

      // Client Header
      doc.setFontSize(22);
      doc.setTextColor(0, 0, 0);
      doc.setFont('helvetica', 'bold');
      doc.text(draft.clientName || 'CLIENT COMPANY', 20, 25);

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(60, 60, 60);
      doc.text(draft.clientEmail || '', 20, 32);
      doc.text(draft.clientPhone || '', 20, 37);
      doc.text(draft.address || '', 20, 42);
      doc.text(`${draft.city || ''}, ${draft.region || ''} ${draft.postal || ''}`, 20, 47);

      // Title
      doc.setFontSize(24);
      doc.setTextColor(1, 118, 211);
      doc.text("PURCHASE ORDER", 120, 25);

      // Client Info
      doc.setFontSize(12);
      doc.text("Bill To:", 20, 40);
      doc.setFontSize(10);
      doc.text(draft.clientName || 'N/A', 20, 46);
      doc.text(draft.clientEmail || '', 20, 52);
      doc.text(draft.clientPhone || '', 20, 58);

      doc.text("Ship To:", 120, 40);
      doc.text(draft.address || '', 120, 46);
      doc.text(`${draft.city || ''}, ${draft.region || ''} ${draft.postal || ''}`, 120, 52);

      // Line Items Header
      let y = 80;
      doc.setDrawColor(200, 200, 200);
      doc.line(20, y, 190, y);
      y += 5;
      doc.setFont('helvetica', 'bold');
      doc.text("Product", 20, y);
      doc.text("Qty", 140, y);
      doc.text("Total", 170, y);
      doc.setFont('helvetica', 'normal');
      y += 5;
      doc.line(20, y, 190, y);
      y += 10;

      // Line Items
      lines.forEach((line: any) => {
          doc.text(line.name, 20, y);
          doc.text(String(line.quantity), 140, y);
          doc.text(`$${line.total.toFixed(2)}`, 170, y);
          y += 10;
      });

      // Total
      y += 10;
      doc.setFont('helvetica', 'bold');
      doc.text(`TOTAL: $${total.toFixed(2)}`, 140, y);

      doc.save(`OrderForm_${draft.clientName.replace(/\s+/g, '')}.pdf`);
  };

  return (
    <PosLayout title="Preview Order">
      <div className="sf-card">
        {draft ? (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
                <h3>Order Summary</h3>
                <button className="sf-button" onClick={handleDownloadPdf}>⬇ Download Order Form (PDF)</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 24 }}>
                <div className="sf-card" style={{ background: '#f8f9fb', border: 'none' }}>
                    <div className="sf-label">Client</div>
                    <div>{draft.clientName}</div>
                    <div className="sf-label">Email</div>
                    <div>{draft.clientEmail}</div>
                </div>
                <div className="sf-card" style={{ background: '#f8f9fb', border: 'none' }}>
                    <div className="sf-label">Shipping Address</div>
                    <div>{draft.address}</div>
                    <div>{draft.city}, {draft.region} {draft.postal}</div>
                </div>
            </div>

            <h4 style={{ marginBottom: 16 }}>Items</h4>
            <div className="sf-list-view">
              {lines.map((line: any, index: number) => (
                <div key={`${line.name}-${index}`} className="sf-list-item" style={{ cursor: 'default' }}>
                  <div style={{ flex: 1 }}>{line.name}</div>
                  <div style={{ width: 100 }}>x {line.quantity}</div>
                  <div style={{ width: 100, textAlign: 'right', fontWeight: 700 }}>${line.total.toFixed(2)}</div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 24, textAlign: 'right', fontSize: 20 }}>
              Total: <strong style={{ color: '#0176d3' }}>${total.toFixed(2)}</strong>
            </div>

            <div style={{ marginTop: 32, display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                <a href="#/pos/create" className="sf-button">Back to Edit</a>
                <button className="sf-button brand" onClick={handleSubmit}>
                  Submit Final Order
                </button>
            </div>
            {status && <p style={{ marginTop: 12, color: 'green', textAlign: 'right' }}>{status}</p>}
          </>
        ) : (
          <p className="muted">No draft order found. Create one first.</p>
        )}
      </div>
    </PosLayout>
  );
}
