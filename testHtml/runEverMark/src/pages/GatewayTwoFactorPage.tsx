import { useState, type FormEvent } from 'react';
import GatewayHeader from '../components/GatewayHeader';
import { readSession, writeSession } from '../utils/session';

export default function GatewayTwoFactorPage() {
  const [status, setStatus] = useState('');
  const email = readSession<string>('runEverMark_gateway_email', 'unknown@merchant.test');

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    writeSession('runEverMark_gateway_auth', 'verified');
    setStatus('Verified. Continue to card selection.');
    window.location.hash = '#/gateway/cards';
  };

  return (
    <section className="panel">
      <GatewayHeader />
      <form className="form" onSubmit={handleSubmit}>
        <h3>Two-factor verification</h3>
        <p className="muted">Code sent to {email}</p>
        <label>
          2FA Code
          <input name="code" placeholder="123456" required />
        </label>
        <button className="button" type="submit">
          Verify
        </button>
        {status && <p className="muted">{status}</p>}
      </form>
    </section>
  );
}
