import { useState, useEffect, type FormEvent } from 'react';
import GatewayHeader from '../components/GatewayHeader';
import { readSession, writeSession, setBenchmarkResult } from '../utils/session';

interface Props {
  entryPoint?: string;
}

export default function GatewayTwoFactorPage({ entryPoint: propEntryPoint }: Props) {
  const [status, setStatus] = useState('');
  const email = readSession<string>('runEverMark_gateway_email', 'unknown@merchant.test');
  const [generatedCode, setGeneratedCode] = useState<string>(() => readSession('runEverMark_gateway_2fa_code', ''));
  const [hasBlurred, setHasBlurred] = useState(false);

  const entryPoint = propEntryPoint || readSession<string>('runEverMark_active_entryPoint', '').replace('#/', '');

  // ... (useEffect remains, uses entryPoint)



  useEffect(() => {
    console.log(entryPoint)
    if (entryPoint === 'ecomm/pro') {
        let code = readSession<string>('runEverMark_gateway_2fa_code', '');

        if (!code) {
            code = Math.floor(100000 + Math.random() * 900000).toString();
            setGeneratedCode(code);
            writeSession('runEverMark_gateway_2fa_code', code);

    }
      // Inject Email
      const emailData = {
        id: `email-2fa-${Date.now()}`,
        from: 'security@gatepal.com',
        subject: 'Your Security Code of GatePal',
        preview: `Your verification code`,
        body: `<p>Your verification code is: <strong>${code}</strong></p><p>Do not share this with anyone.</p>`,
        isStarred: true,
        isImportant: true,
        timestamp: new Date().toLocaleTimeString()
      };
      localStorage.setItem('runEverMark_inject_email', JSON.stringify(emailData));
    }

    const handleBlur = () => setHasBlurred(true);

    const handleFocus = () => {
        if (entryPoint && hasBlurred) {
            setBenchmarkResult(entryPoint, 'focus_2fa', true);
        }
    };

    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);

    // Also check visibility change as fallback
    const handleVis = () => {
        if (document.visibilityState === 'hidden') {
            setHasBlurred(true);
        }
        if (document.visibilityState === 'visible' && entryPoint && hasBlurred) {
             setBenchmarkResult(entryPoint, 'focus_2fa', true);
        }
    };
    document.addEventListener('visibilitychange', handleVis);

    return () => {
        window.removeEventListener('blur', handleBlur);
        window.removeEventListener('focus', handleFocus);
        document.removeEventListener('visibilitychange', handleVis);
    };
  }, [entryPoint, hasBlurred]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    // Get input value
    const formData = new FormData(event.currentTarget);
    const inputCode = String(formData.get('code')).trim();

    if (entryPoint === 'ecomm/pro') {
       if (inputCode === generatedCode) {
           setBenchmarkResult(entryPoint, 'check_email_code', true);
       } else {
           setStatus('Incorrect code. Please check your email.');
           return;
       }
    }

    writeSession('runEverMark_gateway_auth', 'verified');
    setStatus('Verified. Continue to card selection.');

    // Small delay to show success msg
    setTimeout(() => {
        window.location.hash = '#/gateway/cards';
    }, 500);
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
                    autoComplete="off"
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

                {status && <p className="muted" style={{ fontSize: '14px', marginTop: '10px', color: status.includes('Incorrect') ? 'red' : 'green' }}>{status}</p>}
            </form>
        </div>
      </div>
    </div>
  );
}
