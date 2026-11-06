import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// Stage 1 ships the simulation engine only (src/sim). The UI arrives in Stage 2.
function Placeholder() {
  return <p>Unintended Consequences — engine only. Run <code>npm run sim</code>.</p>;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Placeholder />
  </StrictMode>,
);
