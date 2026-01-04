import { useMemo, useState } from 'react';
import ReactSlider from 'react-slider';
import EcommHeader from '../components/EcommHeader';
import { productCatalog, productCategories, type Product } from '../data/products';
import { readSession, writeSession } from '../utils/session';

const CART_KEY = 'runEverMark_ecomm_cart';
const prices = productCatalog.map((product) => product.price);
const PRICE_MIN = Math.min(...prices);
const PRICE_MAX = Math.max(...prices);
const categoryImages: Record<string, string> = {
  Home: '/img/home.avif',
  Garden: '/img/garden.avif',
  Tech: '/img/tech.avif',
  Travel: '/img/travel.avif',
  Office: '/img/office.avif',
  Wellness: '/img/wellness.avif'
};

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
    <section className="panel">
      <EcommHeader />
      <div className="toolbar">
        <label>
          Search
          <input value={search} onChange={(event) => setSearch(event.target.value)} />
        </label>
        <button
          className="button ghost"
          type="button"
          onClick={() => setShowFilters((current) => !current)}
        >
          Filters
        </button>
        {showFilters && (
          <div className="popover">
            <div className="popover-header">
              <h4>Filter products</h4>
              <button
                className="button ghost"
                type="button"
                onClick={() => setShowFilters(false)}
              >
                Close
              </button>
            </div>
            <label>
              Category
              <select value={category} onChange={(event) => setCategory(event.target.value)}>
                <option value="all">All</option>
                {productCategories.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Sort
              <select value={sortKey} onChange={(event) => setSortKey(event.target.value)}>
                <option value="name">Name</option>
                <option value="price">Price</option>
                <option value="rating">Rating</option>
              </select>
            </label>
            <div className="slider-group">
              <span className="muted">
                Price range: ${priceRange[0].toFixed(0)} - ${priceRange[1].toFixed(0)}
              </span>
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
                pearling
              />
            </div>
            <button
              className="button ghost"
              type="button"
              onClick={() => {
                setCategory('all');
                setSortKey('name');
                setPriceRange([PRICE_MIN, PRICE_MAX]);
              }}
            >
              Reset filters
            </button>
          </div>
        )}
      </div>

      <div className="inline-info">
        <span>{filtered.length} products</span>
        <span className="badge">Cart: {totalItems} items</span>
      </div>

      <div className="grid products">
        {filtered.map((product) => (
          <div className="card" key={product.id}>
            <img
              className="product-image"
              src={categoryImages[product.category]}
              alt={product.name}
              loading="lazy"
            />
            <div className="card-title">
              <h4>{product.name}</h4>
              <span className="badge">{product.category}</span>
            </div>
            <p className="muted">Rating {product.rating} · Stock {product.stock}</p>
            <p className="price">${product.price.toFixed(2)}</p>
            <button className="button" onClick={() => addToCart(product)}>
              Add to cart
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
