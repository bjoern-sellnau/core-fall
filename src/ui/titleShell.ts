/** Shared retro stage shell for the sub-screens (pilot, difficulty,
 * briefing, leaderboard) — same look as the title, scaled 1920x1080. */
export interface Shell {
  root: HTMLElement;
  panel: HTMLElement;
  fit: () => void;
  dispose: () => void;
}

export function makeShell(container: HTMLElement): Shell {
  const root = document.createElement("div");
  root.className = "cf-title stage-wrap";
  root.innerHTML = `
    <div class="stage" id="t-stage">
      <div class="wall l"></div>
      <div class="wall r"></div>
      <div class="stars"></div>
      <div class="haze"></div>
      <div class="grid-floor"></div>
      <div class="horizon"></div>
      <div class="bracket tl"></div><div class="bracket tr"></div>
      <div class="bracket bl"></div><div class="bracket br"></div>
      <div class="cf-center"><div class="panel" id="t-panel"></div></div>
      <div class="credit">
        <span>© 2026 LOONA! DESIGNS</span>
        <span class="mid">A GAME BY <span class="hot">BJOERN S.</span> · CODE BY <span class="hot">CLAUDE CODE</span></span>
        <span>RATED M · NOT FOR RESALE</span>
      </div>
      <div class="glitch"></div>
      <div class="crt"></div>
      <div class="vignette"></div>
    </div>
  `;
  container.appendChild(root);
  const stage = root.querySelector<HTMLElement>("#t-stage")!;
  const panel = root.querySelector<HTMLElement>("#t-panel")!;

  const fit = () => {
    const s = Math.min(
      window.innerWidth / 1920,
      window.innerHeight / 1080,
    );
    stage.style.transform = `scale(${s})`;
    stage.style.margin = `${(1080 * s - 1080) / 2}px ${(1920 * s - 1920) / 2}px`;
  };
  window.addEventListener("resize", fit);
  fit();
  requestAnimationFrame(fit);

  return {
    root,
    panel,
    fit,
    dispose: () => {
      window.removeEventListener("resize", fit);
      root.remove();
    },
  };
}
