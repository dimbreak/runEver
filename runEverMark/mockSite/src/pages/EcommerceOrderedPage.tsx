import { Check } from 'lucide-react';
import EcommHeader from '../components/EcommHeader';
import { readSession } from '../utils/session';

export default function EcommerceOrderedPage() {
  const order = readSession<any>('runEverMark_ecomm_order', null);

  // Generate a random-looking order number if one exists
  const orderId = order ? `114-${Math.floor(1000000 + Math.random() * 9000000)}-${Math.floor(1000000 + Math.random() * 9000000)}` : '';

  return (
    <div style={{ backgroundColor: 'white', minHeight: '100vh', fontFamily: 'Arial, sans-serif' }}>
      <EcommHeader />

      <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '14px 18px' }}>

        {order ? (
          <div>
             {/* Success Message */}
             <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                <Check size={24} color="#007600" strokeWidth={3} />
                <h2 style={{ color: '#007600', fontWeight: '400', fontSize: '24px', margin: '0' }}>Order placed, thanks!</h2>
             </div>

             <div style={{ fontSize: '13px', color: '#111', lineHeight: '1.5', marginBottom: '20px' }}>
                 Confirmation #{orderId}
             </div>

             <div style={{ display: 'flex', gap: '30px', alignItems: 'flex-start' }}>

                 {/* Main Column */}
                 <div style={{ flex: 1 }}>
                     <p style={{ fontSize: '13px' }}>
                        Hello {order.name},
                     </p>
                     <p style={{ fontSize: '13px' }}>
                         We've received your order and will send you an email when it ships.
                     </p>

                     <div style={{ marginTop: '20px', border: '1px solid #ddd', borderRadius: '4px', padding: '18px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                             <div>
                                 <h3 style={{ margin: '0 0 4px', color: '#C40000', fontSize: '17px' }}>Arriving {order.deliveryDate}</h3>
                                 <div style={{ fontSize: '13px' }}>Fastest Delivery: Tomorrow</div>
                             </div>
                             <div>
                                 <button style={{
                                     background: 'linear-gradient(to bottom,#f7fafa,#f0f2f2)',
                                     border: '1px solid', borderColor: '#adb1b8 #a2a6ac #8d9096',
                                     borderRadius: '3px', padding: '4px 10px', fontSize: '11px', cursor: 'pointer'
                                 }}>
                                    Track package
                                 </button>
                             </div>
                        </div>

                        <div style={{ display: 'flex', gap: '15px' }}>
                            {order.items?.slice(0, 3).map((item: any) => (
                                <div key={item.id} style={{ fontSize: '13px' }}>
                                    {/* Placeholder Image Box */}
                                    <div style={{ width: '80px', height: '80px', backgroundColor: '#F7F7F7', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '4px', border: '1px solid #eee' }}>
                                        <span style={{ fontSize: '10px', color: '#999' }}>Img</span>
                                    </div>
                                </div>
                            ))}
                            {/* If more than 3 items... */}
                            {order.items?.length > 3 && (
                                <div style={{ display: 'flex', alignItems: 'center', fontSize: '20px', color: '#555' }}>+ {order.items.length - 3} more</div>
                            )}
                        </div>

                     </div>

                     <div style={{ marginTop: '20px' }}>
                        <a href="#/ecomm/products" style={{ color: '#0066c0', fontSize: '13px', textDecoration: 'none' }}>Review or edit your recent orders</a>
                     </div>

                 </div>

                 {/* Right Sidebar */}
                 <div style={{ width: '280px', borderRadius: '4px', border: '1px solid #ddd', padding: '15px', backgroundColor: '#f3f3f3' }}>
                     <h3 style={{ fontSize: '13px', margin: '0 0 10px' }}>Purchase Summary</h3>
                     <div style={{ fontSize: '12px', display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                         <span>Order Total:</span>
                         <span style={{ fontWeight: 'bold' }}>${order.total?.toFixed(2)}</span>
                     </div>
                     <div style={{ fontSize: '12px', display: 'flex', justifyContent: 'space-between', marginBottom: '15px' }}>
                         <span>Shipping to:</span>
                         <span style={{ fontWeight: 'bold' }}>{order.city}, {order.region}</span>
                     </div>
                     <div>
                         <button
                            onClick={() => window.location.hash = '#/ecomm/products'}
                            style={{
                                width: '100%', height: '29px', padding: '0',
                                background: 'linear-gradient(to bottom,#f7dfa5,#f0c14b)',
                                border: '1px solid', borderColor: '#a88734 #9c7e31 #846a29',
                                borderRadius: '3px', cursor: 'pointer',
                                boxShadow: '0 1px 0 rgba(255,255,255,.4) inset',
                                fontSize: '13px', textShadow: '0 1px 0 rgba(255,255,255,.4)'
                            }}
                         >
                            Continue Shopping
                         </button>
                     </div>
                 </div>

             </div>

             {/* Recommendations Section */}
             <div style={{ marginTop: '30px', borderTop: '1px solid #ddd', paddingTop: '20px' }}>
                 <h3 style={{ fontSize: '20px', margin: '0 0 15px', fontWeight: 'bold' }}>Buy it again</h3>
                 <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '15px' }}>
                     {[1, 2, 3, 4].map(i => (
                         <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                             <div style={{ height: '150px', backgroundColor: '#F7F7F7', border: '1px solid #eee' }}></div>
                             <div style={{ fontSize: '13px', color: '#0066c0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Suggested Product {i}</div>
                             <div style={{ color: '#B12704', fontSize: '13px', fontWeight: 'bold' }}>$19.99</div>
                             <button style={{
                                 width: '100%', padding: '3px',
                                 background: '#fff', border: '1px solid #d5d9d9', borderRadius: '3px',
                                 fontSize: '11px', cursor: 'pointer', boxShadow: '0 2px 5px rgba(213,217,217,.5)'
                             }}>Add to Cart</button>
                         </div>
                     ))}
                 </div>
             </div>

          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '40px' }}>
              <h2 style={{ fontWeight: '400' }}>No order found</h2>
              <p>Your session may have expired.</p>
              <button
                onClick={() => window.location.hash = '#/ecomm/products'}
                style={{
                    backgroundColor: '#FFD814', border: '1px solid #FCD200', borderRadius: '20px',
                    padding: '8px 20px', cursor: 'pointer', fontSize: '13px'
                }}
              >
                  Return to Homepage
              </button>
          </div>
        )}

      </div>
    </div>
  );
}
