export default function EcommHeader() {
  return (
    <header className="section-header">
      <div>
        <h2>E-comm platform</h2>
        <p className="muted">Product listing, auth, and checkout flow.</p>
      </div>
      <nav className="mini-nav">
        <a href="#/ecomm/products">Products</a>
        <a href="#/ecomm/register">Register</a>
        <a href="#/ecomm/login">Login</a>
        <a href="#/ecomm/checkout">Checkout</a>
        <a href="#/ecomm/ordered">Order</a>
      </nav>
    </header>
  );
}
