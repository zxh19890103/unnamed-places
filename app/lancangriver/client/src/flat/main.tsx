import React from 'react';
import { createRoot } from 'react-dom/client';
import 'leaflet/dist/leaflet.css';
import '@/styles.css';
import LeafletApp from './App.js';

const rootElement = document.getElementById('App') ?? document.body;

createRoot(rootElement).render(
  <React.StrictMode>
    <LeafletApp />
  </React.StrictMode>,
);
