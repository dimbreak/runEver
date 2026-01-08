import PosLayout from '../components/PosLayout';
import { readSession } from '../utils/session';

export default function PosDashboardPage() {
  const operator = readSession<string>('runEverMark_pos_operator', 'Operator');

  return (
    <PosLayout title="Dashboard">
      <div className="grid">
        <div className="card">
          <h4>Operator</h4>
          <p className="muted">Signed in as {operator}</p>
        </div>
        <div className="card">
          <h4>Today</h4>
          <p className="muted">18 orders · $4,520 revenue</p>
        </div>
        <div className="card">
          <h4>Alerts</h4>
          <p className="muted">3 deliveries need confirmation</p>
        </div>
      </div>
    </PosLayout>
  );
}
