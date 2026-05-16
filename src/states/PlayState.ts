import * as THREE from "three";
import type { Game } from "../engine/Game";
import type { GameState } from "./GameState";
import { MenuState } from "./MenuState";
import { PhysicsWorld } from "../physics/Physics";
import { Level } from "../world/Level";
import { Ship } from "../world/Ship";
import { WeaponSystem } from "../world/Weapons";
import { EnemySwarm, difficultyConfig } from "../world/Enemies";
import { PickupField, type PickupKind } from "../world/Pickups";

const PICKUP_INFO: Record<PickupKind, { css: string; label: string }> = {
  health: { css: "#44ff88", label: "HULL +35" },
  shield: { css: "#46d8ff", label: "SHIELD UP" },
  rockets: { css: "#ff9a3a", label: "ROCKETS +6" },
  laser: { css: "#ff5ce0", label: "LASER UP" },
};

const MAX_HULL = 100;
const MAX_SHIELD = 100;
const SHIELD_REGEN = 14; // per s
const SHIELD_DELAY = 4; // s after a hit before shield regenerates
const INVULN = 2; // s of invulnerability after respawn
const HEALTH_PICKUP = 35;
const ROCKET_PICKUP = 6;

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
  private pickups!: PickupField;

  private hull = MAX_HULL;
  private shield = MAX_SHIELD;
  private shieldDelay = 0;
  private invuln = 0;

  private root!: HTMLElement;
  private pause!: HTMLElement;
  private speedEl!: HTMLElement;
  private coreEl!: HTMLElement;
  private energyEl!: HTMLElement;
  private enemyEl!: HTMLElement;
  private hullEl!: HTMLElement;
  private shieldEl!: HTMLElement;
  private rktEl!: HTMLElement;
  private laserEl!: HTMLElement;
  private factoryEl!: HTMLElement;
  private flashEl!: HTMLElement;
  private pickupEl!: HTMLElement;
  private flashT = 0;
  private flashColor = "#fff";
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
    this.scene.fog = new THREE.FogExp2(0x0a141e, 0.0075);

    this.physics = new PhysicsWorld();
    this.level = new Level(this.physics.world);
    this.scene.add(this.level.group);

    this.ship = new Ship(
      this.physics.world,
      this.level.spawnPosition,
      this.level.spawnQuaternion,
    );
    this.ship.syncCamera(this.camera);

    this.weapons = new WeaponSystem(
      this.physics.world,
      this.ship.rigidBody,
      this.game.sfx,
    );
    this.scene.add(this.weapons.group);

    this.enemies = new EnemySwarm(
      this.game.sfx,
      difficultyConfig(this.game.difficulty),
    );
    this.enemies.spawn(this.level.enemySpawns, this.level.factorySpawns);
    this.scene.add(this.enemies.group);

    this.pickups = new PickupField(this.game.sfx);
    this.pickups.spawn(this.level.pickupSpawns);
    this.scene.add(this.pickups.group);

    // --- HUD ---
    this.root = document.createElement("div");
    this.root.className = "hud";
    this.root.innerHTML = `
      <div class="hud__flash" id="cf-flash"></div>
      <div class="hud__pickup" id="cf-pickup"></div>
      <div class="hud__crosshair"></div>
      <div class="hud__hint">CLICK TO FLY &middot; LMB LASER &middot; RMB ROCKET &middot; ESC RELEASE</div>
      <div class="hud__readout">
        COREFALL // TEST RUN<br />
        SPEED&nbsp;&nbsp;&nbsp;&nbsp; <span id="cf-speed">0</span> u/s<br />
        CORE&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; <span id="cf-core">0</span> m<br />
        HOSTILES&nbsp; <span id="cf-enemies">0</span><br />
        FACTORIES <span id="cf-factories">0</span>
      </div>
      <div class="hud__status">
        <div class="hud__bar-label">HULL</div>
        <div class="hud__bar"><div class="hud__bar-fill hud__bar-fill--hull" id="cf-hull"></div></div>
        <div class="hud__bar-label">SHIELD</div>
        <div class="hud__bar"><div class="hud__bar-fill hud__bar-fill--shield" id="cf-shield"></div></div>
      </div>
      <div class="hud__weapon">
        <div class="hud__weapon-name">LASER L<span id="cf-laser">1</span> &middot; RKT <span id="cf-rkt">0</span></div>
        <div class="hud__energy"><div class="hud__energy-fill" id="cf-energy"></div></div>
      </div>
    `;
    game.container.appendChild(this.root);
    this.speedEl = this.root.querySelector<HTMLElement>("#cf-speed")!;
    this.coreEl = this.root.querySelector<HTMLElement>("#cf-core")!;
    this.energyEl = this.root.querySelector<HTMLElement>("#cf-energy")!;
    this.enemyEl = this.root.querySelector<HTMLElement>("#cf-enemies")!;
    this.hullEl = this.root.querySelector<HTMLElement>("#cf-hull")!;
    this.shieldEl = this.root.querySelector<HTMLElement>("#cf-shield")!;
    this.rktEl = this.root.querySelector<HTMLElement>("#cf-rkt")!;
    this.laserEl = this.root.querySelector<HTMLElement>("#cf-laser")!;
    this.factoryEl = this.root.querySelector<HTMLElement>("#cf-factories")!;
    this.flashEl = this.root.querySelector<HTMLElement>("#cf-flash")!;
    this.pickupEl = this.root.querySelector<HTMLElement>("#cf-pickup")!;

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

      this.tmpFwd.set(0, 0, -1).applyQuaternion(this.ship.quaternion);
      this.tmpRight.set(1, 0, 0).applyQuaternion(this.ship.quaternion);
      if (this.game.input.isMouseDown(0)) {
        if (
          this.weapons.tryFire(this.ship.position, this.tmpFwd, this.tmpRight)
        ) {
          this.game.sfx.laser();
        }
      }
      if (this.game.input.isMouseDown(2)) {
        if (this.weapons.tryFireRocket(this.ship.position, this.tmpFwd)) {
          this.game.sfx.rocket();
        }
      }

      this.weapons.update(dt);
      this.enemies.update(dt, this.ship.position, this.weapons);
      this.game.music.setIntensity(this.enemies.threat);

      // Pickups.
      for (const k of this.pickups.update(dt, this.ship.position)) {
        if (k === "health") {
          this.hull = Math.min(MAX_HULL, this.hull + HEALTH_PICKUP);
        } else if (k === "shield") {
          this.shield = MAX_SHIELD;
        } else if (k === "rockets") {
          this.weapons.addRockets(ROCKET_PICKUP);
        } else {
          this.weapons.addLaserLevel();
        }
        const info = PICKUP_INFO[k];
        this.flashT = 0.55;
        this.flashColor = info.css;
        this.pickupEl.textContent =
          k === "laser" ? `LASER L${this.weapons.laserLevel}` : info.label;
        this.pickupEl.style.color = info.css;
      }

      // Descent-style colour flicker after a pickup.
      if (this.flashT > 0) {
        this.flashT = Math.max(0, this.flashT - dt);
        const k = this.flashT / 0.55;
        const strobe = Math.floor(this.flashT * 26) % 2 ? 1 : 0.3;
        this.flashEl.style.background = this.flashColor;
        this.flashEl.style.opacity = `${k * 0.5 * strobe}`;
        this.pickupEl.style.opacity = `${Math.min(1, k * 1.6)}`;
      } else {
        this.flashEl.style.opacity = "0";
        this.pickupEl.style.opacity = "0";
      }

      // Damage / shield / death.
      this.invuln = Math.max(0, this.invuln - dt);
      this.shieldDelay = Math.max(0, this.shieldDelay - dt);
      let dmg = this.enemies.consumeDamage();
      if (dmg > 0 && this.invuln <= 0) {
        this.shieldDelay = SHIELD_DELAY;
        const absorbed = Math.min(this.shield, dmg);
        this.shield -= absorbed;
        dmg -= absorbed;
        this.hull -= dmg;
        if (this.hull <= 0) {
          this.game.sfx.explosion(2);
          this.ship.respawn(
            this.level.spawnPosition,
            this.level.spawnQuaternion,
          );
          this.hull = MAX_HULL;
          this.shield = MAX_SHIELD;
          this.invuln = INVULN;
        }
      }
      if (this.shieldDelay <= 0 && this.shield < MAX_SHIELD) {
        this.shield = Math.min(MAX_SHIELD, this.shield + SHIELD_REGEN * dt);
      }

      this.speedEl.textContent = this.ship.speed.toFixed(0);
      this.coreEl.textContent = this.ship.position
        .distanceTo(this.level.corePosition)
        .toFixed(0);
      this.enemyEl.textContent = this.enemies.count.toFixed(0);
      this.factoryEl.textContent = this.enemies.factoryCount.toFixed(0);
      this.hullEl.style.width = `${Math.max(0, (this.hull / MAX_HULL) * 100).toFixed(0)}%`;
      this.shieldEl.style.width = `${((this.shield / MAX_SHIELD) * 100).toFixed(0)}%`;
      this.rktEl.textContent = this.weapons.rocketAmmo.toFixed(0);
      this.laserEl.textContent = this.weapons.laserLevel.toFixed(0);
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
    this.pickups.dispose();
    this.enemies.dispose();
    this.weapons.dispose();
    this.level.dispose();
    this.physics.dispose();
  }
}
