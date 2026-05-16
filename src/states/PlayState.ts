import * as THREE from "three";
import type { Game } from "../engine/Game";
import type { GameState } from "./GameState";
import { MenuState } from "./MenuState";
import { PhysicsWorld, RAPIER } from "../physics/Physics";
import { Level } from "../world/Level";
import { Ship } from "../world/Ship";
import { WeaponSystem } from "../world/Weapons";
import { EnemySwarm, difficultyConfig } from "../world/Enemies";
import { PickupField, type PickupKind } from "../world/Pickups";
import { DeathFx } from "../world/DeathFx";
import { Doors } from "../world/Doors";

const PICKUP_INFO: Record<PickupKind, { css: string; label: string }> = {
  health: { css: "#44ff88", label: "HULL +35" },
  shield: { css: "#46d8ff", label: "SHIELD UP" },
  rockets: { css: "#ff9a3a", label: "ROCKETS +6" },
  laser: { css: "#ff5ce0", label: "LASER UP" },
  keyblue: { css: "#3a7bff", label: "BLUE KEY" },
  keyred: { css: "#ff3a3a", label: "RED KEY" },
  keyyellow: { css: "#ffd23a", label: "YELLOW KEY" },
};

const MAX_HULL = 100;
const MAX_SHIELD = 100;
const SHIELD_REGEN = 14; // per s
const SHIELD_DELAY = 4; // s after a hit before shield regenerates
const INVULN = 2; // s of invulnerability after respawn
const HEALTH_PICKUP = 35;
const ROCKET_PICKUP = 6;
const START_LIVES = 5;
const DEATH_MIN = 1.2; // s before SPACE is accepted on the death screen

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
  private doors!: Doors;

  private keys = { blue: false, red: false, yellow: false };
  private viewMode: "fp" | "chase" = "fp";
  private viewKeyDown = false;
  private keysEl!: HTMLElement;

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

  private phase: "play" | "dead" | "gameover" = "play";
  private lives = START_LIVES;
  private deathFx!: DeathFx;
  private deathTimer = 0;
  private spaceArmed = false;
  private readonly deathPos = new THREE.Vector3();
  private livesEl!: HTMLElement;
  private deathEl!: HTMLElement;
  private deathTitleEl!: HTMLElement;
  private deathSubEl!: HTMLElement;

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
    this.ship.model.visible = false;
    this.scene.add(this.ship.model);
    this.ship.syncCamera(this.camera);

    this.doors = new Doors(this.physics.world, this.level.doorDefs);
    this.scene.add(this.doors.group);

    this.weapons = new WeaponSystem(
      this.physics.world,
      this.ship.rigidBody,
      this.game.sfx,
    );
    this.scene.add(this.weapons.group);

    this.enemies = new EnemySwarm(
      this.physics.world,
      this.game.sfx,
      difficultyConfig(this.game.difficulty),
    );
    this.enemies.spawn(this.level.enemySpawns, this.level.factorySpawns);
    this.scene.add(this.enemies.group);

    this.pickups = new PickupField(this.game.sfx);
    this.pickups.spawn(this.level.pickupSpawns);
    for (const k of this.level.keySpawns) {
      this.pickups.add(k.pos, k.kind as PickupKind);
    }
    this.scene.add(this.pickups.group);

    this.deathFx = new DeathFx();
    this.scene.add(this.deathFx.group);

    // --- HUD ---
    this.root = document.createElement("div");
    this.root.className = "hud";
    this.root.innerHTML = `
      <div class="hud__flash" id="cf-flash"></div>
      <div class="hud__pickup" id="cf-pickup"></div>
      <div class="hud__crosshair"></div>
      <div class="hud__hint">LMB LASER &middot; RMB ROCKET &middot; V VIEW &middot; ESC RELEASE</div>
      <div class="hud__readout">
        COREFALL // TEST RUN<br />
        SPEED&nbsp;&nbsp;&nbsp;&nbsp; <span id="cf-speed">0</span> u/s<br />
        CORE&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; <span id="cf-core">0</span> m<br />
        HOSTILES&nbsp; <span id="cf-enemies">0</span><br />
        FACTORIES <span id="cf-factories">0</span><br />
        LIVES&nbsp;&nbsp;&nbsp;&nbsp; <span id="cf-lives">5</span><br />
        KEYS&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; <span id="cf-keys"></span>
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
    this.livesEl = this.root.querySelector<HTMLElement>("#cf-lives")!;
    this.keysEl = this.root.querySelector<HTMLElement>("#cf-keys")!;

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

    this.deathEl = document.createElement("div");
    this.deathEl.className = "hud__death hidden";
    this.deathEl.innerHTML = `
      <div class="hud__death-title" id="cf-death-title">SHIP DESTROYED</div>
      <div class="hud__death-sub" id="cf-death-sub">PRESS SPACE TO RESPAWN</div>
    `;
    game.container.appendChild(this.deathEl);
    this.deathTitleEl =
      this.deathEl.querySelector<HTMLElement>("#cf-death-title")!;
    this.deathSubEl = this.deathEl.querySelector<HTMLElement>("#cf-death-sub")!;

    this.onClick = () => {
      this.game.music.start();
      this.game.sfx.start();
      if (this.phase === "play" && !this.game.input.isLocked) {
        this.game.input.requestPointerLock();
      }
    };
    game.renderer.domElement.addEventListener("click", this.onClick);
  }

  private die() {
    this.lives -= 1;
    this.game.sfx.explosion(2.4);
    this.game.music.setScene("death");
    this.deathPos.copy(this.ship.position);
    this.deathFx.trigger(this.deathPos, {
      laser: this.weapons.laserLevel,
      rockets: this.weapons.rocketAmmo,
    });
    this.phase = this.lives > 0 ? "dead" : "gameover";
    this.deathTimer = 0;
    this.spaceArmed = false;
    if (this.phase === "gameover") {
      this.deathTitleEl.textContent = "GAME OVER";
      this.deathSubEl.textContent = "PRESS SPACE TO RESTART";
    } else {
      this.deathTitleEl.textContent = "SHIP DESTROYED";
      this.deathSubEl.textContent = `${this.lives} LIVES LEFT — PRESS SPACE TO RESPAWN`;
    }
    this.deathEl.classList.remove("hidden");
    this.root.classList.add("hidden");
  }

  private respawn() {
    this.deathFx.reset();
    this.game.music.setScene("game");
    this.ship.respawn(this.level.spawnPosition, this.level.spawnQuaternion);
    this.ship.syncCamera(this.camera);
    this.hull = MAX_HULL;
    this.shield = MAX_SHIELD;
    this.invuln = INVULN;
    this.phase = "play";
    this.deathEl.classList.add("hidden");
    this.root.classList.remove("hidden");
  }

  private onClick: () => void = () => {};

  update(dt: number) {
    const nDown = this.game.input.isDown("KeyN");
    if (nDown && !this.musicKeyDown) this.game.music.toggleMute();
    this.musicKeyDown = nDown;

    if (this.wantMenu) {
      this.game.setState(new MenuState());
      return;
    }

    if (this.phase !== "play") {
      this.updateDeath(dt);
      this.game.renderer.render(this.scene, this.camera);
      return;
    }

    const locked = this.game.input.isLocked;
    if (locked && this.game.input.isDown("KeyM")) {
      this.game.input.exitPointerLock();
      this.game.setState(new MenuState());
      return;
    }

    this.pause.classList.toggle("hidden", locked);

    const vDown = this.game.input.isDown("KeyV");
    if (locked && vDown && !this.viewKeyDown) {
      this.viewMode = this.viewMode === "fp" ? "chase" : "fp";
    }
    this.viewKeyDown = vDown;

    if (locked) {
      this.ship.update(dt, this.game.input);
      this.physics.step(dt);
      this.level.update(dt);

      this.ship.model.position.copy(this.ship.position);
      this.ship.model.quaternion.copy(this.ship.quaternion);
      if (this.viewMode === "chase") {
        this.ship.model.visible = true;
        this.updateChaseCamera();
      } else {
        this.ship.model.visible = false;
        this.ship.syncCamera(this.camera);
      }

      this.doors.update(dt, this.ship.position, this.keys);

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
        } else if (k === "laser") {
          this.weapons.addLaserLevel();
        } else if (k === "keyblue") {
          this.keys.blue = true;
        } else if (k === "keyred") {
          this.keys.red = true;
        } else if (k === "keyyellow") {
          this.keys.yellow = true;
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
        this.game.sfx.hit();
        this.flashT = 0.3;
        this.flashColor = "#ff2e2e";
        this.pickupEl.textContent = "";
        this.shieldDelay = SHIELD_DELAY;
        const absorbed = Math.min(this.shield, dmg);
        this.shield -= absorbed;
        dmg -= absorbed;
        this.hull -= dmg;
        if (this.hull <= 0) {
          this.hull = 0;
          this.die();
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
      this.livesEl.textContent = this.lives.toFixed(0);
      const key = (on: boolean, c: string, ch: string) =>
        `<span style="color:${on ? c : "#33424f"}">${ch}</span>`;
      this.keysEl.innerHTML =
        key(this.keys.blue, "#3a7bff", "B") +
        " " +
        key(this.keys.red, "#ff3a3a", "R") +
        " " +
        key(this.keys.yellow, "#ffd23a", "Y");
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

  private updateChaseCamera() {
    const fwd = this.tmpFwd.set(0, 0, -1).applyQuaternion(this.ship.quaternion);
    const up = this.tmpRight
      .set(0, 1, 0)
      .applyQuaternion(this.ship.quaternion);
    const off = fwd
      .clone()
      .multiplyScalar(-9)
      .addScaledVector(up, 3);
    const want = off.length();
    const dir = off.multiplyScalar(1 / want);
    let dist = want;
    const hit = this.physics.world.castRay(
      new RAPIER.Ray(this.ship.position, dir),
      want,
      true,
      undefined,
      undefined,
      undefined,
      this.ship.rigidBody,
    );
    if (hit) dist = Math.max(2, hit.timeOfImpact - 1.2);
    this.camera.position.copy(this.ship.position).addScaledVector(dir, dist);
    this.camera.lookAt(
      this.ship.position.x + fwd.x * 6,
      this.ship.position.y + fwd.y * 6,
      this.ship.position.z + fwd.z * 6,
    );
  }

  private updateDeath(dt: number) {
    this.pause.classList.add("hidden");
    this.game.music.setIntensity(0);
    this.ship.model.visible = false;

    // Slow-motion spectacle; real time still drives the SPACE prompt.
    const sdt = dt * 0.3;
    this.level.update(sdt);
    this.deathFx.update(sdt);

    // Cinematic third-person orbit, but keep the camera inside the
    // room: raycast from the wreck and stop short of any wall.
    this.deathTimer += dt;
    const ang = this.deathTimer * 0.18;
    const off = new THREE.Vector3(
      Math.cos(ang) * 13,
      5,
      Math.sin(ang) * 13,
    );
    const want = off.length();
    const dir = off.clone().multiplyScalar(1 / want);
    let dist = want;
    const hit = this.physics.world.castRay(
      new RAPIER.Ray(this.deathPos, dir),
      want,
      true,
      undefined,
      undefined,
      undefined,
      this.ship.rigidBody,
    );
    if (hit) dist = Math.max(3, hit.timeOfImpact - 1.5);
    this.camera.position.copy(this.deathPos).addScaledVector(dir, dist);
    this.camera.lookAt(this.deathPos);

    const space = this.game.input.isDown("Space");
    if (!space) this.spaceArmed = true;
    if (this.spaceArmed && space && this.deathTimer >= DEATH_MIN) {
      if (this.phase === "gameover") this.game.setState(new MenuState());
      else this.respawn();
    }
  }

  exit() {
    this.game.input.exitPointerLock();
    this.game.renderer.domElement.removeEventListener("click", this.onClick);
    this.root.remove();
    this.pause.remove();
    this.deathEl.remove();
    this.deathFx.dispose();
    this.doors.dispose();
    this.pickups.dispose();
    this.enemies.dispose();
    this.weapons.dispose();
    this.ship.model.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose?.();
      const mat = m.material as THREE.Material | undefined;
      mat?.dispose?.();
    });
    this.level.dispose();
    this.physics.dispose();
  }
}
