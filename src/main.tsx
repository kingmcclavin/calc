import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import 'katex/dist/katex.min.css';
import './styles/global.css';
import './styles/views.css';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';

/**
 * iOS Home-Screen apps with a translucent status bar report a viewport that is
 * shorter than the screen by about the status-bar height, leaving an empty strip
 * at the bottom. Measure the real height and expose it as --app-h.
 */
function trackAppHeight() {
  const standalone =
    (navigator as Navigator & { standalone?: boolean }).standalone === true || window.matchMedia('(display-mode: standalone)').matches;
  const update = () => {
    let h = window.innerHeight;
    if (standalone) {
      const portrait = window.innerHeight >= window.innerWidth;
      const full = portrait ? Math.max(screen.width, screen.height) : Math.min(screen.width, screen.height);
      // only correct small shortfalls (status bar / home indicator), never real resizes
      if (full > h && full - h < 120) h = full;
    }
    document.documentElement.style.setProperty('--app-h', `${h}px`);
  };
  update();
  window.addEventListener('resize', update);
  window.addEventListener('orientationchange', () => setTimeout(update, 300));
}
trackAppHeight();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
