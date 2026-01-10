import EcommHeader from '../components/EcommHeader';
import { readSession } from '../utils/session';

export default function EcommerceOrderedPage() {
  const order = readSession<any>('runEverMark_ecomm_order', null);

  return (
    <section className="panel">
      <EcommHeader />
      <div className="panel-sub">
        <h3>Order confirmation</h3>
        {order ? (
          <>
            <p className="muted">Order stored in sessionStorage for replay.</p>
            <p>
              Delivery for <strong>{order.name}</strong> on <strong>{order.deliveryDate}</strong>
            </p>
            <ul className="summary-list">
              {order.items?.map((item: any) => (
                <li key={item.id}>
                  {item.name} × {item.quantity}
                  <span>${item.lineTotal.toFixed(2)}</span>
                </li>
              ))}
            </ul>
            <p className="total-row">
              Total <strong>${order.total.toFixed(2)}</strong>
            </p>
          </>
        ) : (
          <p className="muted">No order found. Complete checkout to generate one.</p>
        )}
      </div>
    </section>
  );
}
