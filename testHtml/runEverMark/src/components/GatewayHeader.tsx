export default function GatewayHeader() {
  return (
    <header className="section-header">
      <div>
        <h2>Payment gateway</h2>
        <p className="muted">Login, verify 2FA, and select the best exchange rate.</p>
      </div>
      <nav className="mini-nav">
        <a href="#/gateway/login">Login</a>
        <a href="#/gateway/2fa">2FA</a>
        <a href="#/gateway/cards">Cards</a>
      </nav>
    </header>
  );
}
