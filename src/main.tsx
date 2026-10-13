import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App.tsx';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('#root 요소가 없다');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
