export default function HomePage() {
  return (
    <section className="panel">
      <h1>Benchmark lanes</h1>
      <p className="muted">
        Each lane simulates a fixed workflow for tuning agentic browser models. Data is local and
        stored in localStorage.
      </p>
      <div className="grid">
        <div className="card">
          <h3>RMail</h3>
          <p>Inbox list, inject new emails, and compose with rich text.</p>
          <a className="button" href="#/email">
            Open RMail lane
          </a>
        </div>
        <div className="card">
          <h3>Ramazon</h3>
          <p>Search 120 products, register/login, checkout, and view order receipt.</p>
          <a className="button" href="#/ecomm/products">
            Open Ramazon lane
          </a>
        </div>
        <div className="card">
          <h3>GatePal</h3>
          <p>Login, pass 2FA, and choose the best exchange-rate card.</p>
          <a className="button" href="#/gateway/login">
            Open GatePal lane
          </a>
        </div>
        <div className="card">
          <h3>Sellfroce</h3>
          <p>Login, manage orders, and create a long-form order.</p>
          <a className="button" href="#/pos/login">
            Open Sellfroce lane
          </a>
        </div>
        <div className="card">
          <h3>Gogo</h3>
          <p>Submit a query and sift relevant vs scrum results.</p>
          <a className="button" href="#/search">
            Open Gogo lane
          </a>
        </div>
      </div>
    </section>
  );
}
