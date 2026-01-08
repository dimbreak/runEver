import { useState, type FormEvent } from 'react';
import EcommHeader from '../components/EcommHeader';
import { writeSession } from '../utils/session';

export default function EcommerceLoginPage() {
  const [status, setStatus] = useState('');

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const payload = {
      email: String(formData.get('email') || ''),
      region: String(formData.get('region') || 'US')
    };
    writeSession('runEverMark_ecomm_auth', payload);
    setStatus('Logged in. Continue to checkout.');
  };

  return (
    <section className="panel">
      <EcommHeader />
      <form className="form" onSubmit={handleSubmit}>
        <h3>Sign in</h3>
        <label>
          Email
          <input name="email" type="email" required />
        </label>
        <label>
          Password
          <input name="password" type="password" required />
        </label>
        <label>
          Region
          <select name="region" defaultValue="US">
            <option value="US">United States</option>
            <option value="EU">Europe</option>
            <option value="APAC">Asia Pacific</option>
          </select>
        </label>
        <button className="button" type="submit">
          Login
        </button>
        {status && <p className="muted">{status}</p>}
      </form>
    </section>
  );
}
