const app = document.getElementById("app");
if (!app) {
  throw new Error("Missing #app root element");
}

app.innerHTML = `
  <div id="boot" style="
    width:100%;
    height:100%;
    display:flex;
    align-items:center;
    justify-content:center;
    background:radial-gradient(circle at 20% 20%, #1b3046 0%, #0b1119 45%, #06090f 100%);
    color:#eaf3ff;
    font-family: Georgia, 'Times New Roman', serif;
  ">
    <div style="text-align:center; max-width:520px; padding:28px;">
      <div style="font-size:48px; font-weight:700; letter-spacing:0.6px;">ProChess</div>
      <div id="boot-status" style="margin-top:10px; font-size:20px; color:#b9cee5;">
        Loading game engine...
      </div>
      <div style="
        margin-top:18px;
        width:320px;
        height:8px;
        margin-left:auto;
        margin-right:auto;
        background:#1a2a3a;
        border-radius:999px;
        overflow:hidden;
      ">
        <div id="boot-bar" style="
          width:18%;
          height:100%;
          background:linear-gradient(90deg, #68b7ff 0%, #99dbff 100%);
          transition:width 280ms ease;
        "></div>
      </div>
    </div>
  </div>
`;

const bootStatus = document.getElementById("boot-status");
const bootBar = document.getElementById("boot-bar");
const setProgress = (percent: number, text: string): void => {
  if (bootStatus) bootStatus.textContent = text;
  if (bootBar) bootBar.style.width = `${percent}%`;
};

setProgress(24, "Loading game engine...");

if (import.meta.env.DEV && "serviceWorker" in navigator) {
  navigator.serviceWorker
    .getRegistrations()
    .then((regs) => Promise.all(regs.map((r) => r.unregister())))
    .catch(() => undefined);
}

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  });
}

void (async () => {
  setProgress(52, "Initializing board modules...");
  const { startGame } = await import("./startGame");
  setProgress(82, "Starting renderer...");
  startGame();
  setProgress(100, "Ready");
  const boot = document.getElementById("boot");
  if (boot) {
    boot.remove();
  }
})();
