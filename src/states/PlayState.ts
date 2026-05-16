import * as THREE from "three";
import type { Game } from "../engine/Game";
import type { GameState } from "./GameState";
import { MenuState } from "./MenuState";
import { PhysicsWorld } from "../physics/Physics";
import { Level } from "../world/Level";
import { Ship } from "../world/Ship";
import { WeaponSystem } from "../world/Weapons";
import { EnemySwarm } from "../world/Enemies";

/** The actual flying: test level + 6DOF ship + physics. */
export class PlayState implements GameState {
  private game!: Game;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(78, 1, 0.05, 800);

  private physics!: PhysicsWorld;
  private level!: Level;
  private ship!: Ship;
  private weapons!: WeaponSystem;
  private enemies!: EnemySwarm;

  private root!: HTMLElement;
  private pause!: HTMLElement;
  private speedEl!: HTMLElement;
  private coreEl!: HTMLElement;
  private energyEl!: HTMLElement;
  private enemyEl!: HTMLElement;
  private wantMenu = false;
  private musicKeyDown = false;

  private readonly tmpFwd = new THREE.Vector3();
  private readonly tmpRight = new THREE.Vector3();

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

    this.weapons = new WeaponSystem(this.physics.world, this.ship.rigidBody);
    this.scene.add(this.weapons.group);

    this.enemies = new EnemySwarm(this.game.sfx);
    this.enemies.spawn(this.level.enemySpawns);
    this.scene.add(this.enemies.group);

    // --- HUD ---
    this.root = document.createElement("div");
    this.root.className = "hud";
    this.root.innerHTML = `
      <div class="hud__crosshair"></div>
      <div class="hud__hint">CLICK TO FLY &middot; LMB FIRE &middot; ESC RELEASE MOUSE</div>
      <div class="hud__readout">
        COREFALL // TEST RUN<br />
        SPEED&nbsp;&nbsp;&nbsp; <span id="cf-speed">0</span> u/s<br />
        CORE&nbsp;&nbsp;&nbsp;&nbsp; <span id="cf-core">0</span> m<br />
        HOSTILES <span id="cf-enemies">0</span>
      </div>
      <div class="hud__weapon">
        <div class="hud__weapon-name">LASER</div>
        <div class="hud__energy"><div class="hud__energy-fill" id="cf-energy"></div></div>
      </div>
    `;
    game.container.appendChild(this.root);
    this.speedEl = this.root.querySelector<HTMLElement>("#cf-speed")!;
    this.coreEl = this.root.querySelector<HTMLElement>("#cf-core")!;
    this.energyEl = this.root.querySelector<HTMLElement>("#cf-energy")!;
    this.enemyEl = this.root.querySelector<HTMLElement>("#cf-enemies")!;

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
      this.game.sfx.start();
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

      if (this.game.input.isMouseDown(0)) {
        this.tmpFwd.set(0, 0, -1).applyQuaternion(this.ship.quaternion);
        this.tmpRight.set(1, 0, 0).applyQuaternion(this.ship.quaternion);
        if (
          this.weapons.tryFire(this.ship.position, this.tmpFwd, this.tmpRight)
        ) {
          this.game.sfx.laser();
        }
      }
      this.weapons.update(dt);
      this.enemies.update(dt, this.ship.position, this.weapons);

      this.speedEl.textContent = this.ship.speed.toFixed(0);
      this.coreEl.textContent = this.ship.position
        .distanceTo(this.level.corePosition)
        .toFixed(0);
      this.enemyEl.textContent = this.enemies.count.toFixed(0);
      const e = this.weapons.energy01;
      this.energyEl.style.width = `${(e * 100).toFixed(0)}%`;
      this.energyEl.classList.toggle("hud__energy-fill--low", e < 0.25);
    }

    this.game.renderer.render(this.scene, this.camera);
  }

  exit() {
    this.game.input.exitPointerLock();
    this.game.renderer.domElement.removeEventListener("click", this.onClick);
    this.root.remove();
    this.pause.remove();
    this.enemies.dispose();
    this.weapons.dispose();
    this.level.dispose();
    this.physics.dispose();
  }
}
