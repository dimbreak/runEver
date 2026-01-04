import { useMemo, useState, type FormEvent } from 'react';
import PosLayout from '../components/PosLayout';
import { productCatalog } from '../data/products';
import { readSession, writeSession } from '../utils/session';

type OrderLine = {
  id: string;
  productId: string;
  quantity: number;
  discount: number;
};

type DraftOrder = {
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  address: string;
  city: string;
  region: string;
  postal: string;
  supportingDoc: string;
  lines: OrderLine[];
};

const emptyLine = () => ({
  id: `line-${Date.now()}-${Math.random()}`,
  productId: productCatalog[0]?.id ?? '',
  quantity: 1,
  discount: 0
});

export default function PosOrderCreatePage() {
  const savedDraft = readSession<DraftOrder | null>('runEverMark_pos_draft', null);
  const [lines, setLines] = useState<OrderLine[]>(savedDraft?.lines ?? [emptyLine()]);
  const [supportingDoc, setSupportingDoc] = useState(savedDraft?.supportingDoc ?? '');

  const totals = useMemo(() => {
    return lines.map((line) => {
      const product = productCatalog.find((entry) => entry.id === line.productId);
      const base = product ? product.price * line.quantity : 0;
      const discountValue = (base * line.discount) / 100;
      return {
        id: line.id,
        name: product?.name ?? 'Unknown',
        base,
        discountValue,
        total: base - discountValue
      };
    });
  }, [lines]);

  const orderTotal = totals.reduce((sum, item) => sum + item.total, 0);

  const handleLineChange = (id: string, updates: Partial<OrderLine>) => {
    setLines((current) =>
      current.map((line) => (line.id === id ? { ...line, ...updates } : line))
    );
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const draft: DraftOrder = {
      clientName: String(formData.get('clientName') || ''),
      clientEmail: String(formData.get('clientEmail') || ''),
      clientPhone: String(formData.get('clientPhone') || ''),
      address: String(formData.get('address') || ''),
      city: String(formData.get('city') || ''),
      region: String(formData.get('region') || ''),
      postal: String(formData.get('postal') || ''),
      supportingDoc,
      lines
    };
    writeSession('runEverMark_pos_draft', draft);
    window.location.hash = '#/pos/preview';
  };

  return (
    <PosLayout title="Create order">
      <form className="form" onSubmit={handleSubmit}>
        <h3>Client contact</h3>
        <label>
          Client name
          <input name="clientName" defaultValue={savedDraft?.clientName} required />
        </label>
        <label>
          Email
          <input name="clientEmail" type="email" defaultValue={savedDraft?.clientEmail} required />
        </label>
        <label>
          Phone
          <input name="clientPhone" defaultValue={savedDraft?.clientPhone} required />
        </label>

        <h3>Delivery address</h3>
        <label>
          Street
          <input name="address" defaultValue={savedDraft?.address} required />
        </label>
        <label>
          City
          <input name="city" defaultValue={savedDraft?.city} required />
        </label>
        <label>
          Region
          <input name="region" defaultValue={savedDraft?.region} required />
        </label>
        <label>
          Postal
          <input name="postal" defaultValue={savedDraft?.postal} required />
        </label>

        <h3>Supporting document</h3>
        <label>
          Upload file
          <input
            type="file"
            onChange={(event) => setSupportingDoc(event.target.files?.[0]?.name ?? '')}
          />
        </label>
        {supportingDoc && <p className="muted">Uploaded: {supportingDoc}</p>}

        <h3>Order lines</h3>
        <datalist id="product-options">
          {productCatalog.map((product) => (
            <option key={product.id} value={product.id}>
              {product.name}
            </option>
          ))}
        </datalist>
        {lines.map((line) => {
          const total = totals.find((item) => item.id === line.id);
          return (
            <div className="line-item" key={line.id}>
              <label>
                Product
                <input
                  list="product-options"
                  value={line.productId}
                  onChange={(event) => handleLineChange(line.id, { productId: event.target.value })}
                />
              </label>
              <label>
                Qty
                <input
                  type="number"
                  min={1}
                  value={line.quantity}
                  onChange={(event) =>
                    handleLineChange(line.id, { quantity: Number(event.target.value) })
                  }
                />
              </label>
              <label>
                Discount %
                <input
                  type="number"
                  min={0}
                  max={50}
                  value={line.discount}
                  onChange={(event) =>
                    handleLineChange(line.id, { discount: Number(event.target.value) })
                  }
                />
              </label>
              <div className="line-total">
                <span className="muted">Line total</span>
                <strong>${total?.total.toFixed(2) ?? '0.00'}</strong>
              </div>
            </div>
          );
        })}
        <button
          className="button ghost"
          type="button"
          onClick={() => setLines((current) => [...current, emptyLine()])}
        >
          Add line item
        </button>

        <div className="summary-row">
          <span>Order total</span>
          <strong>${orderTotal.toFixed(2)}</strong>
        </div>
        <button className="button" type="submit">
          Preview order
        </button>
      </form>
    </PosLayout>
  );
}
