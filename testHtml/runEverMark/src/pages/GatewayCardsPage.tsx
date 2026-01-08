import { useState } from 'react';
import GatewayHeader from '../components/GatewayHeader';
import { writeSession } from '../utils/session';

type CardOption = {
  id: string;
  name: string;
  exchangeRate: number;
  feePercent: number;
};

const cards: CardOption[] = [
  {
    id: 'card-alpha',
    name: 'Alpha Travel Card',
    exchangeRate: 0.9,
    feePercent: 1.0
  },
  {
    id: 'card-beta',
    name: 'Beta FX Card',
    exchangeRate: 0.88,
    feePercent: 0.2
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
    <section className="panel">
      <GatewayHeader />
      <div className="panel-sub">
        <h3>Pick a credit card</h3>
        <p className="muted">Transaction estimate for ${baseAmount} USD.</p>
        <div className="grid">
          {cards.map((card) => {
            const estimate = estimateTotal(card);
            return (
              <button
                key={card.id}
                type="button"
                className={`card selectable ${selected === card.id ? 'active' : ''}`}
                onClick={() => handlePick(card.id)}
              >
                <h4>{card.name}</h4>
                <p className="muted">Rate: 1 USD = {card.exchangeRate} EUR</p>
                <p className="muted">FX fee: {card.feePercent}%</p>
                <p className="price">Estimated EUR: {estimate.converted}</p>
                <p className="muted">Fee: ${estimate.fee}</p>
              </button>
            );
          })}
        </div>
        {selected && <p className="muted">Selected card stored: {selected}</p>}
      </div>
    </section>
  );
}
