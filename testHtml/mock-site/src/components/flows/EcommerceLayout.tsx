import FlowFrame from '../FlowFrame';

type Product = {
  id: string;
  name: string;
  price: string;
  description: string;
};

type EcommerceLayoutProps = {
  products: Product[];
  activeProduct?: Product;
  isBasketOpen: boolean;
  onSelectProduct: (product: Product) => void;
  onCloseProduct: () => void;
  onOpenBasket: () => void;
  onCloseBasket: () => void;
};

export default function EcommerceLayout({
  products,
  activeProduct,
  isBasketOpen,
  onSelectProduct,
  onCloseProduct,
  onOpenBasket,
  onCloseBasket
}: EcommerceLayoutProps) {
  return (
    <FlowFrame title="Marketplace" subtitle="Flow: ecommerce" theme="results">
      <div className="shop">
        <div className="shop__header">
          <div>
            <h3>Spring essentials</h3>
            <p className="muted">Curated kits for remote teams.</p>
          </div>
          <div className="shop__actions">
            <button className="btn btn--ghost" type="button">
              Filter
            </button>
            <button className="btn btn--primary" type="button" onClick={onOpenBasket}>
              Basket (2)
            </button>
          </div>
        </div>
        <div className="shop__grid">
          {products.map((product) => (
            <article key={product.id} className="shop__card">
              <div className="shop__image" />
              <div>
                <h4>{product.name}</h4>
                <p className="muted">{product.description}</p>
              </div>
              <div className="shop__footer">
                <span className="shop__price">{product.price}</span>
                <button
                  className="btn btn--ghost"
                  type="button"
                  onClick={() => onSelectProduct(product)}
                >
                  View details
                </button>
              </div>
            </article>
          ))}
        </div>
      </div>

      {activeProduct && (
        <div className="modal" role="dialog" aria-modal="true">
          <div className="modal__backdrop" onClick={onCloseProduct} />
          <div className="modal__content">
            <div className="modal__header">
              <h3>{activeProduct.name}</h3>
              <button className="link" type="button" onClick={onCloseProduct}>
                Close
              </button>
            </div>
            <div className="modal__body">
              <div className="shop__detail">
                <div className="shop__image shop__image--large" />
                <div>
                  <p className="muted">{activeProduct.description}</p>
                  <ul>
                    <li>Includes onboarding templates</li>
                    <li>Ships in 2 business days</li>
                    <li>Compatible with team plans</li>
                  </ul>
                </div>
              </div>
            </div>
            <div className="modal__footer">
              <button className="btn btn--ghost" type="button">
                Add to wishlist
              </button>
              <button className="btn btn--primary" type="button" onClick={onOpenBasket}>
                Add to basket
              </button>
            </div>
          </div>
        </div>
      )}

      {isBasketOpen && (
        <div className="basket" role="dialog" aria-modal="true">
          <div className="basket__panel">
            <div className="basket__header">
              <h3>Your basket</h3>
              <button className="link" type="button" onClick={onCloseBasket}>
                Close
              </button>
            </div>
            <div className="basket__items">
              <div className="basket__item">
                <div>
                  <p className="basket__name">Starter kit</p>
                  <p className="muted">2 seats · annual</p>
                </div>
                <span>$98</span>
              </div>
              <div className="basket__item">
                <div>
                  <p className="basket__name">Workspace bundle</p>
                  <p className="muted">1 seat · monthly</p>
                </div>
                <span>$42</span>
              </div>
            </div>
            <div className="basket__footer">
              <div className="basket__total">
                <span>Total</span>
                <strong>$140</strong>
              </div>
              <button className="btn btn--primary btn--full" type="button">
                Checkout
              </button>
            </div>
          </div>
        </div>
      )}
    </FlowFrame>
  );
}
