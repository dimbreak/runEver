import { useState, type FormEvent } from 'react';
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
    setStatus('Logged in. Redirecting...');
    // Small delay to show status or just redirect immediately
    setTimeout(() => {
        window.location.hash = '#/ecomm/checkout';
    }, 500);
  };

  return (
    <div style={{ backgroundColor: 'white', minHeight: '100vh', fontFamily: 'Arial, sans-serif', paddingBottom: '40px' }}>

      {/* Minimal Header */}
      <div style={{ padding: '14px 0', textAlign: 'center' }}>
         <span style={{ fontSize: '28px', fontWeight: 'bold', letterSpacing: '-1px', cursor: 'pointer' }} onClick={() => window.location.hash = '#/ecomm/products'}>
            Ra<span style={{ color: '#ff9900' }}>mazon</span>
         </span>
      </div>

      <div style={{ width: '350px', margin: '0 auto' }}>

        {/* Login Card */}
        <div style={{ border: '1px solid #ddd', borderRadius: '4px', padding: '20px 26px', marginBottom: '22px' }}>
            <h1 style={{ fontSize: '28px', fontWeight: '400', margin: '0 0 10px' }}>Sign in</h1>

            <form onSubmit={handleSubmit}>
                <div style={{ marginBottom: '14px' }}>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', marginBottom: '3px', paddingLeft: '2px' }}>
                        Email or mobile phone number
                    </label>
                    <input
                        name="email"
                        type="email"
                        required
                        style={{
                            width: '100%', padding: '3px 7px', fontSize: '13px', lineHeight: 'normal',
                            border: '1px solid #a6a6a6', borderTopColor: '#949494', borderRadius: '3px',
                            boxShadow: '0 1px 0 rgba(255,255,255,.5), 0 1px 0 rgba(0,0,0,.07) inset',
                            outline: 'none', height: '31px', boxSizing: 'border-box'
                        }}
                        onFocus={(e) => e.target.style.boxShadow = '0 0 3px 2px rgba(228,121,17,.5)'}
                        onBlur={(e) => e.target.style.boxShadow = '0 1px 0 rgba(255,255,255,.5), 0 1px 0 rgba(0,0,0,.07) inset'}
                    />
                </div>

                <div style={{ marginBottom: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                         <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', marginBottom: '3px', paddingLeft: '2px' }}>
                            Password
                        </label>
                        <a href="#" style={{ fontSize: '13px', color: '#0066c0', textDecoration: 'none' }}>Forgot your password?</a>
                    </div>

                    <input
                        name="password"
                        type="password"
                        required
                        style={{
                            width: '100%', padding: '3px 7px', fontSize: '13px', lineHeight: 'normal',
                            border: '1px solid #a6a6a6', borderTopColor: '#949494', borderRadius: '3px',
                            boxShadow: '0 1px 0 rgba(255,255,255,.5), 0 1px 0 rgba(0,0,0,.07) inset',
                            outline: 'none', height: '31px', boxSizing: 'border-box'
                        }}
                        onFocus={(e) => e.target.style.boxShadow = '0 0 3px 2px rgba(228,121,17,.5)'}
                        onBlur={(e) => e.target.style.boxShadow = '0 1px 0 rgba(255,255,255,.5), 0 1px 0 rgba(0,0,0,.07) inset'}
                    />
                </div>

                 <div style={{ marginBottom: '14px' }}>
                     <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', marginBottom: '3px', paddingLeft: '2px' }}>
                        Region
                    </label>
                    <select
                        name="region"
                        defaultValue="US"
                        style={{
                             width: '100%', padding: '5px', fontSize: '13px',
                             border: '1px solid #a6a6a6', borderRadius: '3px',
                             backgroundColor: '#F0F2F2',
                             height: '31px'
                        }}
                    >
                        <option value="US">United States</option>
                        <option value="EU">Europe</option>
                        <option value="APAC">Asia Pacific</option>
                    </select>
                </div>

                <button
                    type="submit"
                    style={{
                        width: '100%', height: '31px', padding: '0',
                        background: 'linear-gradient(to bottom,#f7dfa5,#f0c14b)',
                        border: '1px solid', borderColor: '#a88734 #9c7e31 #846a29',
                        borderRadius: '3px', cursor: 'pointer',
                        boxShadow: '0 1px 0 rgba(255,255,255,.4) inset',
                        fontSize: '13px', textShadow: '0 1px 0 rgba(255,255,255,.4)'
                    }}
                >
                    Sign in
                </button>
                {status && <p style={{ fontSize: '12px', color: '#c40000', marginTop: '10px' }}>{status}</p>}
            </form>

            <div style={{ fontSize: '12px', lineHeight: '1.5', marginTop: '18px', color: '#111' }}>
                By continuing, you agree to Ramazon's <a href="#" style={{ color: '#0066c0', textDecoration: 'none' }}>Conditions of Use</a> and <a href="#" style={{ color: '#0066c0', textDecoration: 'none' }}>Privacy Notice</a>.
            </div>

             <div style={{ marginTop: '22px', borderTop: '1px solid #e7e7e7', paddingTop: '18px', fontSize: '13px' }}>
                <a href="#" style={{ color: '#0066c0', textDecoration: 'none' }}>Need help?</a>
            </div>

        </div>

        {/* New to Section */}
        <div style={{ position: 'relative', marginTop: '22px', marginBottom: '22px', textAlign: 'center' }}>
            <div style={{ position: 'absolute', top: '50%', left: '0', width: '100%', borderTop: '1px solid #e7e7e7', zIndex: 0 }}></div>
            <span style={{ position: 'relative', zIndex: 1, backgroundColor: 'white', padding: '0 10px', fontSize: '12px', color: '#767676' }}>
                New to Ramazon?
            </span>
        </div>

        <button
            onClick={() => window.location.hash = '#/ecomm/register'}
            style={{
                width: '100%', height: '31px', padding: '0',
                background: 'linear-gradient(to bottom,#f7fafa,#f0f2f2)',
                border: '1px solid', borderColor: '#adb1b8 #a2a6ac #8d9096',
                borderRadius: '3px', cursor: 'pointer',
                boxShadow: '0 1px 0 rgba(255,255,255,.4) inset',
                fontSize: '13px', textShadow: '0 1px 0 rgba(255,255,255,.4)'
            }}
        >
            Create your Ramazon account
        </button>

      </div>

      <div style={{ borderTop: '1px solid #e7e7e7', marginTop: '26px', paddingTop: '20px', textAlign: 'center', fontSize: '11px', color: '#555' }}>
         <div style={{ marginBottom: '10px', display: 'flex', justifyContent: 'center', gap: '20px' }}>
             <a href="#" style={{ color: '#0066c0', textDecoration: 'none' }}>Conditions of Use</a>
             <a href="#" style={{ color: '#0066c0', textDecoration: 'none' }}>Privacy Notice</a>
             <a href="#" style={{ color: '#0066c0', textDecoration: 'none' }}>Help</a>
         </div>
         <div>
             © 2024-2025, runEverMark.com, Inc. or its affiliates
         </div>
      </div>
    </div>
  );
}
