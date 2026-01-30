import React, { useEffect, useMemo, useState } from 'react';
import {removeSession, writeSession} from './utils/session';
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

import DataGridPage from './pages/DataGridPage';
import TelegramPage from './pages/TelegramPage';

const routeMap: Record<string, () => React.ReactNode> = {
  '/': HomePage,
  '/email': EmailPlatformPage,
  '/im': TelegramPage,
  '/data-grid': () => <DataGridPage />,
  '/pokemon': () => <DataGridPage entryPoint="pokemon" />,
  '/ecomm/products': () => <EcommerceProductsPage />,
  '/ecomm/basic': () => {
    writeSession('runEverMark_ecomm_cart', []);
    return <EcommerceProductsPage entryPoint="#/ecomm/basic" targetProductId="sku-31" />;
  },
  '/ecomm/pro': () => {
    removeSession('runEverMark_email_user');
    removeSession('runEverMark_email_auth');
    writeSession('runEverMark_ecomm_cart', []);
    return <EcommerceProductsPage entryPoint="#/ecomm/pro" />;
  },
  '/ecomm/register': EcommerceRegisterPage,
  '/ecomm/login': EcommerceLoginPage,
  '/ecomm/checkout': () => <EcommerceCheckoutPage />,
  '/ecomm/checkout/basic': () => <EcommerceCheckoutPage entryPoint="#/ecomm/basic" />,
  '/ecomm/checkout/pro': () => <EcommerceCheckoutPage entryPoint="#/ecomm/pro" />,
  '/ecomm/ordered': EcommerceOrderedPage,
  '/gateway/login/ecomm/pro': ()=><GatewayLoginPage entryPointProp='ecomm/pro' />,
  '/gateway/login': ()=><GatewayLoginPage />,
  '/gateway/2fa': () => <GatewayTwoFactorPage />,
  '/gateway/2fa/ecomm/pro': ()=><GatewayTwoFactorPage entryPoint='ecomm/pro' />,
  '/gateway/cards': () => <GatewayCardsPage />,
  '/pos/basic': () => {

    removeSession('runEverMark_email_user');
    removeSession('runEverMark_email_auth');
     writeSession('runEverMark_active_entryPoint', '#/pos/basic');

     // Calculate target delivery date: 1 year from now, adjusted to next Monday
     const today = new Date();
     const targetDate = new Date(today.getFullYear() + 1, today.getMonth(), today.getDate());
     const day = targetDate.getDay();
     const daysUntilMonday = (1 + 7 - day) % 7;
     targetDate.setDate(targetDate.getDate() + daysUntilMonday);
     const dateString = targetDate.toISOString().split('T')[0];

     const email = {
       id: 'email-pos-order',
       from: 'gengar@pokemon.com',
       subject: 'Order Request: Desk chair',
       preview: 'Please create an order for Desk chair',
       body: `Hi,<br><br>Please create an order for:<br>Client: Gengar<br>Email: gengar@pokemon.com<br>Phone: 555-0199<br>Address: 1600 Pennsylvania Ave NW, Washington, DC 20500, United States<br>Product: Desk Chair<br>Qty: 1<br>Delivery Date: ${dateString}<br><br>Thanks,<br>Gengar`,
       timestamp: new Date().toLocaleTimeString(),
       isStarred: true,
       isImportant: true
     };
     localStorage.setItem('runEverMark_inject_email', JSON.stringify(email));
     // Use timeout to allow render cycle to finish if needed, or just redirect
    setTimeout(() => window.location.hash = '#/email', 10);
     return <div style={{padding: 20}}>Loading Benchmark...</div>;
  },
  '/pos/pro': () => {
    removeSession('runEverMark_email_user');
    removeSession('runEverMark_email_auth');
     writeSession('runEverMark_active_entryPoint', '#/pos/pro');
     const email = {
       id: 'email-pos-pro-order',
       from: 'gengar@pokemon.com',
       subject: 'Order Request: Office Setup',
       preview: 'Please find the attached order form for our new office setup.',
       body: 'Hi,<br><br>Please see the attached PDF for the order details.<br><br>Best,<br>Gengar',
       timestamp: new Date().toLocaleTimeString(),
       isStarred: true,
       isImportant: true,
       attachments: [
         { name: 'sample_order_form.pdf', size: 1024, type: 'application/pdf', url: 'sample_order_form.pdf' }
       ]
     };
     localStorage.setItem('runEverMark_inject_email', JSON.stringify(email));
     setTimeout(() => window.location.hash = '#/email', 10);
     return <div style={{padding: 20}}>Loading Benchmark...</div>;
  },
  '/pos': PosLoginPage,
  '/pos/dashboard': PosDashboardPage,
  '/pos/orders': PosOrdersPage,
  '/pos/create': PosOrderCreatePage,
  '/pos/preview': PosOrderPreviewPage,
  '/search': () => <SearchHomePage />,
  '/search/basic': () => <SearchHomePage nextHash="#/search/results/basic" entryPoint="#/search/basic" expectedQuery="iphone 17 pro max" />,
  '/search/pro': () => <SearchHomePage nextHash="#/search/results/pro" entryPoint="#/search/pro" expectedQuery="iphone 17 pro max" />,
  '/search/results': () => <SearchResultsPage />,
  '/search/results/basic': () => (
    <SearchResultsPage
      allowedUrls={['https://www.amazon.com/']}
      entryPoint="#/search/basic"
      taskName="click_result"
    />
  ),
  '/search/results/pro': () => (
    <SearchResultsPage
      allowedUrls={['https://www.currys.co.uk/', 'https://www.amazon.com/']}
      entryPoint="#/search/pro"
      taskName="click_result"
    />
  )
};

const titleMap: Record<string, string> = {
  '/': 'Home - RunEverMark',
  '/email': 'Email Platform - RunEverMark',
  '/im': 'Teleram - RunEverMark',
  '/data-grid': 'Data Grid - RunEverMark',
  '/ecomm/products': 'Products - E-Commerce - RunEverMark',
  '/ecomm/basic': 'Products (Basic) - E-Commerce - RunEverMark',
  '/ecomm/pro': 'Products (Pro) - E-Commerce - RunEverMark',
  '/ecomm/register': 'Register - E-Commerce - RunEverMark',
  '/ecomm/login': 'Login - E-Commerce - RunEverMark',
  '/ecomm/checkout': 'Checkout - E-Commerce - RunEverMark',
  '/ecomm/checkout/basic': 'Checkout (Basic) - E-Commerce - RunEverMark',
  '/ecomm/checkout/pro': 'Checkout (Pro) - E-Commerce - RunEverMark',
  '/ecomm/ordered': 'Order Confirmation - E-Commerce - RunEverMark',
  '/gateway/login/ecomm/pro': 'Login (Ecom Pro) - Gateway - RunEverMark',
  '/gateway/login': 'Login - Gateway - RunEverMark',
  '/gateway/2fa': 'Two-Factor Auth - Gateway - RunEverMark',
  '/gateway/2fa/ecomm/pro': 'Two-Factor Auth (Ecom Pro) - Gateway - RunEverMark',
  '/gateway/cards': 'Cards - Gateway - RunEverMark',
  '/pos/basic': 'POS (Basic) - RunEverMark',
  '/pos/pro': 'POS (Pro) - RunEverMark',
  '/pos': 'Login - POS - RunEverMark',
  '/pos/dashboard': 'Dashboard - POS - RunEverMark',
  '/pos/orders': 'Orders - POS - RunEverMark',
  '/pos/create': 'Create Order - POS - RunEverMark',
  '/pos/preview': 'Order Preview - POS - RunEverMark',
  '/search': 'Search - RunEverMark',
  '/search/basic': 'Search (Basic) - RunEverMark',
  '/search/pro': 'Search (Pro) - RunEverMark',
  '/search/results': 'Results - Search - RunEverMark',
  '/search/results/basic': 'Results (Basic) - Search - RunEverMark',
  '/search/results/pro': 'Results (Pro) - Search - RunEverMark',
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

  useEffect(() => {
    document.title = titleMap[route] || 'RunEverMark';
  }, [route]);

  const ActivePage = useMemo(() => {
    if (route.startsWith('/email')) return EmailPlatformPage;
    return routeMap[route];
  }, [route]);

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
