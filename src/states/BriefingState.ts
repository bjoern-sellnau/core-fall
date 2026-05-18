import * as THREE from "three";
import type { Game } from "../engine/Game";
import type { GameState } from "./GameState";
import { PlayState } from "./PlayState";
import { MenuState } from "./MenuState";
import { LEVELS } from "../world/levels";
import { ROBOTS } from "../world/robotInfo";
import { WEAPONS } from "../world/weaponInfo";
import { makeShell, type Shell } from "../ui/titleShell";

interface Entry {
  label: string;
  role: string;
  threat: number; // 0 = weapon (no threat bar)
  body: number;
  emissive: number;
  make: () => THREE.BufferGeometry;
}

/** Per-level briefing with an animated 3D codex of rigs + new weapon. */
export class BriefingState implements GameState {
  private game!: Game;
  private shell!: Shell;

  private entries: Entry[] = [];
  private cur = 0;
  private cycle = 0;

  private renderer!: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(45, 360 / 280, 0.1, 100);
  private mesh: THREE.Mesh | null = null;

  private nameEl!: HTMLElement;
  private roleEl!: HTMLElement;
  private threatEl!: HTMLElement;
  private tabs: HTMLElement[] = [];

  enter(game: Game) {
    this.game = game;
    this.game.music.start();
    this.game.sfx.start();
    this.game.music.setScene("menu");
    const def = LEVELS[game.levelIndex];

    for (const k of [...new Set(def.kinds)]) {
      const r = ROBOTS[k];
      this.entries.push({
        label: r.label,
        role: r.role,
        threat: r.threat,
        body: r.body,
        emissive: r.emissive,
        make: r.make,
      });
    }
    const w = WEAPONS[def.weapon];
    this.entries.push({
      label: w.label,
      role: w.desc,
      threat: 0,
      body: w.body,
      emissive: w.emissive,
      make: w.make,
    });

    this.shell = makeShell(game.container);
    this.shell.panel.innerHTML = `
      <div class="step">MISSION ${game.levelIndex + 1} / ${LEVELS.length}</div>
      <h2>${def.name}</h2>
      <div class="meta">
        <div><div class="k">Planet</div><div class="v">${def.planet}</div></div>
        <div><div class="k">Operator</div><div class="v">${def.company}</div></div>
        <div><div class="k">Threat</div><div class="v">TIER ${def.tier}</div></div>
      </div>
      <div class="brief-txt">${def.brief}</div>
      <div class="field">Rig Database &amp; New Armory</div>
      <div class="codex">
        <div class="codex-view" id="t-view"></div>
        <div class="codex-info">
          <div class="codex-name" id="t-rname"></div>
          <div class="codex-role" id="t-rrole"></div>
          <div class="codex-threat" id="t-rthreat"></div>
          <div class="codex-tabs" id="t-rtabs">
            ${this.entries
              .map(
                (e, i) =>
                  `<div class="codex-tab${i === 0 ? " sel" : ""}" data-i="${i}">${e.label}</div>`,
              )
              .join("")}
          </div>
        </div>
      </div>
      <div class="actions">
        <div class="act sel" id="t-go">LAUNCH</div>
        <div class="act" id="t-menu">ABORT</div>
      </div>
    `;

    this.nameEl = this.shell.panel.querySelector<HTMLElement>("#t-rname")!;
    this.roleEl = this.shell.panel.querySelector<HTMLElement>("#t-rrole")!;
    this.threatEl = this.shell.panel.querySelector<HTMLElement>("#t-rthreat")!;
    this.tabs = [
      ...this.shell.panel.querySelectorAll<HTMLElement>(".codex-tab"),
    ];
    this.tabs.forEach((t, i) =>
      t.addEventListener("click", () => this.show(i)),
    );

    const host = this.shell.panel.querySelector<HTMLElement>("#t-view")!;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(360, 280, false);
    host.appendChild(this.renderer.domElement);
    this.camera.position.set(0, 0.6, 8);
    this.camera.lookAt(0, 0, 0);
    this.scene.add(new THREE.AmbientLight(0x556070, 1.4));
    const l1 = new THREE.PointLight(0xffd0a0, 120, 40, 2);
    l1.position.set(6, 5, 8);
    const l2 = new THREE.PointLight(0x6fd0ff, 80, 40, 2);
    l2.position.set(-7, -4, 4);
    this.scene.add(l1, l2);

    this.show(0);

    this.shell.panel
      .querySelector<HTMLElement>("#t-go")!
      .addEventListener("click", () => this.launch());
    this.shell.panel
      .querySelector<HTMLElement>("#t-menu")!
      .addEventListener("click", () => this.game.setState(new MenuState()));
    window.addEventListener("keydown", this.onKey);
  }

  private show(i: number) {
    this.cur = (i + this.entries.length) % this.entries.length;
    this.cycle = 0;
    const spec = this.entries[this.cur];
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.geometry.dispose();
      (this.mesh.material as THREE.Material).dispose();
    }
    this.mesh = new THREE.Mesh(
      spec.make(),
      new THREE.MeshStandardMaterial({
        color: spec.body,
        emissive: spec.emissive,
        emissiveIntensity: 1.2,
        metalness: 0.6,
        roughness: 0.4,
      }),
    );
    this.scene.add(this.mesh);
    this.nameEl.textContent = spec.label;
    this.roleEl.textContent = spec.role;
    this.threatEl.innerHTML =
      spec.threat > 0
        ? `THREAT <b>${"■".repeat(spec.threat)}${"·".repeat(5 - spec.threat)}</b>`
        : `<b style="color:#ffe27a">◆ NEW WEAPON SYSTEM</b>`;
    this.tabs.forEach((t, idx) => t.classList.toggle("sel", idx === this.cur));
    this.game.sfx.weaponSelect();
  }

  private launch() {
    this.game.sfx.pickup();
    this.game.music.setScene("game");
    this.game.setState(new PlayState());
  }

  private onKey = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") this.launch();
    else if (e.key === "Escape") this.game.setState(new MenuState());
    else if (e.key === "ArrowRight") this.show(this.cur + 1);
    else if (e.key === "ArrowLeft") this.show(this.cur - 1);
  };

  update(dt: number) {
    if (this.mesh) {
      this.mesh.rotation.y += dt * 0.9;
      this.mesh.rotation.x += dt * 0.35;
    }
    this.cycle += dt;
    if (this.cycle > 5 && this.entries.length > 1) this.show(this.cur + 1);
    this.renderer.render(this.scene, this.camera);
  }

  exit() {
    window.removeEventListener("keydown", this.onKey);
    if (this.mesh) {
      this.mesh.geometry.dispose();
      (this.mesh.material as THREE.Material).dispose();
    }
    this.renderer.dispose();
    this.shell.dispose();
  }
}
