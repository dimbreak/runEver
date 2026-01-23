import { useMemo, useState, type FormEvent } from 'react';
import { Lock } from 'lucide-react';
import { productCatalog } from '../data/products';
import { readSession, writeSession, setBenchmarkResult } from '../utils/session';

const CART_KEY = 'runEverMark_ecomm_cart';

// Simple Levenshtein distance for fuzzy matching
const levenshtein = (a: string, b: string): number => {
  const matrix = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return matrix[a.length][b.length];
};

const isFuzzyMatch = (input: string, target: string, threshold = 0.8): boolean => {
  const normalizedInput = input.toLowerCase().replace(/[^a-z0-9]/g, '');
  const normalizedTarget = target.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (normalizedInput.includes(normalizedTarget) || normalizedTarget.includes(normalizedInput)) return true;

  const distance = levenshtein(normalizedInput, normalizedTarget);
  const maxLength = Math.max(normalizedInput.length, normalizedTarget.length);
  return (1 - distance / maxLength) >= threshold;
};

export default function EcommerceCheckoutPage({ entryPoint }: { entryPoint?: string }) {
  // const [status, setStatus] = useState(''); // Unused
  const [deliveryDate] = useState('Thursday, Jan 18');
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'gatepal'>('card');

  const cart = readSession<{ id: string; quantity: number }[]>(CART_KEY, []);

  // ... (lineItems calculation remains same)
  const lineItems = useMemo(() => {
    const items: Array<{
      id: string;
      name: string;
      price: number;
      quantity: number;
      lineTotal: number;
      image: string;
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
        lineTotal: product.price * item.quantity,
        image: '' // Placeholder
      });
    });
    return items;
  }, [cart]);

  const itemsTotal = lineItems.reduce((sum, item) => sum + item.lineTotal, 0);
  const shipping = itemsTotal > 25 ? 0 : 5.99;
  const tax = itemsTotal * 0.08;
  const total = itemsTotal + shipping + tax;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    handlePlaceOrder(new FormData(event.currentTarget));
  };

  const handlePlaceOrder = (formData: FormData) => {
    const order = {
      name: String(formData.get('name') || ''),
      address: String(formData.get('address') || ''),
      city: String(formData.get('city') || ''),
      region: String(formData.get('region') || ''),
      deliveryDate,
      items: lineItems,
      total,
      paymentMethod
    };
    writeSession('runEverMark_ecomm_order', order);
    writeSession(CART_KEY, []);
    window.location.hash = '#/ecomm/ordered';
  };

  const handleGatePalClick = () => {
    if (paymentMethod === 'gatepal') {
      writeSession('runEverMark_ecomm_order', {
        name: 'John Doe',
        city: 'San Jose',
        region: 'CA',
      deliveryDate,
      items: lineItems,
      total,
      paymentMethod
    });
      writeSession(CART_KEY, []);
      if (entryPoint) {
        setBenchmarkResult(entryPoint, 'select_gatepal', true);
        writeSession('runEverMark_active_entryPoint', entryPoint);
        window.location.hash = `#/gateway/login/${entryPoint.replace('#/', '')}`;
      } else {
        window.location.hash = '#/gateway/login';
      }
      return;
    }
  };

  const validateField = (field: string, value: string) => {
      if (!entryPoint) return;

      let isValid = false;
      switch (field) {
          case 'name':
              isValid = isFuzzyMatch(value, 'Pika Chu');
              break;
          case 'address':
              isValid = isFuzzyMatch(value, '1600 Pennsylvania Ave NW');
              break;
          case 'card':
              // Check last 4 or full match
              const cleanVal = value.replace(/\s/g, '');
              const cleanTarget = '1234432112344321';
              isValid = cleanVal === cleanTarget || cleanVal.endsWith('4321');
              break;
        case 'name_on_card':
          isValid = isFuzzyMatch(value, 'Pika Chu');
          break;
          case 'cvv':
              isValid = value === '999';
              break;
          case 'expiry':
              isValid = value === '01/30';
              break;
      }

      if (isValid) {
          setBenchmarkResult(entryPoint, `field_${field}`, true);
      }
  };

  return (
    <div style={{ backgroundColor: 'white', minHeight: '100vh', fontFamily: 'Arial, sans-serif' }}>
    {/* ... Header omitted for brevity, keeping existing structure ... */}
      <div style={{ background: 'linear-gradient(to bottom,#ffffff,#f3f3f3)', borderBottom: '1px solid #ddd', padding: '10px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingLeft: '20px', paddingRight: '20px' }}>
         <div style={{ display: 'flex', alignItems: 'center' }}>
            <span style={{ fontSize: '24px', fontWeight: 'bold', letterSpacing: '-1px', cursor: 'pointer' }} onClick={() => window.location.hash = '#/ecomm/products'}>
                Ra<span style={{ color: '#ff9900' }}>mazon</span>
            </span>
         </div>
         <div style={{ fontSize: '22px', color: '#333', fontWeight: '400' }}>
             Checkout (<a href="#/ecomm/products" style={{ color: '#0066c0', textDecoration: 'none' }}>{cart.length} item{cart.length !== 1 ? 's' : ''}</a>)
         </div>
         <div>
             <Lock size={20} color="#999" />
         </div>
      </div>

      <div style={{ maxWidth: '1150px', margin: '0 auto', padding: '20px', display: 'flex', gap: '30px' }}>
        <div style={{ flex: '1' }}>
            <form id="checkoutForm" onSubmit={handleSubmit}>
                 <div style={{ display: 'flex', gap: '15px', paddingBottom: '20px', borderBottom: '1px solid #ddd', marginBottom: '20px' }}>
                     <div style={{ fontWeight: 'bold', fontSize: '18px', width: '30px' }}>1</div>
                     <div style={{ flexGrow: 1 }}>
                         <h3 style={{ fontSize: '18px', fontWeight: 'bold', margin: '0 0 10px', color: '#111' }}>Payment method</h3>
                         <div style={{ border: '1px solid #a6a6a6', borderRadius: '4px', overflow: 'hidden' }}>
                             <div style={{ backgroundColor: paymentMethod === 'card' ? '#fcf5ee' : 'white', borderBottom: '1px solid #ddd' }}>
                                 <div
                                    onClick={() => setPaymentMethod('card')}
                                    style={{ padding: '10px 15px', display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}
                                 >
                                     <input type="radio" name="paymentType" value="card" checked={paymentMethod === 'card'} onChange={() => {}} />
                                     <span style={{ fontWeight: 'bold', fontSize: '14px' }}>Credit or debit card</span>
                                     <div style={{ display: 'flex', gap: '5px', marginLeft: 'auto' }}>
                                         <div style={{ width: '30px', height: '20px', backgroundColor: '#eee', border: '1px solid #ccc', borderRadius: '2px' }}></div>
                                         <div style={{ width: '30px', height: '20px', backgroundColor: '#eee', border: '1px solid #ccc', borderRadius: '2px' }}></div>
                                     </div>
                                 </div>

                                 {paymentMethod === 'card' && (
                                     <div style={{ padding: '10px 15px 20px 40px' }}>
                                          <div style={{ marginBottom: '20px', borderBottom: '1px solid #e7e7e7', paddingBottom: '15px' }}>
                                              <h4 style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '10px' }}>Shipping address</h4>
                                              <div style={{ marginBottom: '10px' }}>
                                                 <label style={{ display: 'block', fontWeight: '700', fontSize: '13px', marginBottom: '2px' }}>Full name</label>
                                                 <input
                                                    name="name"
                                                    required
                                                    style={{ width: '300px', padding: '6px', borderRadius: '3px', border: '1px solid #a6a6a6' }}
                                                    onBlur={(e) => validateField('name', e.target.value)}
                                                 />
                                             </div>
                                             <div style={{ marginBottom: '10px' }}>
                                                 <label style={{ display: 'block', fontWeight: '700', fontSize: '13px', marginBottom: '2px' }}>Address</label>
                                                 <input
                                                    name="address"
                                                    required
                                                    placeholder="Street address"
                                                    style={{ width: '400px', padding: '6px', borderRadius: '3px', border: '1px solid #a6a6a6', marginBottom: '5px' }}
                                                    onBlur={(e) => validateField('address', e.target.value)}
                                                 />
                                                 <input name="apartment" placeholder="Apartment, suite, unit, etc. (optional)" style={{ width: '400px', padding: '6px', borderRadius: '3px', border: '1px solid #a6a6a6' }} />
                                             </div>
                                             <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                                                 <div>
                                                    <label style={{ display: 'block', fontWeight: '700', fontSize: '13px', marginBottom: '2px' }}>City</label>
                                                    <input name="city" required style={{ width: '150px', padding: '6px', borderRadius: '3px', border: '1px solid #a6a6a6' }} />
                                                 </div>
                                                 <div>
                                                    <label style={{ display: 'block', fontWeight: '700', fontSize: '13px', marginBottom: '2px' }}>State</label>
                                                    <input name="region" required style={{ width: '100px', padding: '6px', borderRadius: '3px', border: '1px solid #a6a6a6' }} />
                                                 </div>
                                                 <div>
                                                    <label style={{ display: 'block', fontWeight: '700', fontSize: '13px', marginBottom: '2px' }}>Zip Code</label>
                                                    <input name="zip" required style={{ width: '100px', padding: '6px', borderRadius: '3px', border: '1px solid #a6a6a6' }} />
                                                 </div>
                                             </div>
                                          </div>

                                          <h4 style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '10px' }}>Card details</h4>
                                          <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                                              <div style={{ flex: 2 }}>
                                                  <label style={{ display: 'block', fontWeight: '700', fontSize: '12px', marginBottom: '2px' }}>Card number</label>
                                                  <input
                                                    required
                                                    placeholder="0000 0000 0000 0000"
                                                    style={{ width: '100%', padding: '6px', borderRadius: '3px', border: '1px solid #a6a6a6' }}
                                                    onBlur={(e) => validateField('card', e.target.value)}
                                                  />
                                              </div>
                                              <div style={{ flex: 1 }}>
                                                  <label style={{ display: 'block', fontWeight: '700', fontSize: '12px', marginBottom: '2px' }}>Name on card</label>
                                                  <input required style={{ width: '100%', padding: '6px', borderRadius: '3px', border: '1px solid #a6a6a6' }}
                                                         onBlur={(e) => validateField('name_on_card', e.target.value)} />
                                              </div>
                                          </div>
                                          <div style={{ display: 'flex', gap: '10px' }}>
                                              <div>
                                                  <label style={{ display: 'block', fontWeight: '700', fontSize: '12px', marginBottom: '2px' }}>Expiration date</label>
                                                  <input
                                                    required
                                                    placeholder="MM/YY"
                                                    style={{ width: '80px', padding: '6px', borderRadius: '3px', border: '1px solid #a6a6a6' }}
                                                    onBlur={(e) => validateField('expiry', e.target.value)}
                                                  />
                                              </div>
                                               <div>
                                                  <label style={{ display: 'block', fontWeight: '700', fontSize: '12px', marginBottom: '2px' }}>CVV</label>
                                                  <input
                                                    required
                                                    placeholder="123"
                                                    style={{ width: '60px', padding: '6px', borderRadius: '3px', border: '1px solid #a6a6a6' }}
                                                    onBlur={(e) => validateField('cvv', e.target.value)}
                                                  />
                                              </div>
                                          </div>
                                     </div>
                                 )}
                             </div>

                             {/* Option B: GatePal */}
                             <div style={{ backgroundColor: paymentMethod === 'gatepal' ? '#fcf5ee' : 'white' }}>
                                <div
                                    onClick={() => setPaymentMethod('gatepal')}
                                    style={{ padding: '10px 15px', display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}
                                 >
                                     <input type="radio" name="paymentType" value="gatepal" checked={paymentMethod === 'gatepal'} onChange={() => {}} />
                                     <span style={{ fontWeight: 'bold', fontSize: '14px',fontStyle: 'italic', color: '#003087' }}>Gate<span style={{ color: '#009cde' }}>Pal</span></span>
                                 </div>

                                  {paymentMethod === 'gatepal' && (
                                     <div style={{ padding: '10px 15px 20px 40px', fontSize: '13px' }}>
                                          <p style={{ marginBottom: '10px' }}>You will be redirected to GatePal to verify your address and complete your purchase.</p>
                                     </div>
                                 )}
                             </div>

                         </div>
                     </div>
                </div>

                {/* 2. Review Items (Now Step 2) */}
                 <div style={{ display: 'flex', gap: '15px', paddingBottom: '20px', marginBottom: '20px' }}>
                     <div style={{ fontWeight: 'bold', fontSize: '18px', width: '30px' }}>2</div>
                     <div style={{ flexGrow: 1 }}>
                         <h3 style={{ fontSize: '18px', fontWeight: 'bold', margin: '0 0 10px', color: '#111' }}>Review items and shipping</h3>

                         <div style={{ border: '1px solid #ddd', borderRadius: '4px', padding: '15px' }}>
                             <div style={{ marginBottom: '10px' }}>
                                 <h4 style={{ color: '#007600', fontSize: '18px', margin: '0 0 4px' }}>Arriving {deliveryDate}</h4>
                             </div>

                             {lineItems.map(item => (
                                 <div key={item.id} style={{ display: 'flex', gap: '15px', marginBottom: '15px' }}>
                                     <div>
                                         <div style={{ fontWeight: 'bold', fontSize: '13px' }}>{item.name}</div>
                                         <div style={{ fontSize: '13px', color: '#B12704', fontWeight: 'bold' }}>${item.price.toFixed(2)}</div>
                                         <div style={{ fontSize: '12px' }}>Qty: {item.quantity}</div>
                                         <div style={{ fontSize: '12px', color: '#565959' }}>Sold by: RunEver Services LLC</div>
                                     </div>
                                 </div>
                             ))}

                         </div>
                     </div>
                </div>

            </form>
        </div>

        {/* Right Column (Summary) */}
        <div style={{ width: '290px', flexShrink: 0 }}>
            <div style={{ border: '1px solid #ddd', borderRadius: '4px', padding: '20px', position: 'sticky', top: '20px', backgroundColor: '#f3f3f3' }}>

                {paymentMethod === 'card' ? (
                     <button
                        type="submit"
                        form="checkoutForm"
                        style={{
                            width: '100%', height: '36px', padding: '0',
                            background: 'linear-gradient(to bottom,#f7dfa5,#f0c14b)',
                            border: '1px solid', borderColor: '#a88734 #9c7e31 #846a29',
                            borderRadius: '3px', cursor: 'pointer',
                            boxShadow: '0 1px 0 rgba(255,255,255,.4) inset',
                            fontSize: '13px', textShadow: '0 1px 0 rgba(255,255,255,.4)'
                        }}
                    >
                        Place your order
                    </button>
                ) : (
                    <button
                        type="button"
                        onClick={handleGatePalClick}
                        style={{
                            width: '100%', height: '36px', padding: '0',
                            backgroundColor: '#FFC439',
                            border: 'none', borderRadius: '18px',
                            cursor: 'pointer',
                            fontSize: '14px', fontWeight: 'bold', fontStyle: 'italic',
                             color: '#003087', display: 'flex', justifyContent: 'center', alignItems: 'center'
                        }}
                    >
                       <span style={{ marginRight: '2px' }}>Gate</span><span style={{ color: '#009cde' }}>Pal</span>
                    </button>
                )}

                <p style={{ fontSize: '11px', textAlign: 'center', marginTop: '8px', color: '#555', lineHeight: '1.4' }}>
                    By placing your order, you agree to runEverMark's <a href="#">privacy notice</a> and <a href="#">conditions of use</a>.
                </p>
                {/* status message removed */}

                <div style={{ borderTop: '1px solid #ddd', margin: '15px 0' }}></div>

                <h3 style={{ fontSize: '18px', fontWeight: 'bold', margin: '0 0 10px' }}>Order Summary</h3>

                <div style={{ fontSize: '13px', lineHeight: '1.8' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Items ({cart.reduce((a, b) => a + b.quantity, 0)}):</span>
                        <span>${itemsTotal.toFixed(2)}</span>
                    </div>
                     <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Shipping & handling:</span>
                        <span>${shipping.toFixed(2)}</span>
                    </div>
                     <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Total before tax:</span>
                        <span>${(itemsTotal + shipping).toFixed(2)}</span>
                    </div>
                     <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Estimated tax:</span>
                        <span>${tax.toFixed(2)}</span>
                    </div>

                    <div style={{ borderTop: '1px solid #ccc', margin: '10px 0' }}></div>

                     <div style={{ display: 'flex', justifyContent: 'space-between', color: '#B12704', fontSize: '18px', fontWeight: 'bold' }}>
                        <span>Order Total:</span>
                        <span>${total.toFixed(2)}</span>
                    </div>
                </div>

                 <div style={{ borderTop: '1px solid #ccc', margin: '15px 0' }}></div>

                  <div style={{ backgroundColor: '#f0f2f2', padding: '10px', fontSize: '13px' }}>
                    <a href="#" style={{ color: '#0066c0', textDecoration: 'none' }}>How are shipping costs calculated?</a>
                </div>

            </div>
        </div>

      </div>
    </div>
  );
}
