import { useState, useMemo, useEffect } from 'react';
import ReactSlider from 'react-slider';
import { Star, StarHalf, Check, Trash2, Plus, Minus, X } from 'lucide-react';
import EcommHeader from '../components/EcommHeader';
import { productCatalog, productCategories, type Product } from '../data/products';
import { readSession, writeSession, setBenchmarkResult } from '../utils/session';

const CART_KEY = 'runEverMark_ecomm_cart';
const sellingProducts = productCatalog.filter(p=>p.price<200); // avoid slider too long
const prices = sellingProducts.map((product) => product.price);
const PRICE_MIN = Math.min(...prices);
const PRICE_MAX = Math.max(...prices);

const categoryImageLists: Record<string, string[]> = {
  Home: [
    'home_product_1.png', 'home_product_2.png', 'home_product_3.png', 'home_product_4.png'
  ],
  Garden: [
    'garden_product_1.png', 'garden_product_2.png', 'garden_product_3.png', 'garden_product_4.png'
  ],
  Tech: [
    'tech_product_1.png', 'tech_product_2.png', 'tech_product_3.png', 'tech_product_4.png'
  ],
  Travel: [
    'travel_product_1.png', 'travel_product_2.png', 'travel_product_3.png', 'travel_product_4.png'
  ],
  Wellness: [
    'wellness_product_1.png', 'wellness_product_2.png', 'wellness_product_3.png', 'wellness_product_4.png'
  ]
};
categoryImageLists['Office'] = categoryImageLists['Tech'];

function getProductImage(category: string, id: string): string {
  const images = categoryImageLists[category] || categoryImageLists['Tech'];
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % images.length;
  return `img/${images[index]}`;
}

type CartItem = {
  id: string;
  quantity: number;
};

function readCart() {
  return readSession<CartItem[]>(CART_KEY, []);
}

function writeCart(items: CartItem[]) {
  writeSession(CART_KEY, items);
}


export default function EcommerceProductsPage({
  entryPoint,
  targetProductId
}: {
  entryPoint?: string;
  targetProductId?: string;
}) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState('name');
  const [category, setCategory] = useState('all');
  const [priceRange, setPriceRange] = useState<[number, number]>([PRICE_MIN, PRICE_MAX]);
  const [cart, setCart] = useState<CartItem[]>(readCart);
  const [isCartOpen, setIsCartOpen] = useState(false);

  // 1. Filter first
  const filteredData = useMemo(() => {
    const query = search.toLowerCase();
    // Safety copy of catalog to prevent any mutation issues, though unlikely
    return [...sellingProducts].filter((product) => {
      // Category Filter
      if (category !== 'all' && product.category !== category) return false;
      // Price Filter
      if (product.price < priceRange[0] || product.price > priceRange[1]) return false;
      // Search Filter
      if (query && !product.name.toLowerCase().includes(query)) return false;
      return true;
    });
  }, [search, category, priceRange]);

  // 2. Sort second
  const filtered = useMemo(() => {
    // Sort the filtered list
    return [...filteredData].sort((a, b) => {
      if (sortKey === 'price') return a.price - b.price;
      if (sortKey === 'rating') return b.rating - a.rating;
      // Default / Featured (Name)
      return a.name.localeCompare(b.name);
    });
  }, [filteredData, sortKey]);

  // Determine target product for PRO scenario (Best rated under $80)
  const proTargetProduct = useMemo(() => {
    if (entryPoint !== '#/ecomm/pro') return null;
    const candidates = sellingProducts.filter(p => p.category === 'Tech' && p.price < 80);
    // Sort by rating desc, then price asc
    const p = candidates.sort((a, b) => b.rating - a.rating || a.price - b.price)[0];
    p.rating = 5;
    p.reviewCount = 3123;
    return p;
  }, [entryPoint]);

  const addToCart = (product: Product) => {
    setCart((current) => {
      const existing = current.find((item) => item.id === product.id);
      let next;
      if (existing) {
        next = current.map((item) =>
          item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      } else {
        next = [...current, { id: product.id, quantity: 1 }];
      }
      writeCart(next);
      return next;
    });

    // Verification Logic
    if (entryPoint) {
       // Basic Scenario
       if (targetProductId && product.id === targetProductId) {
           setBenchmarkResult(entryPoint, 'click_target_product', true);
       }
       // Pro Scenario
       if (entryPoint === '#/ecomm/pro' && proTargetProduct && product.id === proTargetProduct.id) {
           setBenchmarkResult(entryPoint, 'click_target_product', true);
       }
       // Track any product click as general activity
       setBenchmarkResult(entryPoint, 'click_any_product', true);
    }
    setIsCartOpen(true);
  };

  // Track filter usage for PRO scenario
  useEffect(() => {
    if (entryPoint === '#/ecomm/pro') {
      setBenchmarkResult(entryPoint, 'filter_category', category === 'Tech');
        setBenchmarkResult(entryPoint, 'filter_price', priceRange[1] === 80);
    }
  }, [priceRange, entryPoint, category]);

  const updateQuantity = (id: string, delta: number) => {
    setCart((current) => {
      const next = current.map(item => {
        if (item.id === id) {
          return { ...item, quantity: Math.max(0, item.quantity + delta) };
        }
        return item;
      }).filter(item => item.quantity > 0);
      writeCart(next);
      return next;
    });
  };

  const removeFromCart = (id: string) => {
      setCart((current) => {
        const next = current.filter(item => item.id !== id);
        writeCart(next);
        return next;
      });
  };

  const cartSubtotal = useMemo(() => {
      return cart.reduce((total, item) => {
          const product = sellingProducts.find(p => p.id === item.id);
          return total + (product ? product.price * item.quantity : 0);
      }, 0);
  }, [cart]);

  // Resolve cart items for display
  const cartItemsDisplay = useMemo(() => {
      return cart.map(item => {
          const product = sellingProducts.find(p => p.id === item.id);
          return product ? { ...product, quantity: item.quantity } : null;
      }).filter(Boolean) as (Product & { quantity: number })[];
  }, [cart]);

  const cartTotalCount = useMemo(() => {
      return cart.reduce((total, item) => total + item.quantity, 0);
  }, [cart]);

  return (
    <div style={{ backgroundColor: '#E3E6E6', minHeight: '100vh', fontFamily: 'Arial, sans-serif' }}>
      <EcommHeader searchValue={search} onSearchChange={setSearch} onCartClick={() => setIsCartOpen(prev => !prev)} cartCount={cartTotalCount} />

      <div style={{ maxWidth: '1800px', margin: '0 auto', padding: '10px 20px', display: 'flex', gap: '20px' }}>

        {/* Sidebar Filters */}
        <aside style={{ width: '260px', flexShrink: 0, paddingRight: '20px', borderRight: '1px solid #ddd' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '10px' }}>Department</h3>
            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 20px 0', fontSize: '13px' }}>
                <li style={{ marginBottom: '6px' }}>
                    <button onClick={() => setCategory('all')} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontWeight: category === 'all' ? 'bold' : 'normal', color: category === 'all' ? '#C7511F' : '#0F1111' }}>Any Department</button>
                    {productCategories.map((cat) => (
                         <div key={cat} style={{ marginLeft: '10px', marginTop: '4px' }}>
                            <button onClick={() => setCategory(cat)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: category === cat ? '#C7511F' : '#0F1111', fontWeight: category === cat ? 'bold' : 'normal' }}>{cat}</button>
                         </div>
                    ))}
                </li>
            </ul>

            <h3 style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '10px' }}>Price</h3>
            <div style={{ padding: '0 10px 20px 0' }}>
                 <ReactSlider
                    className="price-slider"
                    thumbClassName="price-thumb"
                    trackClassName="price-track"
                    min={PRICE_MIN}
                    max={PRICE_MAX}
                    step={1}
                    value={priceRange}
                    ariaLabel={['Minimum price', 'Maximum price']}
                    onChange={(value: any) => setPriceRange(value as [number, number])}
                    minDistance={5}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginTop: '8px', color: '#0F1111' }}>
                    <span>${priceRange[0]}</span>
                    <span>${priceRange[1]}</span>
                </div>
            </div>

            {/*<h3 style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '10px' }}>Customer Review</h3>*/}
            {/* <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '13px' }}>*/}
            {/*     {[4, 3, 2, 1].map(stars => (*/}
            {/*         <div key={stars} style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}>*/}
            {/*             <div style={{ display: 'flex', color: '#FFA41C' }}>*/}
            {/*                 {Array.from({length: 5}).map((_, i) => (*/}
            {/*                     <Star key={i} size={14} fill={i < stars ? "currentColor" : "none"} color={i < stars ? "#DE7921" : "#DE7921"} strokeWidth={i < stars ? 0 : 1} />*/}
            {/*                 ))}*/}
            {/*             </div>*/}
            {/*             <span>& Up</span>*/}
            {/*         </div>*/}
            {/*     ))}*/}
            {/* </div>*/}
        </aside>

        {/* Main Content */}
        <main style={{ flexGrow: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', padding: '10px', backgroundColor: 'white', border: '1px solid #ddd', borderRadius: '4px' }}>
                 <span style={{ fontSize: '14px', fontWeight: 'bold' }}>
                    1-{Math.min(filtered.length, 4)} of over {filtered.length} results for <span style={{ color: '#C7511F' }}>"{category === 'all' ? 'All' : category}"</span>
                 </span>
                 <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <select
                        value={sortKey}
                        onChange={(e) => setSortKey(e.target.value)}
                        style={{ padding: '4px', fontSize: '12px', borderRadius: '4px', border: '1px solid #ddd', backgroundColor: '#F0F2F2', cursor: 'pointer' }}
                    >
                        <option value="name">Sort by: Featured</option>
                        <option value="price">Price: Low to High</option>
                        <option value="rating">Avg. Customer Review</option>
                    </select>
                 </div>
            </div>

            <div className="grid products" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '12px', alignItems: 'start' }}>
            {(() => {
              const displayedProducts = filtered.slice(0, 5);
              return (
                <>
                  {displayedProducts.map((product) => {
                    const fullStars = Math.floor(product.rating);
                    const hasHalfStar = product.rating % 1 >= 0.5;

                    return (
                      <div className="card" key={product.id} style={{ backgroundColor: 'white', border: '1px solid #e7e7e7', borderRadius: '0', display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
                        <div style={{ position: 'relative', backgroundColor: '#F7F7F7', padding: '20px', display: 'flex', justifyContent: 'center', alignItems: 'center', height: '220px' }}>
                          <img
                            className="product-image"
                            src={getProductImage(product.category, product.id)}
                            alt={product.name}
                            loading="lazy"
                            style={{ maxHeight: '180px', maxWidth: '100%', objectFit: 'contain', mixBlendMode: 'multiply' }}
                          />
                          {product.isBestSeller && (
                            <div style={{ position: 'absolute', top: 0, left: 0, backgroundColor: '#C40000', color: 'white', padding: '4px 8px', fontSize: '11px', fontWeight: 'bold', borderBottomRightRadius: '4px' }}>Best Seller</div>
                          )}
                        </div>

                        <div className="card-content" style={{ padding: '12px', display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
                          <div className="card-title">
                            <h4 style={{ fontSize: '16px', lineHeight: '1.4', fontWeight: 'normal', color: '#0F1111', margin: '0 0 4px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{product.name}</h4>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '8px' }}>
                            <div style={{ display: 'flex', color: '#FFA41C' }}>
                              {Array.from({ length: 5 }).map((_, i) => {
                                  if (i < fullStars) return <Star key={i} size={16} fill="currentColor" strokeWidth={0} />;
                                  if (i === fullStars && hasHalfStar) return <StarHalf key={i} size={16} fill="currentColor" strokeWidth={0} />;
                                  return <Star key={i} size={16} color="#DE7921" strokeWidth={1} />;
                              })}
                            </div>
                            <span style={{ fontSize: '12px', color: '#007185' }}>{product.reviewCount.toLocaleString()}</span>
                          </div>

                          <div style={{ marginBottom: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'baseline' }}>
                                <span style={{ fontSize: '13px', position: 'relative', top: '-0.3em' }}>$</span>
                                <span style={{ fontSize: '21px', fontWeight: '500', color: '#0F1111' }}>{Math.floor(product.price)}</span>
                                <span style={{ fontSize: '13px', position: 'relative', top: '-0.3em' }}>{(product.price % 1).toFixed(2).substring(1)}</span>
                            </div>
                            {product.originalPrice && (
                                <div style={{ fontSize: '12px', color: '#565959' }}>List: <span style={{ textDecoration: 'line-through' }}>${product.originalPrice.toFixed(2)}</span></div>
                            )}
                          </div>

                          <div style={{ fontSize: '12px', color: '#0F1111', marginBottom: '16px', flexGrow: 1 }}>
                             {product.isPrime && (
                                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '4px', color: '#007185', fontWeight: 'bold' }}>
                                    <Check size={12} strokeWidth={4} color="#F90" />
                                    <span style={{ marginLeft: '4px', fontStyle: 'italic' }}>prime</span>
                                </div>
                             )}
                             <div>Delivery <span style={{ fontWeight: 'bold' }}>{product.deliveryDate}</span></div>
                          </div>

                          <button className="button" onClick={() => addToCart(product)} style={{ backgroundColor: '#FFD814', borderColor: '#FCD200', color: '#0F1111', borderRadius: '20px', width: '100%', fontWeight: '400', fontSize: '13px', height: '29px', lineHeight: '29px', padding: '0', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', marginTop: 'auto' }}>Add to basket</button>
                        </div>
                      </div>
                    );
                  })}
                  <div style={{ gridColumn: '1 / -1', marginTop: '20px', textAlign: 'center', color: '#565959', fontSize: '14px', paddingBottom: '20px' }}>
                      Showing {displayedProducts.length} of {filtered.length} products
                  </div>
                </>
              );
            })()}
          </div>
        </main>
      </div>

       {/* Sliding Cart Panel */}
       {isCartOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 1000, display: 'flex', justifyContent: 'flex-end' }}>
            {/* Backdrop */}
            <div
                style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.5)' }}
                onClick={() => setIsCartOpen(false)}
            ></div>

            {/* Panel */}
            <div style={{
                position: 'relative', width: '300px', backgroundColor: 'white', height: '100%',
                boxShadow: '-4px 0 8px rgba(0,0,0,0.1)', overflowY: 'auto'
            }}>
                {/* Header */}
                <div style={{ padding: '20px', borderBottom: '1px solid #ddd', backgroundColor: '#f3f3f3' }}>
                    <div style={{ textAlign: 'center', marginBottom: '10px' }}>
                        <h3>Basket</h3>
                        <div style={{ fontSize: '14px', fontWeight: 'bold' }}>Subtotal</div>
                        <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#B12704' }}>${cartSubtotal.toFixed(2)}</div>
                    </div>
                    <button
                         onClick={() => {
                             if (entryPoint === '#/ecomm/basic') {
                                 window.location.hash = '#/ecomm/checkout/basic';
                             } else if (entryPoint === '#/ecomm/pro') {
                                 window.location.hash = '#/ecomm/checkout/pro';
                             } else {
                                 window.location.hash = '#/ecomm/checkout';
                             }
                         }}
                         style={{
                             width: '100%', height: '32px', borderRadius: '20px', border: '1px solid #dcdcdc',
                             backgroundColor: 'white', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold',
                             boxShadow: '0 2px 5px rgba(213,217,217,.5)'
                         }}
                    >
                        Proceed to checkout
                    </button>
                    <button
                        onClick={() => setIsCartOpen(false)}
                        style={{ position: 'absolute', top: '10px', left: '10px', background: 'none', border: 'none', cursor: 'pointer' }}
                    >
                        <X size={20} color="#333" />
                    </button>
                </div>

                {/* Items */}
                <div style={{ padding: '20px' }}>
                    {cartItemsDisplay.map(item => (
                        <div key={item.id} style={{ display: 'flex', gap: '10px', marginBottom: '20px', borderBottom: '1px solid #eee', paddingBottom: '20px' }}>
                            <div style={{ width: '60px', height: '60px', flexShrink: 0 }}>
                                <img
                                    src={getProductImage(item.category, item.id)}
                                    alt={item.name}
                                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                                />
                            </div>
                            <div style={{ flexGrow: 1 }}>
                                <div style={{ fontSize: '13px', fontWeight: 'bold', marginBottom: '4px', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', maxWidth: '170px' }}>{item.name}</div>
                                <div style={{ fontWeight: 'bold', fontSize: '15px', color: '#111', marginBottom: '8px' }}>${item.price.toFixed(2)}</div>

                                {/* Quantity Control Pill */}
                                <div style={{
                                    display: 'inline-flex', alignItems: 'center',
                                    border: '1px solid #FFD814', borderRadius: '8px',
                                    backgroundColor: 'white', height: '30px', boxShadow: '0 2px 5px rgba(213,217,217,.5)'
                                }}>
                                    <button
                                        onClick={() => item.quantity === 1 ? removeFromCart(item.id) : updateQuantity(item.id, -1)}
                                        style={{ background: 'none', border: 'none', padding: '0 10px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                                    >
                                        {item.quantity === 1 ? <Trash2 size={14} /> : <Minus size={14} />}
                                    </button>
                                    <span style={{ fontSize: '13px', fontWeight: 'bold', padding: '0 5px' }}>{item.quantity}</span>
                                    <button
                                        onClick={() => updateQuantity(item.id, 1)}
                                        style={{ background: 'none', border: 'none', padding: '0 10px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                                    >
                                        <Plus size={14} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                    {cartItemsDisplay.length === 0 && (
                        <div style={{ textAlign: 'center', color: '#555', marginTop: '20px' }}>
                            Your basket is empty.
                        </div>
                    )}
                </div>
            </div>
        </div>
       )}

    </div>
  );
}
