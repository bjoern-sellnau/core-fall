import * as THREE from "three";
import type { Game } from "../engine/Game";
import type { GameState } from "./GameState";
import { PlayState } from "./PlayState";

/** Main menu: COREFALL title screen with a slowly tumbling core behind it. */
export class MenuState implements GameState {
  private game!: Game;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
  private core!: THREE.Object3D;
  private root!: HTMLElement;

  enter(game: Game) {
    this.game = game;

    const { width, height } = game.size;
    this.camera.aspect = width / height;
    this.camera.position.set(0, 0, 16);
    this.camera.updateProjectionMatrix();

    this.scene.fog = new THREE.FogExp2(0x04060a, 0.05);

    const coreGroup = new THREE.Group();
    coreGroup.add(
      new THREE.Mesh(
        new THREE.IcosahedronGeometry(5, 1),
        new THREE.MeshStandardMaterial({
          color: 0x123040,
          emissive: 0xff7b1a,
          emissiveIntensity: 0.7,
          metalness: 0.4,
          roughness: 0.4,
        }),
      ),
    );
    coreGroup.add(
      new THREE.LineSegments(
        new THREE.WireframeGeometry(new THREE.IcosahedronGeometry(7, 1)),
        new THREE.LineBasicMaterial({
          color: 0x38f0e6,
          transparent: true,
          opacity: 0.4,
        }),
      ),
    );
    this.core = coreGroup;
    this.scene.add(coreGroup);

    this.scene.add(new THREE.AmbientLight(0x223344, 1.2));
    const key = new THREE.PointLight(0xff8a2a, 200, 60, 2);
    key.position.set(6, 4, 10);
    this.scene.add(key);

    const names = ["ROOKIE", "PILOT", "ACE", "VETERAN", "INSANE"];
    const diffBtns = names
      .map(
        (n, i) =>
          `<button class="menu__diff-btn" data-d="${i + 1}">${i + 1} ${n}</button>`,
      )
      .join("");

    this.root = document.createElement("div");
    this.root.className = "menu";
    this.root.innerHTML = `
      <h1 class="menu__title">COREFALL</h1>
      <p class="menu__subtitle">DESCENT INTO THE CORE</p>
      <div class="menu__diff-label">DIFFICULTY</div>
      <div class="menu__diff">${diffBtns}</div>
      <div class="menu__diff-label">MENU THEME</div>
      <div class="menu__diff" id="cf-theme">
        <button class="menu__diff-btn" data-t="2">V2 POP</button>
        <button class="menu__diff-btn" data-t="1">V1 CALM</button>
      </div>
      <div class="menu__buttons">
        <button class="menu__btn" id="cf-start">START MISSION</button>
      </div>
      <div class="menu__controls">
        <b>Mouse</b> aim &nbsp;|&nbsp; <b>LMB</b> laser &nbsp;|&nbsp; <b>RMB</b> rocket &nbsp;|&nbsp; <b>W/S</b> thrust<br />
        <b>A/D</b> strafe &nbsp;|&nbsp; <b>Space/C</b> up&middot;down &nbsp;|&nbsp; <b>Q</b> roll&nbsp;L &nbsp;|&nbsp; <b>E</b> roll&nbsp;R &nbsp;|&nbsp; <b>R</b> reset rotation &nbsp;|&nbsp; <b>Shift</b> boost<br />
        <b>V</b> view &nbsp;|&nbsp; <b>M</b> map &nbsp;|&nbsp; <b>Esc</b> release mouse &nbsp;|&nbsp; <b>N</b> music on/off
      </div>
    `;
    game.container.appendChild(this.root);

    const diffButtons =
      this.root.querySelectorAll<HTMLButtonElement>(".menu__diff-btn");
    const paint = () => {
      diffButtons.forEach((b) => {
        const on = Number(b.dataset.d) === this.game.difficulty;
        b.classList.toggle("menu__diff-btn--on", on);
      });
    };
    diffButtons.forEach((b) => {
      b.onclick = () => {
        this.game.difficulty = Number(b.dataset.d);
        paint();
      };
    });

    const themeBtns = this.root.querySelectorAll<HTMLButtonElement>(
      "#cf-theme .menu__diff-btn",
    );
    const paintTheme = () => {
      themeBtns.forEach((b) => {
        const on = Number(b.dataset.t) === this.game.music.menuTheme;
        b.classList.toggle("menu__diff-btn--on", on);
      });
    };
    themeBtns.forEach((b) => {
      b.onclick = () => {
        // Clicking is a gesture: make sure audio is running, then
        // switch the menu track so it can be previewed right away.
        this.game.music.start();
        this.game.sfx.start();
        this.game.music.setScene("menu");
        this.game.music.setMenuTheme(Number(b.dataset.t) as 1 | 2);
        paintTheme();
      };
    });
    paintTheme();
    paint();

    const start = () => {
      this.game.music.start();
      this.game.sfx.start();
      this.game.music.setScene("game");
      this.game.setState(new PlayState());
    };
    this.root.querySelector<HTMLButtonElement>("#cf-start")!.onclick = start;
    this.onKey = (e: KeyboardEvent) => {
      if (e.code === "Enter") start();
    };
    // Browsers need a gesture before audio: kick off menu music on the
    // first interaction anywhere in the menu.
    this.onPointer = () => {
      this.game.music.start();
      this.game.sfx.start();
      this.game.music.setScene("menu");
    };
    window.addEventListener("keydown", this.onKey);
    window.addEventListener("pointerdown", this.onPointer, { once: true });
  }

  private onKey: (e: KeyboardEvent) => void = () => {};
  private onPointer: () => void = () => {};

  update(dt: number) {
    this.core.rotation.y += dt * 0.4;
    this.core.rotation.x += dt * 0.15;
    this.game.renderer.render(this.scene, this.camera);
  }

  exit() {
    window.removeEventListener("keydown", this.onKey);
    window.removeEventListener("pointerdown", this.onPointer);
    this.root.remove();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose?.();
      const mat = m.material as THREE.Material | undefined;
      mat?.dispose?.();
    });
  }
}
