import { useState } from 'react';
import GatewayHeader from '../components/GatewayHeader';
import { writeSession, readSession, setBenchmarkResult } from '../utils/session';

type CardOption = {
  id: string;
  name: string;
  exchangeRate: number;
  feePercent: number;
  lastFour: string;
  type: string;
};

const cards: CardOption[] = [
  {
    id: 'card-alpha',
    name: 'Alpha Travel Card',
    exchangeRate: 0.9,
    feePercent: 1.0,
    lastFour: '4242',
    type: 'VISA'
  },
  {
    id: 'card-beta',
    name: 'Beta FX Card',
    exchangeRate: 0.88,
    feePercent: 0.2,
    lastFour: '8888',
    type: 'Mastercard'
  }
];

// Mock GatePal address
const gatePalAddress = {
  name: "John Doe",
  line1: "123 Gateway Blvd",
  line2: "Apt 4B",
  city: "San Jose",
  state: "CA",
  zip: "95110"
};

interface Props {
  entryPoint?: string;
}

export default function GatewayCardsPage({ entryPoint: propEntryPoint }: Props) {
  const [selected, setSelected] = useState('');

  const hash = window.location.hash;
  const searchParams = new URLSearchParams(hash.includes('?') ? hash.split('?')[1] : '');
  const entryPoint = propEntryPoint || searchParams.get('entryPoint') || readSession<string>('runEverMark_active_entryPoint', '');

  // Read order total from session or fallback to 500
  const order = readSession<{ total: number } | null>('runEverMark_ecomm_order', null);
  const baseAmount = order?.total || 500;

  // Helper to calculate total based on dynamic baseAmount
  const estimateTotal = (card: CardOption) => {
    const fee = (baseAmount * card.feePercent) / 100;
    const converted = (baseAmount - fee) * card.exchangeRate;
    return {
      fee: Number(fee.toFixed(2)),
      converted: Number(converted.toFixed(2))
    };
  };

  // Determine best card (lowest converted amount)
  const bestCard = cards.slice().sort((a, b) => {
      const totalA = estimateTotal(a).converted;
      const totalB = estimateTotal(b).converted;
      return totalA - totalB;
  })[0];

  const handlePick = (id: string) => {
    setSelected(id);
    writeSession('runEverMark_gateway_card', id);

    if (entryPoint === '#/ecomm/pro' && bestCard && id === bestCard.id) {
        setBenchmarkResult(entryPoint, 'pick_best_card', true);
    }
  };

  const handleComplete = () => {
      if (entryPoint) {
           setBenchmarkResult(entryPoint, 'submit_gateway_order', true);
      }
      // Logic to finalize order would go here, probably redirecting back to the main app success page
      window.location.hash = '#/ecomm/ordered';
  };

  return (
    <div style={{ backgroundColor: '#f5f7fa', minHeight: '100vh', fontFamily: 'Helvetica Neue, Helvetica, Arial, sans-serif' }}>
      <GatewayHeader />
      <div style={{ maxWidth: '600px', margin: '0 auto', padding: '0 20px' }}>
        <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: '30px', boxShadow: '0 0 10px rgba(0,0,0,0.05)', border: '1px solid #e6e6e6' }}>
            <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                <h3 style={{ margin: 0, color: '#2c2e2f', fontSize: '22px', fontWeight: '400' }}>Choose a way to pay</h3>
                <p className="muted" style={{ fontSize: '14px', color: '#6c7378' }}>
                    Total amount: <span style={{ fontWeight: 'bold', color: '#2c2e2f' }}>${baseAmount.toFixed(2)} USD</span>
                </p>
            </div>

             {/* Address Box */}
             <div style={{ marginBottom: '20px', padding: '15px', borderRadius: '6px', border: '1px solid #e6e6e6', backgroundColor: '#fbfcfe' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontSize: '12px', textTransform: 'uppercase', color: '#6c7378', fontWeight: 'bold' }}>Ship to</span>
                    <a href="#" style={{ fontSize: '12px', color: '#0070ba', textDecoration: 'none' }}>Change</a>
                </div>
                <div style={{ fontSize: '14px', color: '#2c2e2f' }}>
                    <div style={{ fontWeight: 'bold' }}>{gatePalAddress.name}</div>
                    <div>{gatePalAddress.line1}</div>
                    <div>{gatePalAddress.line2}</div>
                    <div>{gatePalAddress.city}, {gatePalAddress.state} {gatePalAddress.zip}</div>
                </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {cards.map((card) => {
                const isSelected = selected === card.id;
                return (
                  <div
                    key={card.id}
                    onClick={() => handlePick(card.id)}
                    style={{
                        border: isSelected ? '2px solid #0070ba' : '1px solid #e6e6e6',
                        borderRadius: '6px',
                        padding: '15px',
                        display: 'flex',
                        alignItems: 'center',
                        cursor: 'pointer',
                        backgroundColor: isSelected ? '#fbfcfe' : 'white',
                        transition: 'all 0.2s'
                    }}
                  >
                    <div style={{
                        width: '20px', height: '20px', borderRadius: '50%', border: isSelected ? '6px solid #0070ba' : '2px solid #9da3a6',
                        marginRight: '15px', flexShrink: 0, boxSizing: 'border-box'
                    }}></div>

                    <div style={{ flexGrow: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                             <span style={{ fontWeight: 'bold', color: '#2c2e2f' }}>{card.name}</span>
                             <span style={{ fontSize: '12px', padding: '2px 6px', backgroundColor: '#e6e6e6', borderRadius: '4px' }}>{card.type} •••• {card.lastFour}</span>
                        </div>
                        <div style={{ fontSize: '14px', color: '#6c7378', marginTop: '4px' }}>
                            Rate: {card.exchangeRate} EUR • Fee: {card.feePercent}%
                        </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {selected && (
                <div style={{ marginTop: '20px', textAlign: 'center', backgroundColor: '#f5f7fa', padding: '15px', borderRadius: '6px' }}>
                     <h4 style={{ margin: '0 0 5px 0', fontSize: '14px', color: '#2c2e2f' }}>Transaction Summary</h4>
                     <p style={{ margin: 0, fontSize: '18px', fontWeight: 'bold', color: '#2c2e2f' }}>
                        {estimateTotal(cards.find(c => c.id === selected)!).converted} EUR
                     </p>
                </div>
            )}

            <button
                disabled={!selected}
                onClick={handleComplete}
                style={{
                    width: '100%', backgroundColor: selected ? '#0070ba' : '#e1e7eb', color: selected ? 'white' : '#9da3a6',
                    border: 'none', borderRadius: '24px', padding: '12px', fontSize: '18px', fontWeight: 'bold',
                    cursor: selected ? 'pointer' : 'not-allowed', marginTop: '25px', transition: 'background-color 0.2s'
                }}
            >
                Complete Purchase
            </button>
        </div>
      </div>
    </div>
  );
}
