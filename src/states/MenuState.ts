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

    this.root = document.createElement("div");
    this.root.className = "menu";
    this.root.innerHTML = `
      <h1 class="menu__title">COREFALL</h1>
      <p class="menu__subtitle">DESCENT INTO THE CORE</p>
      <div class="menu__buttons">
        <button class="menu__btn" id="cf-start">START MISSION</button>
      </div>
      <div class="menu__controls">
        <b>Mouse</b> aim &nbsp;|&nbsp; <b>W/S</b> thrust &nbsp;|&nbsp; <b>A/D</b> strafe<br />
        <b>Space/C</b> up&middot;down &nbsp;|&nbsp; <b>Q/E</b> roll &nbsp;|&nbsp; <b>Shift</b> boost<br />
        <b>Esc</b> release mouse
      </div>
    `;
    game.container.appendChild(this.root);

    const start = () => this.game.setState(new PlayState());
    this.root.querySelector<HTMLButtonElement>("#cf-start")!.onclick = start;
    this.onKey = (e: KeyboardEvent) => {
      if (e.code === "Enter") start();
    };
    window.addEventListener("keydown", this.onKey);
  }

  private onKey: (e: KeyboardEvent) => void = () => {};

  update(dt: number) {
    this.core.rotation.y += dt * 0.4;
    this.core.rotation.x += dt * 0.15;
    this.game.renderer.render(this.scene, this.camera);
  }

  exit() {
    window.removeEventListener("keydown", this.onKey);
    this.root.remove();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose?.();
      const mat = m.material as THREE.Material | undefined;
      mat?.dispose?.();
    });
  }
}
