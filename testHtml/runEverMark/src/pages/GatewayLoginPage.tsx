import { useState, type FormEvent } from 'react';
import GatewayHeader from '../components/GatewayHeader';
import { writeSession, readSession, setBenchmarkResult } from '../utils/session';

export default function GatewayLoginPage({entryPointProp}: {entryPointProp?: string}) {
  const [status, setStatus] = useState('');

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const email = String(formData.get('email') || '');
    const password = String(formData.get('password') || '');
    const entryPoint = entryPointProp || readSession<string>('runEverMark_active_entryPoint', '');

    if (entryPoint === 'ecomm/pro') {
        if (email === 'pikachu@pokemon.com') {
          setBenchmarkResult(entryPoint, 'gateway_login_email', true);
        }
        if(password === 'P@ssword321') {
          setBenchmarkResult(entryPoint, 'gateway_login_password', true);
        }
    } else if (entryPoint) {
         // Basic flow accepts any
         setBenchmarkResult(entryPoint, 'gateway_login', true);
    }

    // Simple validation (accepts anything for now)
    writeSession('runEverMark_gateway_email', email);
    writeSession('runEverMark_gateway_auth', 'pending-2fa');
    setStatus('2FA required. Proceed to verification.');

    if (entryPoint) {
        window.location.hash = `#/gateway/2fa/${entryPoint}`;
    } else {
        window.location.hash = '#/gateway/2fa';
    }
  };

  return (
    <div style={{ backgroundColor: '#f5f7fa', minHeight: '100vh', fontFamily: 'Helvetica Neue, Helvetica, Arial, sans-serif' }}>
      <GatewayHeader />
      <div style={{ maxWidth: '450px', margin: '0 auto', padding: '0 20px' }}>
        <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: '40px', boxShadow: '0 0 10px rgba(0,0,0,0.05)', border: '1px solid #e6e6e6' }}>
            <form className="form" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div style={{ textAlign: 'center', marginBottom: '10px' }}>
                     <h3 style={{ margin: 0, color: '#2c2e2f', fontSize: '18px', fontWeight: '400' }}>Pay with GatePal</h3>
                </div>

                <input
                    name="email"
                    type="email"
                    placeholder="Email or mobile number"
                    required
                    style={{
                        width: '100%', padding: '12px 15px', borderRadius: '4px', border: '1px solid #9da3a6', fontSize: '16px', boxSizing: 'border-box', height: '44px'
                    }}
                />

                <input
                    name="password"
                    type="password"
                    placeholder="Password"
                    required
                    style={{
                        width: '100%', padding: '12px 15px', borderRadius: '4px', border: '1px solid #9da3a6', fontSize: '16px', boxSizing: 'border-box', height: '44px'
                    }}
                />

                <a href="#" style={{ fontSize: '14px', color: '#0070ba', textDecoration: 'none', fontWeight: '600' }}>Forgot password?</a>

                <button
                    type="submit"
                    style={{
                        width: '100%', backgroundColor: '#0070ba', color: 'white', border: 'none', borderRadius: '24px', padding: '12px', fontSize: '18px', fontWeight: 'bold', cursor: 'pointer', marginTop: '10px'
                    }}
                >
                Log In
                </button>

                <div style={{ display: 'flex', alignItems: 'center', margin: '10px 0' }}>
                    <div style={{ flexGrow: 1, height: '1px', backgroundColor: '#e6e6e6' }}></div>
                    <span style={{ padding: '0 10px', color: '#6c7378', fontSize: '14px' }}>or</span>
                    <div style={{ flexGrow: 1, height: '1px', backgroundColor: '#e6e6e6' }}></div>
                </div>

                <button
                    type="button"
                    style={{
                        width: '100%', backgroundColor: '#e1e7eb', color: '#2c2e2f', border: 'none', borderRadius: '24px', padding: '12px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer'
                    }}
                >
                Sign Up
                </button>

                {status && <p className="muted" style={{ textAlign: 'center', fontSize: '14px', marginTop: '10px' }}>{status}</p>}
            </form>
        </div>
        <div style={{ textAlign: 'center', marginTop: '30px', fontSize: '12px', color: '#6c7378' }}>
            <a href="#" style={{ color: '#6c7378', textDecoration: 'none', margin: '0 5px' }}>Contact Us</a>
            <a href="#" style={{ color: '#6c7378', textDecoration: 'none', margin: '0 5px' }}>Privacy</a>
            <a href="#" style={{ color: '#6c7378', textDecoration: 'none', margin: '0 5px' }}>Legal</a>
            <a href="#" style={{ color: '#6c7378', textDecoration: 'none', margin: '0 5px' }}>Worldwide</a>
        </div>
      </div>
    </div>
  );
}
