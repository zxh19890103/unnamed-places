import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@/styles.css';
import App from './App.js';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element #root was not found.');
}

import('@/_geometries').then((meta) => {
  createRoot(rootElement).render(
    <StrictMode>
      <App components={meta} />
    </StrictMode>,
  );
});
