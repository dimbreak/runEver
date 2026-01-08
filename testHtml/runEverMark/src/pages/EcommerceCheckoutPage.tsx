import { useMemo, useState, type FormEvent } from 'react';
import DeliveryDateInput from '../components/DeliveryDateInput';
import EcommHeader from '../components/EcommHeader';
import { productCatalog } from '../data/products';
import { readSession, writeSession } from '../utils/session';

const CART_KEY = 'runEverMark_ecomm_cart';

export default function EcommerceCheckoutPage() {
  const [useCalendar, setUseCalendar] = useState(false);
  const [deliveryDate, setDeliveryDate] = useState('');
  const [status, setStatus] = useState('');

  const cart = readSession<{ id: string; quantity: number }[]>(CART_KEY, []);
  const lineItems = useMemo(() => {
    const items: Array<{
      id: string;
      name: string;
      price: number;
      quantity: number;
      lineTotal: number;
    }> = [];
    cart.forEach((item) => {
      const product = productCatalog.find((entry) => entry.id === item.id);
      if (!product) {
        return;
      }
      items.push({
        id: product.id,
        name: product.name,
        price: product.price,
        quantity: item.quantity,
        lineTotal: product.price * item.quantity
      });
    });
    return items;
  }, [cart]);

  const total = lineItems.reduce((sum, item) => sum + item.lineTotal, 0);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const order = {
      name: String(formData.get('name') || ''),
      address: String(formData.get('address') || ''),
      city: String(formData.get('city') || ''),
      region: String(formData.get('region') || ''),
      deliveryDate,
      notes: String(formData.get('notes') || ''),
      items: lineItems,
      total
    };
    writeSession('runEverMark_ecomm_order', order);
    writeSession(CART_KEY, []);
    setStatus('Order placed.');
    window.location.hash = '#/ecomm/ordered';
  };

  return (
    <section className="panel">
      <EcommHeader />
      <div className="split">
        <form className="form" onSubmit={handleSubmit}>
          <h3>Delivery details</h3>
          <label>
            Full name
            <input name="name" required />
          </label>
          <label>
            Address
            <input name="address" required />
          </label>
          <label>
            City
            <input name="city" required />
          </label>
          <label>
            Region
            <input name="region" required />
          </label>
          <label>
            Delivery date
            <DeliveryDateInput
              value={deliveryDate}
              onChange={setDeliveryDate}
              useCalendar={useCalendar}
            />
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={useCalendar}
              onChange={(event) => setUseCalendar(event.target.checked)}
            />
            Use calendar selector
          </label>
          <label>
            Notes
            <textarea name="notes" rows={3} />
          </label>
          <button className="button" type="submit">
            Place order
          </button>
          <button className="button ghost" type="button">
            Pay with PayPal
          </button>
          {status && <p className="muted">{status}</p>}
        </form>
        <div className="panel-sub">
          <h3>Order summary</h3>
          {lineItems.length === 0 ? (
            <p className="muted">Cart is empty. Add items from the products page.</p>
          ) : (
            <ul className="summary-list">
              {lineItems.map((item) => (
                <li key={item.id}>
                  {item.name} × {item.quantity}
                  <span>${item.lineTotal.toFixed(2)}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="total-row">
            Total <strong>${total.toFixed(2)}</strong>
          </p>
        </div>
      </div>
    </section>
  );
}
