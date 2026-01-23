import { useState } from 'react';
import { Search, ShoppingCart, MapPin, Menu } from 'lucide-react';

interface Props {
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  onCartClick?: () => void;
  cartCount?: number;
}

export default function EcommHeader({ searchValue, onSearchChange, onCartClick, cartCount = 0 }: Props) {
  const [localSearch, setLocalSearch] = useState(searchValue || '');

  const handleSearch = () => {
    onSearchChange?.(localSearch);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  return (
    <header style={{ backgroundColor: '#131921', color: 'white', padding: '0', fontFamily: 'Arial, sans-serif' }}>
      {/* Top Bar */}
      <div style={{ display: 'flex', alignItems: 'center', height: '60px', padding: '0 10px', gap: '20px' }}>

        {/* Logo Area */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '5px 10px', border: '1px solid transparent', cursor: 'pointer' }}>
           <span style={{ fontSize: '24px', fontWeight: 'bold', letterSpacing: '-1px' }}>Ra<span style={{ color: '#ff9900' }}>mazon</span></span>
        </div>

        {/* Location (Dummy) */}
        <div style={{ display: 'flex', alignItems: 'center', fontSize: '12px', padding: '5px 10px', cursor: 'pointer' }}>
            <MapPin size={18} color="white" style={{ marginRight: '2px' }} />
            <div style={{ lineHeight: '1.2' }}>
                <div style={{ color: '#ccc' }}>Deliver to</div>
                <div style={{ fontWeight: 'bold' }}>New York 10001</div>
            </div>
        </div>

        {/* Search Bar */}
        <div style={{ flexGrow: 1, display: 'flex', height: '40px', borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{ backgroundColor: '#f3f3f3', color: '#555', padding: '0 10px', fontSize: '12px', display: 'flex', alignItems: 'center',borderRight: '1px solid #ddd', cursor: 'pointer' }}>
                All <span style={{ fontSize: '8px', marginLeft: '4px' }}>▼</span>
            </div>
            <input
                type="text"
                placeholder="Search Ramazon"
                value={localSearch}
                onChange={(e) => setLocalSearch(e.target.value)}
                onKeyDown={handleKeyDown}
                style={{ flexGrow: 1, border: 'none', padding: '0 10px', fontSize: '15px', outline: 'none' }}
            />
            <button
                onClick={handleSearch}
                style={{ backgroundColor: '#febd69', border: 'none', width: '45px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
            >
                <Search size={22} color="#131921" />
            </button>
        </div>

        {/* Right Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {/* Language (skip for simplicity) */}

            {/* Account */}
             <div style={{ padding: '5px 10px', cursor: 'pointer', lineHeight: '1.2' }}>
                <div style={{ fontSize: '12px' }}>Hello, Pikachu</div>
                <div style={{ fontSize: '14px', fontWeight: 'bold' }}>Account & Lists</div>
            </div>

            {/* Returns */}
            <div style={{ padding: '5px 10px', cursor: 'pointer', lineHeight: '1.2' }}>
                <div style={{ fontSize: '12px' }}>Returns</div>
                <div style={{ fontSize: '14px', fontWeight: 'bold' }}>& Orders</div>
            </div>

            {/* Cart */}
            <div onClick={onCartClick} style={{ display: 'flex', alignItems: 'end', padding: '5px 10px', cursor: 'pointer' }}>
                <div style={{ position: 'relative' }}>
                    <ShoppingCart size={34} />
                    <span style={{ position: 'absolute', top: '0', left: '16px', color: '#f08804', fontWeight: 'bold', fontSize: '16px' }}>{cartCount}</span>
                </div>
                <span style={{ fontWeight: 'bold', fontSize: '14px', margin: '0 0 5px 2px' }}>Basket</span>
            </div>
        </div>
      </div>

       {/* Sub Nav */}
       <div style={{ backgroundColor: '#232f3e', color: 'white', height: '39px', display: 'flex', alignItems: 'center', padding: '0 20px', fontSize: '14px', gap: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', fontWeight: 'bold', gap: '5px', cursor: 'pointer' }}>
                <Menu size={20} /> All
            </div>
            <a href="#/ecomm/products" style={{ color: 'white', textDecoration: 'none' }}>Today's Deals</a>
            <a href="#/ecomm/products" style={{ color: 'white', textDecoration: 'none' }}>Customer Service</a>
            <a href="#/ecomm/products" style={{ color: 'white', textDecoration: 'none' }}>Registry</a>
            <a href="#/ecomm/products" style={{ color: 'white', textDecoration: 'none' }}>Gift Cards</a>
            <a href="#/ecomm/products" style={{ color: 'white', textDecoration: 'none' }}>Sell</a>
       </div>
    </header>
  );
}
