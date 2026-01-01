export default function Landing() {
  return (
    <header className="hero">
      <div className="hero__copy">
        <p className="hero__tag">Agentic Browser Mock Lab</p>
        <h1>Composable flow playground for agent tests</h1>
        <p className="hero__body">
          Use the <span className="hero__mono">flow</span> query param to compose
          mock websites. Example: <span className="hero__mono">?flow=login,email_list</span>.
        </p>
        <div className="hero__actions">
          <a href="?flow=login" className="btn btn--primary">
            Login Flow
          </a>
          <a href="?flow=register" className="btn btn--ghost">
            Register
          </a>
          <a href="?flow=email_list" className="btn btn--ghost">
            Email List
          </a>
          <a href="?flow=search_engine" className="btn btn--ghost">
            Search Engine
          </a>
          <a href="?flow=search_engine,search_result" className="btn btn--ghost">
            Search Engine + Results
          </a>
          <a href="?flow=ecommerce" className="btn btn--ghost">
            Ecommerce Category
          </a>
        </div>
      </div>
      <div className="hero__panel">
        <div className="hero__card">
          <p className="hero__card-title">Active flows render below</p>
          <ul>
            <li>login</li>
            <li>register</li>
            <li>email_list</li>
            <li>search_engine</li>
            <li>search_result</li>
            <li>ecommerce</li>
          </ul>
        </div>
      </div>
    </header>
  );
}
