import type { Game } from "../engine/Game";
import type { GameState } from "./GameState";
import { PilotState } from "./PilotState";
import { DifficultyState } from "./DifficultyState";
import { LeaderboardState } from "./LeaderboardState";
import { LEVELS } from "../world/levels";

/** Retro 90s Descent-style COREFALL title screen (from Claude Design). */
export class MenuState implements GameState {
  private game!: Game;
  private root!: HTMLElement;
  private menuEl!: HTMLElement;
  private idleEl!: HTMLElement;
  private pressEl!: HTMLElement;
  private listEl!: HTMLElement;
  private titleEl!: HTMLElement;
  private toastEl!: HTMLElement;

  private armed = false;
  private view: "main" | "missions" | "options" = "main";
  private sel = 0;
  private items: HTMLElement[] = [];
  private depthTimer = 0;
  private toastTimer = 0;

  enter(game: Game) {
    this.game = game;

    this.root = document.createElement("div");
    this.root.className = "cf-title stage-wrap";
    this.root.innerHTML = `
      <div class="stage" id="t-stage">
        <div class="wall l"></div>
        <div class="wall r"></div>
        <div class="stars"></div>
        <div class="haze"></div>
        <div class="grid-floor"></div>
        <div class="horizon"></div>
        <div class="beam b1" id="t-beam1"></div>
        <div class="beam b2" id="t-beam2"></div>
        <svg class="tunnel" viewBox="-500 -250 1000 500" id="t-tunnel"></svg>
        <div id="t-cores"></div>
        <div class="bracket tl"></div><div class="bracket tr"></div>
        <div class="bracket bl"></div><div class="bracket br"></div>
        <div class="hud">
          <div class="tl">
            <div><span class="tag">SYS</span> ::: COREFALL.EXE v1.04</div>
            <div><span class="tag">MEM</span> 0x7F.AC00 — OK</div>
            <div><span class="tag">VID</span> VGA 320×240 / 256C</div>
            <div><span class="tag">DRILL</span> <span class="ok">ARMED</span></div>
          </div>
          <div class="tr">
            <div><span class="tag">DEPTH</span> -<span id="t-depth">04127</span> M</div>
            <div><span class="tag">O₂</span> 88% <span class="bar"><i style="width:88%;background:#7dd14a"></i></span></div>
            <div><span class="tag">HEAT</span> 412°C <span class="bar"><i style="width:64%"></i></span></div>
            <div><span class="warn">ALERT</span> HOSTILE RIGS · SECTOR XR-9</div>
          </div>
        </div>
        <div class="core-mark"></div>
        <div class="logo-wrap">
          <div class="kicker">Nexus<span class="sep">◆</span>Mining<span class="sep">◆</span>Cooperation</div>
          <div class="logo" aria-label="COREFALL">COREFALL</div>
          <div class="subtitle"><span class="em">Off-World</span> <span class="pipe">|</span> Mining Bots <span class="pipe">|</span> Have <span class="em">Gone Rogue</span></div>
          <div class="hazard"></div>
        </div>
        <nav class="menu" id="t-menu" aria-label="Main menu" hidden>
          <span class="nail tl"></span><span class="nail tr"></span>
          <span class="nail bl"></span><span class="nail br"></span>
          <h3><span id="t-mtitle">NEXUS DATA LINK NETWORK</span></h3>
          <ul id="t-list"></ul>
        </nav>
        <div class="idle-hint" id="t-idle">
          <div class="warn-line">⚠  TRANSMISSION FROM XR-9 · ORE COLONY OFFLINE  ⚠</div>
          <div class="press big">PRESS <span class="k">ENTER</span> TO ACKNOWLEDGE</div>
          <div class="sub-line">· · ·  ROGUE EXTRACTION UNITS DETECTED  · · ·</div>
        </div>
        <div class="press post" id="t-press" hidden>USE <span class="k">▲ ▼</span> TO SELECT · <span class="k">ENTER</span> TO CONFIRM</div>
        <div class="credit">
          <span>© 2026 LOONA! DESIGNS</span>
          <span class="mid">A GAME BY <span class="hot">BJOERN S.</span> · CODE BY <span class="hot">CLAUDE CODE</span></span>
          <span>RATED M · NOT FOR RESALE</span>
        </div>
        <div class="glitch"></div>
        <div class="crt"></div>
        <div class="vignette"></div>
        <div class="toast" id="t-toast">LOADING…</div>
      </div>
    `;
    game.container.appendChild(this.root);

    this.menuEl = this.root.querySelector<HTMLElement>("#t-menu")!;
    this.idleEl = this.root.querySelector<HTMLElement>("#t-idle")!;
    this.pressEl = this.root.querySelector<HTMLElement>("#t-press")!;
    this.listEl = this.root.querySelector<HTMLElement>("#t-list")!;
    this.titleEl = this.root.querySelector<HTMLElement>("#t-mtitle")!;
    this.toastEl = this.root.querySelector<HTMLElement>("#t-toast")!;

    this.buildScenery();
    this.renderList();

    window.addEventListener("keydown", this.onKey);
    window.addEventListener("resize", this.fit);
    this.root.addEventListener("click", this.onClick);
    this.fit();
    requestAnimationFrame(this.fit);
  }

  // --- fixed-stage scaling (from the design) ---
  private fit = () => {
    const stage = this.root.querySelector<HTMLElement>("#t-stage");
    if (!stage) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const s = Math.min(w / 1920, h / 1080);
    stage.style.transform = `scale(${s})`;
    stage.style.margin = `${(1080 * s - 1080) / 2}px ${(1920 * s - 1920) / 2}px`;
  };

  private buildScenery() {
    const svg = this.root.querySelector("#t-tunnel")!;
    const N = 14;
    for (let i = 0; i < N; i++) {
      const r = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "polygon",
      );
      const pts: string[] = [];
      const sides = 8;
      const R = 480;
      for (let k = 0; k < sides; k++) {
        const a = (k / sides) * Math.PI * 2 + Math.PI / sides;
        pts.push(
          `${(Math.cos(a) * R).toFixed(1)},${(Math.sin(a) * R * 0.55).toFixed(1)}`,
        );
      }
      r.setAttribute("points", pts.join(" "));
      r.setAttribute("class", "ring" + (i % 3 === 0 ? " b" : ""));
      (r as SVGElement).style.animationDelay = `${-(i / N) * 4.2}s`;
      svg.appendChild(r);
    }

    const cores = this.root.querySelector("#t-cores")!;
    for (let i = 0; i < 18; i++) {
      const c = document.createElement("div");
      c.className = "core";
      c.style.left = `${Math.random() * 1920}px`;
      const d = 6 + Math.random() * 9;
      c.style.animationDuration = `${d}s`;
      c.style.animationDelay = `${-Math.random() * d}s`;
      c.style.opacity = `${0.35 + Math.random() * 0.65}`;
      c.style.transform = `scale(${0.5 + Math.random() * 1.4}) rotate(45deg)`;
      cores.appendChild(c);
    }

    for (const id of ["#t-beam1", "#t-beam2"]) {
      const b = this.root.querySelector(id)!;
      for (let i = 0; i < 22; i++) {
        const r = document.createElement("span");
        r.className = "rivet";
        r.style.left = `${(i + 0.5) * (100 / 22)}%`;
        b.appendChild(r);
      }
    }
  }

  // --- menu views ---
  private renderList() {
    let html = "";
    if (this.view === "main") {
      this.titleEl.textContent = "NEXUS DATA LINK NETWORK";
      const rows = [
        ["Story", ""],
        ["Missions", `${LEVELS.length} OPS`],
        ["Leaderboard", "RANKS"],
        ["Options", "CFG"],
        ["Level Editor", "— LOCKED —"],
      ];
      html = rows
        .map(
          ([l, h], i) =>
            `<li data-i="${i}"${i === 4 ? ' class="lock"' : ""}><span class="cursor">▶</span><span class="label">${l}</span><span class="hint">${h}</span></li>`,
        )
        .join("");
    } else if (this.view === "missions") {
      this.titleEl.textContent = "MISSION ARCHIVE";
      html =
        LEVELS.map(
          (lv, i) =>
            `<li data-i="${i}"><span class="cursor">▶</span><span class="label">${i + 1}. ${lv.name}</span><span class="hint">TIER ${lv.tier}</span></li>`,
        ).join("") +
        `<li data-i="${LEVELS.length}"><span class="cursor">▶</span><span class="label">Back</span><span class="hint"></span></li>`;
    } else {
      this.titleEl.textContent = "OPERATOR CONFIG";
      html = `
        <li data-i="0"><span class="cursor">▶</span><span class="label">Menu Theme</span><span class="hint">${this.game.music.menuTheme === 2 ? "V2 POP" : "V1 CALM"}</span></li>
        <li data-i="1"><span class="cursor">▶</span><span class="label">Back</span><span class="hint"></span></li>`;
    }
    this.listEl.innerHTML = html;
    this.items = [...this.listEl.querySelectorAll<HTMLElement>("li")];
    this.sel = 0;
    this.paint();
    this.items.forEach((el, idx) => {
      el.addEventListener("mouseenter", () => {
        this.sel = idx;
        this.paint();
      });
      el.addEventListener("click", () => this.choose(idx));
    });
  }

  private paint() {
    this.items.forEach((el, idx) =>
      el.classList.toggle("sel", idx === this.sel),
    );
  }

  private arm() {
    if (this.armed) return;
    this.armed = true;
    this.idleEl.style.display = "none";
    this.menuEl.hidden = false;
    this.menuEl.classList.add("show");
    this.pressEl.hidden = false;
    this.game.music.start();
    this.game.sfx.start();
    this.game.music.setScene("menu");
    this.game.sfx.weaponSelect();
  }

  private toast(txt: string, ok: boolean) {
    this.toastEl.textContent = txt;
    this.toastEl.style.borderColor = ok ? "#ffd166" : "#ff2e63";
    this.toastEl.style.display = "block";
    this.toastTimer = 0.9;
  }

  private choose(idx: number) {
    this.sel = idx;
    this.paint();
    if (this.view === "main") {
      if (idx === 0) {
        this.game.mode = "story";
        this.game.levelIndex = 0;
        this.game.sfx.pickup();
        this.game.setState(new PilotState());
      } else if (idx === 1) {
        this.view = "missions";
        this.game.sfx.weaponSelect();
        this.renderList();
      } else if (idx === 2) {
        this.game.sfx.pickup();
        this.game.setState(new LeaderboardState());
      } else if (idx === 3) {
        this.view = "options";
        this.game.sfx.weaponSelect();
        this.renderList();
      } else {
        this.toast("— LOCKED —", false);
        this.game.sfx.hit();
      }
    } else if (this.view === "missions") {
      if (idx === LEVELS.length) {
        this.view = "main";
        this.game.sfx.weaponSelect();
        this.renderList();
      } else {
        this.game.mode = "mission";
        this.game.levelIndex = idx;
        this.game.sfx.pickup();
        this.game.setState(new DifficultyState());
      }
    } else {
      if (idx === 0) {
        this.game.music.setMenuTheme(this.game.music.menuTheme === 2 ? 1 : 2);
        this.game.sfx.weaponSelect();
        this.renderList();
        this.sel = 0;
        this.paint();
      } else {
        this.view = "main";
        this.game.sfx.weaponSelect();
        this.renderList();
      }
    }
  }

  private onKey = (e: KeyboardEvent) => {
    if (!this.armed) {
      if (e.key === "Enter" || e.key === " ") {
        this.arm();
        e.preventDefault();
      }
      return;
    }
    if (e.key === "ArrowDown") {
      this.sel = (this.sel + 1) % this.items.length;
      this.paint();
      this.game.sfx.weaponSelect();
      e.preventDefault();
    } else if (e.key === "ArrowUp") {
      this.sel = (this.sel - 1 + this.items.length) % this.items.length;
      this.paint();
      this.game.sfx.weaponSelect();
      e.preventDefault();
    } else if (e.key === "Enter") {
      this.choose(this.sel);
      e.preventDefault();
    } else if (e.key === "Escape") {
      if (this.view !== "main") {
        this.view = "main";
        this.renderList();
        this.game.sfx.weaponSelect();
      } else {
        this.armed = false;
        this.menuEl.classList.remove("show");
        this.menuEl.hidden = true;
        this.pressEl.hidden = true;
        this.idleEl.style.display = "block";
        this.game.sfx.hit();
      }
    }
  };

  private onClick = (e: MouseEvent) => {
    if (!this.armed && !(e.target as HTMLElement).closest("#t-menu")) {
      this.arm();
    }
  };

  update(dt: number) {
    this.depthTimer += dt;
    if (this.depthTimer >= 0.7) {
      this.depthTimer = 0;
      const el = this.root.querySelector<HTMLElement>("#t-depth");
      if (el) {
        const d =
          (parseInt(el.textContent || "4127", 10) || 4127) +
          1 +
          Math.floor(Math.random() * 3);
        el.textContent = String(d).padStart(5, "0");
      }
    }
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toastEl.style.display = "none";
    }
  }

  exit() {
    window.removeEventListener("keydown", this.onKey);
    window.removeEventListener("resize", this.fit);
    this.root.remove();
  }
}
