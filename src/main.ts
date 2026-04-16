import Phaser from "phaser";
import { connect } from "./network/socket";
import { ProChessScene } from "./game/ProChessScene";

// Import premium UI styles
import '/src/styles/tokens.css';
import '/src/styles/glass.css';
import '/src/styles/animations.css';
import '/src/styles/responsive.css';
import '/src/styles/main-menu.css';
import '/src/styles/hud-top-bar.css';
import '/src/styles/control-bar.css';
import '/src/styles/side-panel.css';
import '/src/styles/engagement-zone.css';

// ─── App root ─────────────────────────────────────────────────────────────────

const app = document.getElementById("app");
if (!app) throw new Error("Missing #app root element");

// ─── Premium loading screen ────────────────────────────────────────────────────
app.innerHTML = `
  <div id="toast" style="
    position:fixed;bottom:32px;left:50%;transform:translateX(-50%);
    min-width:220px;max-width:420px;padding:16px 32px;border-radius:10px;
    background:#1e7c3a;color:#fff;font-size:1.1rem;z-index:1500;
    box-shadow:0 2px 16px #0006;opacity:0;pointer-events:none;transition:opacity 0.3s;
  "></div>

  <div id="boot" style="
    position:fixed;inset:0;width:100%;height:100%;
    display:flex;align-items:center;justify-content:center;
    background:linear-gradient(135deg, rgba(18,18,26,0.95) 0%, rgba(26,26,37,0.7) 100%);
    color:#eaf3ff;font-family:Georgia,'Times New Roman',serif;z-index:900;
  ">
    <div style="
      text-align:center;max-width:520px;padding:48px 40px;
      background:linear-gradient(135deg, rgba(18,18,26,0.9) 0%, rgba(26,26,37,0.6) 100%);
      border:1px solid rgba(0,212,255,0.25);border-radius:16px;
      box-shadow:0 0 40px rgba(0,212,255,0.1), 0 24px 70px rgba(0,0,0,0.45);
      backdrop-filter:blur(20px);
    ">
      <div style="
        font-size:64px;font-weight:800;letter-spacing:2px;
        background:linear-gradient(135deg, #f4c95d 0%, #ffffff 50%, #00d4ff 100%);
        -webkit-background-clip:text;-webkit-text-fill-color:transparent;
        background-clip:text;animation:pulse-ring 2s ease-in-out infinite;
      ">⚡ ProChess ⚡</div>
      <div style="
        margin-top:8px;font-size:16px;color:#00d4ff;letter-spacing:1px;
        text-transform:uppercase;font-weight:600;
      ">TACTICAL HEX WARFARE</div>
      <div id="boot-status" style="
        margin-top:20px;font-size:18px;color:#b9cee5;
        transition:color 0.3s ease;
      ">Loading game engine...</div>
      <div style="much:32px;width:320px;height:10px;margin-left:auto;margin-right:auto;background:rgba(20,32,48,0.88);border-radius:999px;overflow:hidden;box-shadow:inset 0 0 0 1px rgba(0,212,255,0.2);">
        <div id="boot-bar" style="
          width:8%;height:100%;
          background:linear-gradient(90deg, #00d4ff 0%, #0088ff 50%, #1a1a6a 100%);
          box-shadow:0 0 20px rgba(0,212,255,0.5);
          transition:width 280ms ease;
        "></div>
      </div>
      <div style="margin-top:24px;font-size:12px;color:#7c9ec9;opacity:0.8;">
        v1.0.0 • Crystalline Depth Design System
      </div>
    </div>
  </div>
`;

// ─── Boot progress ─────────────────────────────────────────────────────────────
const bootStatus = document.getElementById("boot-status");
const bootBar = document.getElementById("boot-bar");
function setProgress(percent: number, text: string): void {
  if (bootStatus) bootStatus.textContent = text;
  if (bootBar) bootBar.style.width = `${percent}%`;
}

// ─── Toast notifications ────────────────────────────────────────────────────────
function showToast(message: string, success = true): void {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.style.background = success ? "#1e7c3a" : "#b91c1c";
  toast.style.opacity = "0.97";
  setTimeout(() => { (toast as HTMLElement).style.opacity = "0"; }, 3200);
}

// ─── Service workers ───────────────────────────────────────────────────────────
const isLocalhost =
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1";

function clearRuntimeCaches(): Promise<void> {
  if (!("caches" in window)) {
    return Promise.resolve();
  }
  return caches
    .keys()
    .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
    .then(() => undefined)
    .catch(() => undefined);
}

if ((import.meta.env.DEV || isLocalhost) && "serviceWorker" in navigator) {
  navigator.serviceWorker
    .getRegistrations()
    .then((regs) => Promise.all(regs.map((registration) => registration.unregister())))
    .then(() => clearRuntimeCaches())
    .catch(() => undefined);
}

if (import.meta.env.PROD && !isLocalhost && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  });
}

window.addEventListener("beforeunload", () => {
  const game = (window as typeof window & { __prochessGame?: Phaser.Game }).__prochessGame;
  if (game) {
    game.destroy(true);
    (window as typeof window & { __prochessGame?: Phaser.Game }).__prochessGame = undefined;
  }
});

// ─── Connect multiplayer ───────────────────────────────────────────────────────
connect();

// ─── Game initialization ──────────────────────────────────────────────────────
setProgress(24, "Loading game engine...");

void (async () => {
  setProgress(52, "Initializing board modules...");
  const { startGame } = await import("./startGame");
  setProgress(82, "Starting renderer...");
  const game = startGame();
  (window as typeof window & { __prochessGame?: unknown }).__prochessGame = game;
  setProgress(100, "Ready!");
  setTimeout(() => {
    const boot = document.getElementById("boot");
    if (boot) boot.remove();
  }, 400);
})();
