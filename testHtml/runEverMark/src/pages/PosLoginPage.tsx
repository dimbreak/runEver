import {useState, type FormEvent, useEffect} from 'react';
import { writeSession, readSession, setBenchmarkResult } from '../utils/session';

export default function PosLoginPage() {
  const [status, setStatus] = useState('');
  const entryPoint = readSession<string>('runEverMark_active_entryPoint', '');

  useEffect(() => {
    if(entryPoint) {
      setBenchmarkResult(entryPoint, 'pos_landed', true);
    }
  }, []);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const operator = String(formData.get('operator') || '');
    const passcode = String(formData.get('passcode') || '');
    writeSession('runEverMark_pos_operator', operator);
    writeSession('runEverMark_pos_auth', true);

    if (entryPoint === '#/pos/basic') {
      if (operator === 'pikachu@pokemon.com' && passcode === 'P@ssword321') {
        setBenchmarkResult(entryPoint, 'pos_login', true);
      }
    } else if (entryPoint === '#/pos/pro') {
      if (operator === 'pikachu@pokemon.com' && passcode === 'P@ssword321') {
        setBenchmarkResult(entryPoint, 'pos_login', true);
      }
    }
    setStatus('Logging in...');

    setTimeout(() => {
        window.location.hash = '#/pos/dashboard';
    }, 500);
  };

  return (
    <div className="sf-login-page">
      <div className="sf-login-card">
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
             {/* Salesforce Cloud Logo Mock */}
             <svg viewBox="0 0 24 24" width="64" height="64" fill="#0176d3">
                <path d="M18.6 7.4C18.1 4.3 15.4 2 12.2 2 9.7 2 7.4 3.5 6.3 5.8 2.8 6.1 0 9 0 12.6 0 16.7 3.3 20 7.4 20h12.2c2.4 0 4.4-2 4.4-4.4 0-2.2-1.6-4-3.6-4.3-.4-1.7-1-3-1.8-3.9z" fillOpacity="0.8"/>
             </svg>
        </div>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
             <label className="sf-label">Username</label>
             <input className="sf-input" name="operator" required placeholder="user@sellforce-pos.com" />
          </div>
          <div style={{ marginBottom: 16 }}>
             <label className="sf-label">Password</label>
             <input className="sf-input" name="passcode" type="password" required />
          </div>
          <button className="sf-button brand" style={{ width: '100%', height: 44, fontSize: 16 }} type="submit">
            Log In
          </button>
          {status && <p style={{ marginTop: 12, color: 'green', textAlign: 'center' }}>{status}</p>}
        </form>
      </div>
    </div>
  );
}
