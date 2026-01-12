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
    <div style={{ backgroundColor: '#f5f7fa', minHeight: '100vh', fontFamily: 'Helvetica Neue, Helvetica, Arial, sans-serif' }}>
      <GatewayHeader />
      <div style={{ maxWidth: '450px', margin: '0 auto', padding: '0 20px' }}>
        <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: '40px', boxShadow: '0 0 10px rgba(0,0,0,0.05)', border: '1px solid #e6e6e6' }}>
            <form className="form" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px', textAlign: 'center' }}>
                <h3 style={{ margin: 0, color: '#2c2e2f', fontSize: '18px', fontWeight: '400' }}>Enter your code</h3>
                <p className="muted" style={{ fontSize: '14px', color: '#2c2e2f' }}>We sent a code to {email}</p>

                <input
                    name="code"
                    placeholder="Enter 6-digit code"
                    required
                    style={{
                        width: '100%', padding: '12px 15px', borderRadius: '4px', border: '1px solid #9da3a6', fontSize: '18px', letterSpacing: '2px', textAlign: 'center', boxSizing: 'border-box', height: '50px'
                    }}
                />

                <button
                    className="button"
                    type="submit"
                    style={{
                        width: '100%', backgroundColor: '#0070ba', color: 'white', border: 'none', borderRadius: '24px', padding: '12px', fontSize: '18px', fontWeight: 'bold', cursor: 'pointer', marginTop: '10px'
                    }}
                >
                  Verify
                </button>

                <a href="#" style={{ fontSize: '14px', color: '#0070ba', textDecoration: 'none', fontWeight: '600', marginTop: '10px' }}>Resend Code</a>

                {status && <p className="muted" style={{ fontSize: '14px', marginTop: '10px' }}>{status}</p>}
            </form>
        </div>
      </div>
    </div>
  );
}
