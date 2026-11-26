import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.js';
import './index.css';
import { applyArtLook } from './utils/artLook.js';
import { applyMotionPreference, loadMotionPreference } from './utils/motion.js';

applyMotionPreference(loadMotionPreference());
applyArtLook();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
