import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './styles/app.css';

const appTitle = 'Premiumin Plus - Platform Produk Digital Premium';
const appDescription = 'Premiumin Plus adalah platform produk digital premium untuk member, reseller, deposit saldo, order otomatis, dan bot WhatsApp pribadi.';

document.title = appTitle;
document.querySelector('meta[name="application-name"]')?.setAttribute('content', 'Premiumin Plus');
document.querySelector('meta[name="description"]')?.setAttribute('content', appDescription);
document.querySelector('meta[property="og:site_name"]')?.setAttribute('content', 'Premiumin Plus');
document.querySelector('meta[property="og:title"]')?.setAttribute('content', appTitle);
document.querySelector('meta[property="og:description"]')?.setAttribute('content', appDescription);
document.querySelector('meta[name="twitter:title"]')?.setAttribute('content', 'Premiumin Plus');

// Entry point ini hanya menyalakan React dan stylesheet utama.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
