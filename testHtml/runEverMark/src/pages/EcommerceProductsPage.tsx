import { useMemo, useState } from 'react';
import ReactSlider from 'react-slider';
import { Star, StarHalf, Check, Truck, ShoppingCart, Heart } from 'lucide-react';
import EcommHeader from '../components/EcommHeader';
import { productCatalog, productCategories, type Product } from '../data/products';
import { readSession, writeSession } from '../utils/session';

const CART_KEY = 'runEverMark_ecomm_cart';
const prices = productCatalog.map((product) => product.price);
const PRICE_MIN = Math.min(...prices);
const PRICE_MAX = Math.max(...prices);
const categoryImageLists: Record<string, string[]> = {
  Home: [
    'home_product_1.png',
    'home_product_2.png',
    'home_product_3.png',
    'home_product_4.png'
  ],
  Garden: [
    'garden_product_1.png',
    'garden_product_2.png',
    'garden_product_3.png',
    'garden_product_4.png'
  ],
  Tech: [
    'tech_product_1.png',
    'tech_product_2.png',
    'tech_product_3.png',
    'tech_product_4.png'
  ],
  Travel: [
    'travel_product_1.png',
    'travel_product_2.png',
    'travel_product_3.png',
    'travel_product_4.png'
  ],
  Wellness: [
    'wellness_product_1.png',
    'wellness_product_2.png',
    'wellness_product_3.png',
    'wellness_product_4.png'
  ]
};

// Map Office to Tech since we don't have Office images
categoryImageLists['Office'] = categoryImageLists['Tech'];

function getProductImage(category: string, id: string): string {
  const images = categoryImageLists[category] || categoryImageLists['Tech'];
  // Simple deterministic hash from the string id
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % images.length;
  return `/img/${images[index]}`;
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

export default function EcommerceProductsPage() {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState('name');
  const [category, setCategory] = useState('all');
  const [priceRange, setPriceRange] = useState<[number, number]>([
    PRICE_MIN,
    PRICE_MAX
  ]);
  const [showFilters, setShowFilters] = useState(false);
  const [cart, setCart] = useState<CartItem[]>(readCart);

  const filtered = useMemo(() => {
    const query = search.toLowerCase();

    const data = productCatalog.filter((product) => {
      if (category !== 'all' && product.category !== category) {
        return false;
      }
      if (product.price < priceRange[0] || product.price > priceRange[1]) {
        return false;
      }
      if (query && !product.name.toLowerCase().includes(query)) {
        return false;
      }
      return true;
    });

    const sorted = [...data].sort((a, b) => {
      if (sortKey === 'price') {
        return a.price - b.price;
      }
      if (sortKey === 'rating') {
        return b.rating - a.rating;
      }
      return a.name.localeCompare(b.name);
    });

    return sorted;
  }, [search, sortKey, category, priceRange]);

  const addToCart = (product: Product) => {
    setCart((current) => {
      const existing = current.find((item) => item.id === product.id);
      if (existing) {
        const next = current.map((item) =>
          item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
        writeCart(next);
        return next;
      }
      const next = [...current, { id: product.id, quantity: 1 }];
      writeCart(next);
      return next;
    });
  };

  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div style={{ backgroundColor: '#E3E6E6', minHeight: '100vh', fontFamily: 'Arial, sans-serif' }}>
      <EcommHeader searchValue={search} onSearchChange={setSearch} />

      <div style={{ maxWidth: '1800px', margin: '0 auto', padding: '10px 20px', display: 'flex', gap: '20px' }}>

        {/* Sidebar Filters */}
        <aside style={{ width: '260px', flexShrink: 0, paddingRight: '20px', borderRight: '1px solid #ddd' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '10px' }}>Department</h3>
            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 20px 0', fontSize: '13px' }}>
                <li style={{ marginBottom: '6px' }}>
                    <button
                        onClick={() => setCategory('all')}
                        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontWeight: category === 'all' ? 'bold' : 'normal', color: category === 'all' ? '#C7511F' : '#0F1111' }}
                    >
                        Any Department
                    </button>
                    {productCategories.map((cat) => (
                         <div key={cat} style={{ marginLeft: '10px', marginTop: '4px' }}>
                            <button
                                onClick={() => setCategory(cat)}
                                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: category === cat ? '#C7511F' : '#0F1111', fontWeight: category === cat ? 'bold' : 'normal' }}
                            >
                                {cat}
                            </button>
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
                    onChange={(value) => setPriceRange(value as [number, number])}
                    minDistance={5}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginTop: '8px', color: '#0F1111' }}>
                    <span>${priceRange[0]}</span>
                    <span>${priceRange[1]}</span>
                </div>
            </div>

             <h3 style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '10px' }}>Customer Review</h3>
             <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '13px' }}>
                 {[4, 3, 2, 1].map(stars => (
                     <div key={stars} style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}>
                         <div style={{ display: 'flex', color: '#FFA41C' }}>
                             {Array.from({length: 5}).map((_, i) => (
                                 <Star key={i} size={14} fill={i < stars ? "currentColor" : "none"} color={i < stars ? "#DE7921" : "#DE7921"} strokeWidth={i < stars ? 0 : 1} />
                             ))}
                         </div>
                         <span>& Up</span>
                     </div>
                 ))}
             </div>
        </aside>

        {/* Main Content */}
        <main style={{ flexGrow: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', padding: '10px', backgroundColor: 'white', border: '1px solid #ddd', borderRadius: '4px' }}>
                 <span style={{ fontSize: '14px', fontWeight: 'bold' }}>
                    1-{Math.min(filtered.length, 24)} of over {filtered.length} results for <span style={{ color: '#C7511F' }}>"{category === 'all' ? 'All' : category}"</span>
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
            {filtered.map((product) => {
               // Helper to render stars
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
                    <div style={{
                        position: 'absolute', top: 0, left: 0,
                        backgroundColor: '#C40000', color: 'white',
                        padding: '4px 8px', fontSize: '11px', fontWeight: 'bold',
                        borderBottomRightRadius: '4px'
                    }}>
                      Best Seller
                    </div>
                  )}
                </div>

                <div className="card-content" style={{ padding: '12px', display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
                  <div className="card-title">
                    <h4 style={{
                        fontSize: '16px', lineHeight: '1.4', fontWeight: 'normal',
                        color: '#0F1111', margin: '0 0 4px',
                        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden'
                     }}>
                      {product.name}
                    </h4>
                  </div>

                  {/* Rating */}
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

                  {/* Price */}
                  <div style={{ marginBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline' }}>
                        <span style={{ fontSize: '13px', position: 'relative', top: '-0.3em' }}>$</span>
                        <span style={{ fontSize: '21px', fontWeight: '500', color: '#0F1111' }}>{Math.floor(product.price)}</span>
                        <span style={{ fontSize: '13px', position: 'relative', top: '-0.3em' }}>{(product.price % 1).toFixed(2).substring(1)}</span>
                    </div>
                    {product.originalPrice && (
                        <div style={{ fontSize: '12px', color: '#565959' }}>
                            List: <span style={{ textDecoration: 'line-through' }}>${product.originalPrice.toFixed(2)}</span>
                        </div>
                    )}
                  </div>

                  {/* Delivery Info */}
                  <div style={{ fontSize: '12px', color: '#0F1111', marginBottom: '16px', flexGrow: 1 }}>
                     {product.isPrime && (
                        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '4px', color: '#007185', fontWeight: 'bold' }}>
                            <Check size={12} strokeWidth={4} color="#F90" />
                            <span style={{ marginLeft: '4px', fontStyle: 'italic' }}>prime</span>
                        </div>
                     )}
                     <div>
                        Delivery <span style={{ fontWeight: 'bold' }}>{product.deliveryDate}</span>
                     </div>
                  </div>

                  <button
                    className="button"
                    onClick={() => addToCart(product)}
                    style={{
                        backgroundColor: '#FFD814', borderColor: '#FCD200', color: '#0F1111', borderRadius: '20px',
                        width: '100%', fontWeight: '400', fontSize: '13px', height: '29px', lineHeight: '29px',
                        padding: '0', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                        marginTop: 'auto'
                    }}
                  >
                   Add to cart
                  </button>
                </div>
              </div>
            )})}
          </div>
        </main>
      </div>
    </div>
  );
}
