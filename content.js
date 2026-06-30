// Meldet echte Nutzerinteraktionen (Klick, Tastatur, Scroll) an den
// Background-Worker, damit ein Tab nicht neu geladen wird, während er
// gerade aktiv benutzt wird.

const THROTTLE_MS = 3000;
let lastSent = 0;

function reportActivity() {
  const now = Date.now();
  if (now - lastSent < THROTTLE_MS) return;
  lastSent = now;
  chrome.runtime.sendMessage({ type: "activity", timestamp: now }).catch(() => {
    // Background-Worker ggf. gerade nicht erreichbar, kann ignoriert werden
  });
}

["mousedown", "keydown", "scroll", "touchstart"].forEach(evt => {
  document.addEventListener(evt, reportActivity, { passive: true, capture: true });
});
