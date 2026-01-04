import { useState, type FormEvent } from 'react';
import { writeSession } from '../utils/session';

export default function PosLoginPage() {
  const [status, setStatus] = useState('');

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const operator = String(formData.get('operator') || '');
    writeSession('runEverMark_pos_operator', operator);
    writeSession('runEverMark_pos_auth', true);
    setStatus('Logged in. Go to dashboard.');
    window.location.hash = '#/pos/dashboard';
  };

  return (
    <section className="panel">
      <h2>POS login</h2>
      <form className="form" onSubmit={handleSubmit}>
        <label>
          Operator ID
          <input name="operator" required />
        </label>
        <label>
          Passcode
          <input name="passcode" type="password" required />
        </label>
        <button className="button" type="submit">
          Sign in
        </button>
        {status && <p className="muted">{status}</p>}
      </form>
    </section>
  );
}
