import {
  useMemo,
  useState,
  useEffect,
  type ChangeEvent,
  type Dispatch,
  type FormEvent,
  type SetStateAction,
} from 'react';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import {
  Combobox,
  ComboboxInput,
  ComboboxPopover,
  ComboboxList,
  ComboboxOption,
} from '@reach/combobox';
import PosLayout from '../components/PosLayout';
import { productCatalog } from '../data/products';
import {
  readSession,
  writeSession,
  setBenchmarkResult,
} from '../utils/session';
import { type PosDraftOrder } from '../webSkills/prepareOrderDraft';
import {
  POS_PREPARE_ORDER_AUTOPREVIEW_KEY,
  POS_PREPARE_ORDER_EVENT,
} from '../webSkills/prepareOrderRuntime';
import '@reach/combobox/styles.css';

type OrderLine = {
  id: string;
  productId: string;
  quantity: number;
  unitPrice: number;
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
  deliveryDate: string;
  supportingDoc: string;
  remark?: string;
  lines: OrderLine[];
};

const emptyLine = () => ({
  id: `line-${Date.now()}-${Math.random()}`,
  productId: '',
  quantity: 1,
  unitPrice: 0,
  discount: 0,
});

// Helper component for Product Selection
const ProductCombobox = ({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) => {
  const [term, setTerm] = useState('');
  const [to, setTo] = useState<any>(undefined);

  // Find current product to display its name
  const currentProduct = productCatalog.find((p) => p.id === value);

  // Update term when value changes externally (initial load or reset)
  useEffect(() => {
    if (currentProduct) {
      if (to) {
        clearTimeout(to);
      }
      setTerm(currentProduct.name);
    }
  }, [currentProduct, to]);

  const handleSelect = (itemValue: string) => {
    const name = itemValue.split(' - ')[0];
    const product = productCatalog.find((p) => p.name === name);
    if (product) {
      if (to) {
        clearTimeout(to);
      }
      setTerm(product.name);
      onChange(product.id);
    } else {
      onChange('');
    }
  };

  const filteredProducts = useMemo(() => {
    if (!term) return productCatalog;
    const kw = term.toLowerCase().split(' - ')[0];
    return productCatalog.filter((p) => p.name.toLowerCase().includes(kw));
  }, [term]);

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    setTerm(event.target.value);
    if (event.target.value.length < 2) {
      onChange('');
    }
    // If user clears input, we might want to clear selection?
    // Or just let them type.
    // If they type something that doesn't match, value remains what it was?
    // Or should we clear ID if text doesn't match?
    // For now, let's keep it simple: strict selection required for ID update via list.
    // Ideally we clear ID if text mismatch, but let's stick to safe behavior.
  };

  return (
    <Combobox onSelect={handleSelect} openOnFocus>
      <ComboboxInput
        className="sf-input"
        value={term}
        onChange={handleInputChange}
        onBlur={() => {
          setTo(
            setTimeout(
              () =>
                setTerm((t) => {
                  if (currentProduct?.name === t) {
                    return t;
                  }
                  onChange('');
                  return '';
                }),
              200,
            ),
          );
        }}
        style={{ width: '100%' }}
        placeholder="Select a product..."
        autocomplete
      />
      {filteredProducts.length > 0 && (
        <ComboboxPopover className="shadow-popup">
          <ComboboxList persistSelection>
            {filteredProducts
              .map((p) => (
                <ComboboxOption key={p.id} value={`${p.name} - $${p.price}`} />
              ))
              .slice(0, 10)}
          </ComboboxList>
        </ComboboxPopover>
      )}
    </Combobox>
  );
};

export default function PosOrderCreatePage() {
  const savedDraft = readSession<DraftOrder | null>(
    'runEverMark_pos_draft',
    null,
  );
  const [lines, setLines] = useState<OrderLine[]>(
    savedDraft?.lines ?? [emptyLine()],
  );
  const [supportingDoc] = useState(savedDraft?.supportingDoc ?? '');
  const entryPoint = readSession<string>('runEverMark_active_entryPoint', '');

  // Random Data State for inputs (controlled inputs for better prefill handling)
  const [clientData, setClientData] = useState({
    clientName: savedDraft?.clientName ?? '',
    clientEmail: savedDraft?.clientEmail ?? '',
    clientPhone: savedDraft?.clientPhone ?? '',
    address: savedDraft?.address ?? '',
    city: savedDraft?.city ?? '',
    region: savedDraft?.region ?? '',
    postal: savedDraft?.postal ?? '',
    deliveryDate: savedDraft?.deliveryDate ?? '',
    remark: savedDraft?.remark ?? '',
  });

  // Calculate min date as Date object for Calendar
  const minDateObj = useMemo(() => {
    const today = new Date();
    const nextMonth = new Date(
      today.getFullYear(),
      today.getMonth() + 11,
      today.getDate(),
    );
    const day = nextMonth.getDay();
    const daysUntilMonday = (1 + 7 - day) % 7;
    nextMonth.setDate(nextMonth.getDate() + daysUntilMonday);
    return nextMonth;
  }, []);

  // const minDate = useMemo(() => getMinDeliveryDate(), []); // Replaced by minDateObj logic above

  const totals = useMemo(() => {
    return lines.map((line) => {
      const product = productCatalog.find(
        (entry) => entry.id === line.productId,
      );
      const base = (line.unitPrice ?? 0) * line.quantity;
      const discountValue = (base * line.discount) / 100;
      return {
        id: line.id,
        name: product?.name ?? 'Unknown',
        base,
        discountValue,
        total: base - discountValue,
      };
    });
  }, [lines]);

  const orderTotal = totals.reduce((sum, item) => sum + item.total, 0);

  const handleLineChange = (id: string, updates: Partial<OrderLine>) => {
    setLines((current) =>
      current.map((line) => {
        if (line.id !== id) return line;

        // If product is changing, auto-update unit price
        if (updates.productId) {
          const product = productCatalog.find(
            (p) => p.id === updates.productId,
          );
          if (product) {
            return { ...line, ...updates, unitPrice: product.price };
          }
        }
        return { ...line, ...updates };
      }),
    );
  };

  const handleClientChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setClientData({ ...clientData, [e.target.name]: e.target.value });
  };

  // Benchmark Hook
  useEffect(() => {
    if (entryPoint === '#/pos/basic') {
      const name = clientData.clientName.toLowerCase();
      const email = clientData.clientEmail.toLowerCase();
      if (name) {
        setBenchmarkResult(entryPoint, 'input_client', name.includes('gengar'));
      }
      if (email) {
        setBenchmarkResult(
          entryPoint,
          'input_client_email',
          email.includes('gengar@pokemon.com'),
        );
      }

      const phone = clientData.clientPhone;
      if (phone) {
        setBenchmarkResult(
          entryPoint,
          'input_client_phone',
          phone.includes('555-0199') || phone.includes('5550199'),
        );
      }

      const addr = clientData.address.toLowerCase();
      const city = clientData.city.toLowerCase();
      const region = clientData.region.toLowerCase();
      if (addr && city && region) {
        setBenchmarkResult(
          entryPoint,
          'input_address',
          addr.includes('1600 pennsylvania ave nw'.toLowerCase()) &&
            city.includes('washington'.toLowerCase()) &&
            region.includes('dc'.toLowerCase()) &&
            clientData.postal.includes('20500'),
        );
      }

      const hasProduct = lines.some(
        (l) => l.productId === 'sku-chair' && l.quantity === 1,
      );
      if (hasProduct) {
        setBenchmarkResult(entryPoint, 'input_product', true);
      }

      const today = new Date();
      const targetDate = new Date(
        today.getFullYear() + 1,
        today.getMonth(),
        today.getDate(),
      );
      const day = targetDate.getDay();
      const daysUntilMonday = (1 + 7 - day) % 7;
      targetDate.setDate(targetDate.getDate() + daysUntilMonday);
      const expectedDate = targetDate.toISOString().split('T')[0];

      if (clientData.deliveryDate === expectedDate) {
        setBenchmarkResult(entryPoint, 'input_delivery_date', true);
      }
    } else if (entryPoint === '#/pos/pro') {
      const chair = lines.find(
        (l) => l.productId === 'sku-chair' && l.quantity === 2,
      );
      const kb = lines.find(
        (l) => l.productId === 'sku-keyboard' && l.quantity === 2,
      );
      const laptop = lines.find(
        (l) => l.productId === 'sku-laptop' && l.quantity === 1,
      );

      if (chair && kb && laptop) {
        setBenchmarkResult(entryPoint, 'input_lines', lines.length === 3);
      }

      const name = clientData.clientName.toLowerCase();
      const email = clientData.clientEmail.toLowerCase();
      if (name) {
        setBenchmarkResult(
          entryPoint,
          'input_client',
          name.includes('northwind travel'.toLowerCase()),
        );
      }
      if (email) {
        setBenchmarkResult(
          entryPoint,
          'input_client_email',
          email.includes('contact@client.com'),
        );
      }

      const phone = clientData.clientPhone;
      if (phone) {
        setBenchmarkResult(
          entryPoint,
          'input_phone',
          phone.includes('555-0100') || phone.includes('5550100'),
        );
      }

      const addr = clientData.address.toLowerCase();
      const city = clientData.city.toLowerCase();
      const postal = clientData.postal.toLowerCase();
      const region = clientData.region.toLowerCase();
      if (addr && city && postal && region) {
        setBenchmarkResult(
          entryPoint,
          'input_address',
          addr === '123 client st'.toLowerCase() &&
            city === 'business city'.toLowerCase() &&
            postal === '12345' &&
            region.includes('st'),
        );
      }

      const today = new Date();
      const targetDate = new Date(
        today.getFullYear(),
        today.getMonth() + 11,
        today.getDate(),
      );
      const day = targetDate.getDay();
      let daysUntilTuesday = (2 + 7 - day) % 7;
      if (daysUntilTuesday === 0) daysUntilTuesday = 7;

      targetDate.setDate(targetDate.getDate() + daysUntilTuesday);
      const expectedDate = targetDate.toISOString().split('T')[0];

      const monday = new Date(targetDate.getTime() - 86400000)
        .toISOString()
        .split('T')[0];

      if (clientData.deliveryDate === monday) {
        setBenchmarkResult(entryPoint, 'input_delivery_date', true);
      } else if (clientData.deliveryDate === expectedDate) {
        setBenchmarkResult(entryPoint, 'input_delivery_date', true);
        setBenchmarkResult(entryPoint, 'input_correct_delivery_date', true);
      }
    }
  }, [clientData, lines, entryPoint]);

  useEffect(() => {
    const handlePreparedOrder = (event: Event) => {
      const customEvent = event as CustomEvent<PosDraftOrder>;
      applyDraftToForm(customEvent.detail, setClientData, setLines);
      submitCreateOrderForm();
    };

    window.addEventListener(POS_PREPARE_ORDER_EVENT, handlePreparedOrder);
    return () => {
      window.removeEventListener(POS_PREPARE_ORDER_EVENT, handlePreparedOrder);
    };
  }, []);

  useEffect(() => {
    if (
      !savedDraft ||
      !readSession<boolean>(POS_PREPARE_ORDER_AUTOPREVIEW_KEY, false)
    ) {
      return;
    }

    writeSession(POS_PREPARE_ORDER_AUTOPREVIEW_KEY, false);
    applyDraftToForm(savedDraft, setClientData, setLines);
    submitCreateOrderForm();
  }, [savedDraft]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (entryPoint === '#/pos/basic') {
      setBenchmarkResult(entryPoint, 'submit_order', true);
    }

    const draft: DraftOrder = {
      ...clientData,
      supportingDoc,
      lines,
    };
    writeSession('runEverMark_pos_draft', draft);
    window.location.hash = '#/pos/preview';
  };

  return (
    <PosLayout title="Create Order">
      <div className="sf-card">
        <form name="posCreateOrderForm" onSubmit={handleSubmit}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 24,
              marginBottom: 24,
            }}
          >
            <div>
              <h3 style={{ borderBottom: 'none' }}>Client Information</h3>
              <div className="sf-form-element">
                <label className="sf-label">Client Name</label>
                <input
                  className="sf-input"
                  name="clientName"
                  value={clientData.clientName}
                  onChange={handleClientChange}
                  required
                />
              </div>
              <div className="sf-form-element">
                <label className="sf-label">Email</label>
                <input
                  className="sf-input"
                  name="clientEmail"
                  type="email"
                  value={clientData.clientEmail}
                  onChange={handleClientChange}
                  required
                />
              </div>
              <div className="sf-form-element">
                <label className="sf-label">Phone</label>
                <input
                  className="sf-input"
                  name="clientPhone"
                  value={clientData.clientPhone}
                  onChange={handleClientChange}
                  required
                />
              </div>
            </div>
            <div>
              <h3 style={{ borderBottom: 'none' }}>Delivery Address</h3>
              <div className="sf-form-element">
                <label className="sf-label">Street</label>
                <input
                  className="sf-input"
                  name="address"
                  value={clientData.address}
                  onChange={handleClientChange}
                  required
                />
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label className="sf-label">City</label>
                  <input
                    className="sf-input"
                    name="city"
                    value={clientData.city}
                    onChange={handleClientChange}
                    required
                  />
                </div>
                <div style={{ width: 80 }}>
                  <label className="sf-label">Region</label>
                  <input
                    className="sf-input"
                    name="region"
                    value={clientData.region}
                    onChange={handleClientChange}
                    required
                  />
                </div>
              </div>
              <div className="sf-form-element">
                <label className="sf-label">Postal Code</label>
                <input
                  className="sf-input"
                  name="postal"
                  value={clientData.postal}
                  onChange={handleClientChange}
                  required
                />
              </div>
              {entryPoint === '#/pos/pro' ? (
                <div
                  className="sf-form-element"
                  style={{ position: 'relative' }}
                >
                  <label className="sf-label">
                    Delivery Date - order takes 11 months to produce
                  </label>
                  <Calendar
                    onChange={(value: any) => {
                      // value can be Date | Date[] | null. We assume single date selection.
                      if (value instanceof Date) {
                        // Handle timezone offset simply preventing day shift on conversion
                        const offsetUser = value.getTimezoneOffset() * 60000;
                        const dateAdjusted = new Date(
                          value.getTime() - offsetUser,
                        );
                        setClientData({
                          ...clientData,
                          deliveryDate: dateAdjusted
                            .toISOString()
                            .split('T')[0],
                        });
                      }
                    }}
                    value={
                      clientData.deliveryDate
                        ? new Date(clientData.deliveryDate)
                        : null
                    }
                    minDate={minDateObj}
                  />
                </div>
              ) : (
                <div className="sf-form-element">
                  <label className="sf-label">Delivery Date</label>
                  <input
                    className="sf-input"
                    name="deliveryDate"
                    value={clientData.deliveryDate}
                    onChange={handleClientChange}
                  />
                </div>
              )}
            </div>
          </div>

          <div
            style={{
              borderTop: '1px solid #dddbda',
              paddingTop: 16,
              marginBottom: 24,
            }}
          >
            <h3>
              Order Lines
              <button
                style={{ float: 'right', marginTop: -4 }}
                className="sf-button"
                type="button"
                onClick={() => setLines((current) => [...current, emptyLine()])}
              >
                + Add Line Item
              </button>
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {lines.map((line) => {
                console.log(line);
                const total = totals.find((item) => item.id === line.id);
                return (
                  <div
                    className="sf-card"
                    key={line.id}
                    style={{
                      background: '#f8f9fb',
                      padding: 12,
                      display: 'flex',
                      gap: 12,
                      alignItems: 'flex-end',
                    }}
                  >
                    <div style={{ flex: 2 }}>
                      <label className="sf-label">Product</label>
                      <ProductCombobox
                        value={line.productId}
                        onChange={(newId) =>
                          handleLineChange(line.id, { productId: newId })
                        }
                      />
                    </div>
                    <div style={{ width: 100 }}>
                      <label className="sf-label">Unit Price</label>
                      <div
                        className="sf-input-wrapper"
                        style={{ position: 'relative' }}
                      >
                        <span
                          style={{
                            position: 'absolute',
                            left: 8,
                            top: 8,
                            color: '#555',
                          }}
                        >
                          $
                        </span>
                        <input
                          className="sf-input"
                          type="number"
                          min={0}
                          step="0.01"
                          style={{ paddingLeft: 20 }}
                          value={line.unitPrice}
                          disabled={!line.productId}
                          onChange={(event) =>
                            handleLineChange(line.id, {
                              unitPrice: Number(event.target.value),
                            })
                          }
                        />
                      </div>
                    </div>
                    <div style={{ width: 80 }}>
                      <label className="sf-label">Qty</label>
                      <input
                        className="sf-input"
                        type="number"
                        min={1}
                        value={line.quantity}
                        disabled={!line.productId}
                        onChange={(event) =>
                          handleLineChange(line.id, {
                            quantity: Number(event.target.value),
                          })
                        }
                      />
                    </div>
                    <div style={{ width: 80 }}>
                      <label className="sf-label">Disc %</label>
                      <input
                        className="sf-input"
                        type="number"
                        min={0}
                        max={50}
                        value={line.discount}
                        disabled={!line.productId}
                        onChange={(event) =>
                          handleLineChange(line.id, {
                            discount: Number(event.target.value),
                          })
                        }
                      />
                    </div>
                    <div
                      style={{
                        textAlign: 'right',
                        minWidth: 100,
                        paddingBottom: 6,
                      }}
                    >
                      <div className="sf-label">Subtotal</div>
                      <strong>${total?.total.toFixed(2) ?? '0.00'}</strong>
                    </div>
                    {lines.length > 1 && (
                      <button
                        type="button"
                        className="sf-button"
                        style={{
                          color: 'red',
                          border: 'none',
                          background: 'transparent',
                        }}
                        onClick={() =>
                          setLines(lines.filter((l) => l.id !== line.id))
                        }
                      >
                        ✕
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ marginTop: 24 }}>
            <h3>Additional Information</h3>
            <div className="sf-form-element">
              <label className="sf-label">Remark</label>
              <textarea
                className="sf-textarea"
                name="remark"
                value={clientData.remark}
                onChange={(e) =>
                  setClientData({ ...clientData, remark: e.target.value })
                }
                rows={3}
                style={{ width: '100%', resize: 'vertical' }}
              />
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderTop: '2px solid #dddbda',
              paddingTop: 16,
              marginTop: 24,
            }}
          >
            <div style={{ fontSize: 18 }}>
              Total:{' '}
              <strong style={{ color: '#0176d3' }}>
                ${orderTotal.toFixed(2)}
              </strong>
            </div>
            <button
              className="sf-button brand"
              style={{ fontSize: 14, height: 36 }}
              type="submit"
            >
              Preview Order
            </button>
          </div>
        </form>
      </div>
    </PosLayout>
  );
}

function applyDraftToForm(
  draft: PosDraftOrder,
  setClientData: Dispatch<
    SetStateAction<{
      clientName: string;
      clientEmail: string;
      clientPhone: string;
      address: string;
      city: string;
      region: string;
      postal: string;
      deliveryDate: string;
      remark: string;
    }>
  >,
  setLines: Dispatch<SetStateAction<OrderLine[]>>,
) {
  setClientData({
    clientName: draft.clientName,
    clientEmail: draft.clientEmail,
    clientPhone: draft.clientPhone,
    address: draft.address,
    city: draft.city,
    region: draft.region,
    postal: draft.postal,
    deliveryDate: draft.deliveryDate,
    remark: draft.remark ?? '',
  });
  setLines(draft.lines);
}

function submitCreateOrderForm() {
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      document.forms.namedItem('posCreateOrderForm')?.requestSubmit();
    });
  });
}
