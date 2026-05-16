import * as THREE from "three";
import type { Game } from "../engine/Game";
import type { GameState } from "./GameState";
import { MenuState } from "./MenuState";
import { PhysicsWorld } from "../physics/Physics";
import { Level } from "../world/Level";
import { Ship } from "../world/Ship";

/** The actual flying: test level + 6DOF ship + physics. */
export class PlayState implements GameState {
  private game!: Game;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(78, 1, 0.05, 800);

  private physics!: PhysicsWorld;
  private level!: Level;
  private ship!: Ship;

  private root!: HTMLElement;
  private pause!: HTMLElement;
  private speedEl!: HTMLElement;
  private wantMenu = false;
  private musicKeyDown = false;

  enter(game: Game) {
    this.game = game;

    const { width, height } = game.size;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    this.scene.background = new THREE.Color(0x04060a);
    this.scene.fog = new THREE.FogExp2(0x04060a, 0.012);

    this.physics = new PhysicsWorld();
    this.level = new Level(this.physics.world);
    this.scene.add(this.level.group);

    this.ship = new Ship(
      this.physics.world,
      this.level.spawnPosition,
      this.level.spawnQuaternion,
    );
    this.ship.syncCamera(this.camera);

    // --- HUD ---
    this.root = document.createElement("div");
    this.root.className = "hud";
    this.root.innerHTML = `
      <div class="hud__crosshair"></div>
      <div class="hud__hint">CLICK TO FLY &middot; ESC TO RELEASE MOUSE</div>
      <div class="hud__readout">
        COREFALL // TEST RUN<br />
        SPEED <span id="cf-speed">0</span> u/s
      </div>
    `;
    game.container.appendChild(this.root);
    this.speedEl = this.root.querySelector<HTMLElement>("#cf-speed")!;

    this.pause = document.createElement("div");
    this.pause.className = "menu";
    this.pause.innerHTML = `
      <h1 class="menu__title" style="font-size:clamp(2rem,7vw,4rem)">PAUSED</h1>
      <div class="menu__buttons">
        <button class="menu__btn" id="cf-resume">RESUME</button>
        <button class="menu__btn" id="cf-menu">MAIN MENU</button>
      </div>
    `;
    game.container.appendChild(this.pause);
    this.pause.querySelector<HTMLButtonElement>("#cf-resume")!.onclick = () =>
      this.game.input.requestPointerLock();
    this.pause.querySelector<HTMLButtonElement>("#cf-menu")!.onclick = () => {
      this.wantMenu = true;
    };

    this.onClick = () => {
      this.game.music.start();
      if (!this.game.input.isLocked) this.game.input.requestPointerLock();
    };
    game.renderer.domElement.addEventListener("click", this.onClick);
  }

  private onClick: () => void = () => {};

  update(dt: number) {
    const locked = this.game.input.isLocked;

    const nDown = this.game.input.isDown("KeyN");
    if (nDown && !this.musicKeyDown) this.game.music.toggleMute();
    this.musicKeyDown = nDown;

    if (this.wantMenu) {
      this.game.setState(new MenuState());
      return;
    }
    if (locked && this.game.input.isDown("KeyM")) {
      this.game.input.exitPointerLock();
      this.game.setState(new MenuState());
      return;
    }

    this.pause.classList.toggle("hidden", locked);

    if (locked) {
      this.ship.update(dt, this.game.input);
      this.physics.step(dt);
      this.ship.syncCamera(this.camera);
      this.level.update(dt);
      this.speedEl.textContent = this.ship.speed.toFixed(0);
    }

    this.game.renderer.render(this.scene, this.camera);
  }

  exit() {
    this.game.input.exitPointerLock();
    this.game.renderer.domElement.removeEventListener("click", this.onClick);
    this.root.remove();
    this.pause.remove();
    this.level.dispose();
    this.physics.dispose();
  }
}
