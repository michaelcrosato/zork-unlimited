import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App, { JOURNEY_SAVE_KEY, LEGACY_OVERWORLD_SAVE_KEY } from "./App.js";
import { AppErrorBoundary } from "./ErrorBoundary.js";
import "./styles.css";

function reload(): void {
  window.location.reload();
}

/**
 * The crash the boundary caught is almost always reproducible from the saved
 * journey, so a plain reload would land the player straight back on it. Clear
 * both save keys — the current one and the legacy one `App` still migrates —
 * before reloading, so this button is a real way back into the game.
 */
function discardSavedJourney(): void {
  try {
    window.localStorage.removeItem(JOURNEY_SAVE_KEY);
    window.localStorage.removeItem(LEGACY_OVERWORLD_SAVE_KEY);
  } catch {
    // Storage can be blocked outright; the reload below is still worth doing.
  }
  reload();
}

const el = document.getElementById("root");
if (!el) throw new Error("missing #root");
createRoot(el).render(
  <StrictMode>
    <AppErrorBoundary onReload={reload} onDiscardSave={discardSavedJourney}>
      <App />
    </AppErrorBoundary>
  </StrictMode>,
);
