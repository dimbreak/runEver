import { useState, type FormEvent } from 'react';
import GatewayHeader from '../components/GatewayHeader';
import { writeSession } from '../utils/session';

export default function GatewayLoginPage() {
  const [status, setStatus] = useState('');

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const email = String(formData.get('email') || '');
    writeSession('runEverMark_gateway_email', email);
    writeSession('runEverMark_gateway_auth', 'pending-2fa');
    setStatus('2FA required. Proceed to verification.');
    window.location.hash = '#/gateway/2fa';
  };

  return (
    <section className="panel">
      <GatewayHeader />
      <form className="form" onSubmit={handleSubmit}>
        <h3>Gateway login</h3>
        <label>
          Email
          <input name="email" type="email" required />
        </label>
        <label>
          Password
          <input name="password" type="password" required />
        </label>
        <button className="button" type="submit">
          Continue
        </button>
        {status && <p className="muted">{status}</p>}
      </form>
    </section>
  );
}
