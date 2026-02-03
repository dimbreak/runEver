import { useMemo, useState, useEffect } from 'react';
import PosLayout from '../components/PosLayout';
import { readSession, setBenchmarkResult } from '../utils/session';
import { jsPDF } from 'jspdf';


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
  const storedOrders = readSession<any[]>('runEverMark_pos_orders', []);
  const orders = useMemo(() => {
    const combined = [...storedOrders, ...fallbackOrders];
    return combined.sort((a, b) => {
      const timeA = a.submitTime ? new Date(a.submitTime).getTime() : 0;
      const timeB = b.submitTime ? new Date(b.submitTime).getTime() : 0;
      return timeB - timeA;
    });
  }, [storedOrders]);
  const [activeId, setActiveId] = useState(orders[0]?.id ?? '');

  const activeOrder = useMemo(
    () => orders.find((order) => order.id === activeId) ?? orders[0],
    [orders, activeId]
  );

  useEffect(() => {
    const ep = readSession<string>('runEverMark_active_entryPoint', '');
    if (ep === '#/pos/basic') {
        setBenchmarkResult(ep, 'visit_pos_list', true);
    }
    if (ep === '#/pos/pro') {
      setBenchmarkResult(ep, 'visit_pos_list', true);
    }
  }, []);

  const handlePrintInvoice = () => {
     if (!activeOrder) return;

     const doc = new jsPDF();

     // HOST HEADER (Salesforce POS)
     const ep = readSession<string>('runEverMark_active_entryPoint', '');
     if (ep === '#/pos/pro') setBenchmarkResult(ep, 'click_download_invoice', true);

     doc.setFontSize(20);
     doc.setTextColor(1, 118, 211); // Sellfroce Blue
     doc.text("INVOICE", 160, 20);

     doc.setFontSize(12);
     doc.setTextColor(60, 60, 60);
     doc.setFont('helvetica', 'bold');
     doc.text("Sellfroce POS System", 20, 20);
     doc.setFont('helvetica', 'normal');
     doc.setFontSize(10);
     doc.text("123 Cloud Way", 20, 25);
     doc.text("San Francisco, CA 94105", 20, 30);
     doc.text("support@sellfrocepos.com", 20, 35);

     doc.setDrawColor(200, 200, 200);
     doc.line(20, 40, 190, 40);

     // INVOICE DETAILS
     doc.setFontSize(11);
     doc.setTextColor(0, 0, 0);
     doc.text(`Invoice Number: INV-${activeOrder.id}`, 20, 55);
     doc.text(`Date Issued: ${new Date().toLocaleDateString()}`, 20, 61);

     // BILL TO (Client)
     doc.text("Bill To:", 20, 75);
     doc.setFontSize(12);
     doc.setFont('helvetica', 'bold');
     doc.text(activeOrder.client, 20, 82);
     doc.setFont('helvetica', 'normal');

     // SUMMARY TABLE
     let y = 100;
     doc.setFillColor(243, 242, 242);
     doc.rect(20, y-8, 170, 10, 'F');
     doc.setFontSize(10);
     doc.setFont('helvetica', 'bold');
     doc.text("Description", 25, y);
     doc.text("Total", 170, y);

     y += 10;
     doc.setFont('helvetica', 'normal');
     doc.text(`Order Balance - ${activeOrder.id}`, 25, y);
     doc.text(`$${activeOrder.total.toFixed(2)}`, 170, y);

     y += 10;
     doc.text("Services and Goods", 25, y);

     // TOTAL
     y += 20;
     doc.setDrawColor(0, 0, 0);
     doc.line(120, y, 190, y);
     y += 6;
     doc.setFontSize(12);
     doc.setFont('helvetica', 'bold');
     doc.text("TOTAL DUE", 120, y);
     doc.text(`$${activeOrder.total.toFixed(2)}`, 170, y);

     doc.save(`${activeOrder.id}_Invoice.pdf`);
  };

  return (
    <PosLayout title="Order List">
      <div className="grid">
        <div style={{ marginRight: 24, flex: 1 }}>
           <div className="sf-card" style={{ padding: 0 }}>
             {/* List View Header */}
             <div style={{ padding: '12px 16px', borderBottom: '1px solid #dddbda', background: '#f8f9fb', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#0176d3' }}>All Orders ({orders.length})</span>
                <a
                   href="#/pos/create"
                   onClick={() => {
                      const ep = readSession<string>('runEverMark_active_entryPoint', '');
                      if (ep === '#/pos/basic') setBenchmarkResult(ep, 'click_create_order', true);
                     if (ep === '#/pos/pro') setBenchmarkResult(ep, 'click_create_order', true);
                   }}
                   className="sf-button brand"
                   style={{ textDecoration: 'none', fontSize: 13, padding: '4px 12px' }}>Create Order</a>
             </div>

             <div className="sf-list-view" style={{ border: 'none', borderRadius: 0 }}>
               {orders.map(order => (
                  <div
                    key={order.id}
                    className={`sf-list-item ${order.id === activeId ? 'selected' : ''}`}
                    onClick={() => setActiveId(order.id)}
                  >
                    <div>
                      <div style={{ color: '#0176d3', fontWeight: 600, fontSize: 14 }}>{order.id}</div>
                      <div className="sf-label" style={{ marginBottom: 0 }}>{order.client}</div>
                    </div>
                    <div>
                      <span className="sf-badge" style={{ background: '#ecebea', color: '#080707', padding: '2px 8px', borderRadius: 4, fontSize: 12}}>{order.status}</span>
                    </div>
                  </div>
               ))}
             </div>
           </div>
        </div>

        {/* Record Detail Panel (Right Side, mimicking split view) */}
        <div style={{ width: 320 }}>
            {activeOrder && (
              <div className="sf-card">
                  <h3>{activeOrder.id}</h3>

                  <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
                    <div>
                      <label className="sf-label">Client Account</label>
                      <div style={{ borderBottom: '1px solid #dddbda', paddingBottom: 4}}>{activeOrder.client}</div>
                    </div>

                    <div>
                      <label className="sf-label">Order Status</label>
                       <div>{activeOrder.status}</div>
                    </div>

                    <div>
                      <label className="sf-label">Total Amount</label>
                       <div style={{ fontSize: 16, fontWeight: 700 }}>${activeOrder.total.toFixed(2)}</div>
                    </div>
                  </div>

                  <div style={{ marginTop: 24, display: 'flex', gap: 12 }}>
                     <button className="sf-button brand">Process</button>
                     <button className="sf-button" onClick={handlePrintInvoice}>Print Invoice</button>
                  </div>
              </div>
            )}
        </div>
      </div>
    </PosLayout>
  );
}
