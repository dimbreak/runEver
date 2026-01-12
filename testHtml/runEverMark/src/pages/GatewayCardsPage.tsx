import { useState } from 'react';
import GatewayHeader from '../components/GatewayHeader';
import { writeSession } from '../utils/session';

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

const baseAmount = 500;

function estimateTotal(card: CardOption) {
  const fee = (baseAmount * card.feePercent) / 100;
  const converted = (baseAmount - fee) * card.exchangeRate;
  return {
    fee: Number(fee.toFixed(2)),
    converted: Number(converted.toFixed(2))
  };
}

export default function GatewayCardsPage() {
  const [selected, setSelected] = useState('');

  const handlePick = (id: string) => {
    setSelected(id);
    writeSession('runEverMark_gateway_card', id);
  };

  return (
    <div style={{ backgroundColor: '#f5f7fa', minHeight: '100vh', fontFamily: 'Helvetica Neue, Helvetica, Arial, sans-serif' }}>
      <GatewayHeader />
      <div style={{ maxWidth: '600px', margin: '0 auto', padding: '0 20px' }}>
        <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: '30px', boxShadow: '0 0 10px rgba(0,0,0,0.05)', border: '1px solid #e6e6e6' }}>
            <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                <h3 style={{ margin: 0, color: '#2c2e2f', fontSize: '22px', fontWeight: '400' }}>Choose a way to pay</h3>
                <p className="muted" style={{ fontSize: '14px', color: '#6c7378' }}>
                    Total amount: <span style={{ fontWeight: 'bold', color: '#2c2e2f' }}>${baseAmount} USD</span>
                </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {cards.map((card) => {
                estimateTotal(card);
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
