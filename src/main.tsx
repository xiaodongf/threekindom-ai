import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.js';
import './index.css';
import { applyMotionPreference, loadMotionPreference } from './utils/motion.js';

applyMotionPreference(loadMotionPreference());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
