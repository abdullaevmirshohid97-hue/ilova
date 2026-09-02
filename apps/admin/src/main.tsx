import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import App from './App';
import XatoChegarasi from './components/XatoChegarasi';
import { XabarProvider } from './components/Xabar';
import { telemetriyaniYoq } from './lib/xatolik';

// Tutilmagan xatolar jurnalga tushsin (0-bosqich: telemetriya)
telemetriyaniYoq();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <XatoChegarasi>
      <BrowserRouter>
        <XabarProvider>
          <App />
        </XabarProvider>
      </BrowserRouter>
    </XatoChegarasi>
  </StrictMode>
);
