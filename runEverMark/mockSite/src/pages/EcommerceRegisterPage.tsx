import { useState, type FormEvent } from 'react';
import EcommHeader from '../components/EcommHeader';
import { writeSession } from '../utils/session';

export default function EcommerceRegisterPage() {
  const [status, setStatus] = useState('');

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const payload = {
      name: String(formData.get('name') || ''),
      email: String(formData.get('email') || ''),
      company: String(formData.get('company') || ''),
      newsletter: Boolean(formData.get('newsletter'))
    };
    writeSession('runEverMark_ecomm_user', payload);
    setStatus('Registered. You can log in now.');
  };

  return (
    <section className="panel">
      <EcommHeader />
      <form className="form" onSubmit={handleSubmit}>
        <h3>Create account</h3>
        <label>
          Full name
          <input name="name" required />
        </label>
        <label>
          Email
          <input name="email" type="email" required />
        </label>
        <label>
          Company
          <input name="company" />
        </label>
        <label className="checkbox">
          <input type="checkbox" name="newsletter" />
          Subscribe to order alerts
        </label>
        <button className="button" type="submit">
          Register
        </button>
        {status && <p className="muted">{status}</p>}
      </form>
    </section>
  );
}
