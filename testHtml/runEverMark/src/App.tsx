import React, { useEffect, useMemo, useState } from 'react';
import HomePage from './pages/HomePage';
import EmailPlatformPage from './pages/EmailPlatformPage';
import EcommerceProductsPage from './pages/EcommerceProductsPage';
import EcommerceRegisterPage from './pages/EcommerceRegisterPage';
import EcommerceLoginPage from './pages/EcommerceLoginPage';
import EcommerceCheckoutPage from './pages/EcommerceCheckoutPage';
import EcommerceOrderedPage from './pages/EcommerceOrderedPage';
import GatewayLoginPage from './pages/GatewayLoginPage';
import GatewayTwoFactorPage from './pages/GatewayTwoFactorPage';
import GatewayCardsPage from './pages/GatewayCardsPage';
import PosLoginPage from './pages/PosLoginPage';
import PosDashboardPage from './pages/PosDashboardPage';
import PosOrdersPage from './pages/PosOrdersPage';
import PosOrderCreatePage from './pages/PosOrderCreatePage';
import PosOrderPreviewPage from './pages/PosOrderPreviewPage';
import SearchHomePage from './pages/SearchHomePage';
import SearchResultsPage from './pages/SearchResultsPage';

const routeMap: Record<string, () => React.ReactNode> = {
  '/': HomePage,
  '/email': EmailPlatformPage,
  '/ecomm/products': EcommerceProductsPage,
  '/ecomm/register': EcommerceRegisterPage,
  '/ecomm/login': EcommerceLoginPage,
  '/ecomm/checkout': EcommerceCheckoutPage,
  '/ecomm/ordered': EcommerceOrderedPage,
  '/gateway/login': GatewayLoginPage,
  '/gateway/2fa': GatewayTwoFactorPage,
  '/gateway/cards': GatewayCardsPage,
  '/pos/login': PosLoginPage,
  '/pos/dashboard': PosDashboardPage,
  '/pos/orders': PosOrdersPage,
  '/pos/create': PosOrderCreatePage,
  '/pos/preview': PosOrderPreviewPage,
  '/search': SearchHomePage,
  '/search/results': SearchResultsPage
};

function getHashRoute() {
  const hash = window.location.hash.replace('#', '');
  return hash || '/';
}

export default function App() {
  const [route, setRoute] = useState(getHashRoute());

  useEffect(() => {
    const onHashChange = () => setRoute(getHashRoute());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const ActivePage = useMemo(() => routeMap[route], [route]);

  return (
    <div className="app-shell">
      <main className="app-main">
        {ActivePage ? <ActivePage /> : <NotFound route={route} />}
      </main>
    </div>
  );
}

function NotFound({ route }: { route: string }) {
  return (
    <section className="panel">
      <h2>Unknown destination</h2>
      <p className="muted">No page registered for {route}.</p>
      <a className="button" href="#/">
        Return home
      </a>
    </section>
  );
}
