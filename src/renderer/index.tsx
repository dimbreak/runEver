import { createRoot } from 'react-dom/client';
import App from './App';

const container = document.getElementById('root') as HTMLElement;
const root = createRoot(container);
root.render(<App />);
console.log(`[renderer] loaded, time=${new Date().toISOString()}`);
window.addEventListener('beforeunload', () =>
  console.log('[renderer] beforeunload'),
);
window.addEventListener('unload', () => console.log('[renderer] unload'));
