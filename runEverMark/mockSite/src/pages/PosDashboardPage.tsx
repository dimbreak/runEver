import PosLayout from '../components/PosLayout';
import { readSession } from '../utils/session';

export default function PosDashboardPage() {
  const operator = readSession<string>('runEverMark_pos_operator', 'Operator');

  return (
    <PosLayout title="Dashboard">
      <div className="grid">
        <div className="sf-card" style={{ borderTop: '3px solid #0176d3' }}>
          <h3>Welcome, {operator}</h3>
          <div className="sf-label">Performance Assessment</div>
          <div style={{ fontSize: 24, fontWeight: 300, color: '#0176d3'}}>Excellent</div>
        </div>

        <div className="sf-card" style={{ borderTop: '3px solid #0176d3' }}>
          <h4>Today's Sales</h4>
          <div style={{ fontSize: 28, fontWeight: 700 }}>$4,520</div>
          <div className="sf-label">18 Orders Completed</div>
        </div>

        <div className="sf-card" style={{ borderTop: '3px solid #eab839' }}>
           <h4>Tasks & Alerts</h4>
           {/* Simple list of tasks */}
           <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8}}>
                 <span style={{ color: '#eab839'}}>⚠</span>
                 <span>3 deliveries pending confirmation</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8}}>
                 <span style={{ color: 'green'}}>✔</span>
                 <span>Inventory count completed</span>
              </div>
           </div>
        </div>
      </div>
    </PosLayout>
  );
}
