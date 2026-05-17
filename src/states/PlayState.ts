import * as THREE from "three";
import type { Game } from "../engine/Game";
import type { GameState } from "./GameState";
import { MenuState } from "./MenuState";
import { PhysicsWorld, RAPIER } from "../physics/Physics";
import { Level } from "../world/Level";
import { Ship } from "../world/Ship";
import { WeaponSystem, WEAPON_NAME } from "../world/Weapons";
import { EnemySwarm, difficultyConfig } from "../world/Enemies";
import { PickupField, type PickupKind } from "../world/Pickups";
import { DeathFx } from "../world/DeathFx";
import { Doors } from "../world/Doors";
import { MapView } from "../ui/MapView";

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
  private mapView!: MapView;
  private mapKeyDown = false;

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

  private phase: "play" | "dead" | "gameover" | "won" = "play";
  private selfDestruct = false;
  private spawned = false;
  private escapeTime = 0;
  private winTimer = 0;
  private reactorEl!: HTMLElement;
  private reactorWrapEl!: HTMLElement;
  private sdEl!: HTMLElement;
  private lives = START_LIVES;
  private deathFx!: DeathFx;
  private escapeLight!: THREE.PointLight;
  private readonly escapeStart = new THREE.Vector3();
  private readonly escapeDir = new THREE.Vector3();
  private winBoomTimer = 0;
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

    this.doors = new Doors(
      this.physics.world,
      this.game.sfx,
      this.level.doorDefs,
    );
    this.scene.add(this.doors.group);

    this.mapView = new MapView(game.container);

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
    this.enemies.spawn(
      this.level.enemySpawns,
      this.level.factorySpawns,
      this.level.corePosition,
    );
    this.scene.add(this.enemies.group);

    this.pickups = new PickupField(this.game.sfx);
    this.pickups.spawn(this.level.pickupSpawns);
    for (const k of this.level.keySpawns) {
      this.pickups.add(k.pos, k.kind as PickupKind);
    }
    this.scene.add(this.pickups.group);

    this.deathFx = new DeathFx();
    this.scene.add(this.deathFx.group);

    // Lights the ship during the escape cinematic (idle at 0 otherwise).
    this.escapeLight = new THREE.PointLight(0xbfe6ff, 0, 120, 1.4);
    this.scene.add(this.escapeLight);

    // --- HUD ---
    this.root = document.createElement("div");
    this.root.className = "hud";
    this.root.innerHTML = `
      <div class="hud__flash" id="cf-flash"></div>
      <div class="hud__pickup" id="cf-pickup"></div>
      <div class="hud__crosshair"></div>
      <div class="hud__reactor hidden" id="cf-reactor-wrap">
        <div class="hud__bar-label">REACTOR</div>
        <div class="hud__bar"><div class="hud__bar-fill hud__bar-fill--reactor" id="cf-reactor"></div></div>
      </div>
      <div class="hud__sd hidden" id="cf-sd"></div>
      <div class="hud__hint">LMB FIRE &middot; 1-5/0 WEAPON &middot; V VIEW &middot; M MAP &middot; R RESET</div>
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
        <div class="hud__weapon-name"><span id="cf-wpn">LASER</span> <span id="cf-wammo"></span></div>
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
    this.rktEl = this.root.querySelector<HTMLElement>("#cf-wpn")!;
    this.laserEl = this.root.querySelector<HTMLElement>("#cf-wammo")!;
    this.factoryEl = this.root.querySelector<HTMLElement>("#cf-factories")!;
    this.reactorEl = this.root.querySelector<HTMLElement>("#cf-reactor")!;
    this.reactorWrapEl =
      this.root.querySelector<HTMLElement>("#cf-reactor-wrap")!;
    this.sdEl = this.root.querySelector<HTMLElement>("#cf-sd")!;
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

    // Drop the gear you were carrying where you died, then start over
    // from the level entrance with a bare ship (Descent style).
    const jitter = () =>
      new THREE.Vector3(
        (Math.random() - 0.5) * 6,
        (Math.random() - 0.5) * 6,
        (Math.random() - 0.5) * 6,
      );
    const lvl = this.weapons.laserLevel;
    for (let i = 1; i < lvl; i++) {
      this.pickups.add(this.deathPos.clone().add(jitter()), "laser");
    }
    if (this.weapons.rocketAmmo > 0) {
      this.pickups.add(this.deathPos.clone().add(jitter()), "rockets");
    }

    // Keys are kept across deaths so doors stay passable.
    this.weapons.resetLoadout();

    this.ship.respawn(this.level.spawnPosition, this.level.spawnQuaternion);
    this.ship.syncCamera(this.camera);
    this.game.sfx.spawn();
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

    if (this.phase === "won") {
      this.updateWin(dt);
      this.game.renderer.render(this.scene, this.camera);
      return;
    }
    if (this.phase !== "play") {
      this.updateDeath(dt);
      this.game.renderer.render(this.scene, this.camera);
      return;
    }

    const locked = this.game.input.isLocked;

    // Automap toggle (pauses the sim while open).
    const mDown = this.game.input.isDown("KeyM");
    if (mDown && !this.mapKeyDown) this.mapView.toggle();
    this.mapKeyDown = mDown;

    if (this.mapView.visible) {
      this.pause.classList.add("hidden");
      this.tmpFwd.set(0, 0, -1).applyQuaternion(this.ship.quaternion);
      this.mapView.render(
        this.level.mapBoxes,
        this.level.doorDefs,
        { x: this.level.corePosition.x, z: this.level.corePosition.z },
        { x: this.ship.position.x, z: this.ship.position.z },
        { x: this.tmpFwd.x, z: this.tmpFwd.z },
        this.keys,
      );
      this.game.renderer.render(this.scene, this.camera);
      return;
    }

    this.pause.classList.toggle("hidden", locked);

    const vDown = this.game.input.isDown("KeyV");
    if (locked && vDown && !this.viewKeyDown) {
      this.viewMode = this.viewMode === "fp" ? "chase" : "fp";
    }
    this.viewKeyDown = vDown;

    if (locked) {
      if (!this.spawned) {
        this.spawned = true;
        this.game.sfx.spawn();
      }
      this.ship.update(dt, this.game.input);
      this.physics.step(dt);
      this.level.update(dt, this.ship.position);

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

      // Weapon selection: 1-5 primary, 0 rockets.
      for (let s = 0; s <= 5; s++) {
        if (this.game.input.isDown(`Digit${s}`)) this.weapons.selectSlot(s);
      }

      this.tmpFwd.set(0, 0, -1).applyQuaternion(this.ship.quaternion);
      this.tmpRight.set(1, 0, 0).applyQuaternion(this.ship.quaternion);
      this.weapons.fire(
        this.game.input.isMouseDown(0),
        this.ship.position,
        this.tmpFwd,
        this.tmpRight,
      );

      this.weapons.update(dt);
      this.enemies.update(dt, this.ship.position, this.weapons);
      this.game.music.setIntensity(this.enemies.threat);

      // Reactor health bar + self-destruct / escape logic.
      if (this.enemies.reactorAlive && this.enemies.reactorHp01 < 1) {
        this.reactorWrapEl.classList.remove("hidden");
        this.reactorEl.style.width = `${(this.enemies.reactorHp01 * 100).toFixed(0)}%`;
      }
      if (this.enemies.consumeReactorKilled()) {
        this.selfDestruct = true;
        this.escapeTime = 55;
        this.level.destroyReactor();
        this.doors.setEscape(true);
        this.game.sfx.explosion(3);
        this.reactorWrapEl.classList.add("hidden");
        this.sdEl.classList.remove("hidden");
      }
      if (this.selfDestruct) {
        this.escapeTime -= dt;
        const t = Math.max(0, this.escapeTime);
        this.sdEl.textContent = `!! SELF DESTRUCT !!  T-${t.toFixed(0)}s  —  REACH THE EXIT`;
        if (this.ship.position.distanceTo(this.level.exitZone) < 22) {
          this.selfDestruct = false;
          this.sdEl.classList.add("hidden");
          this.phase = "won";
          this.winTimer = 0;
          this.winBoomTimer = 0;
          this.spaceArmed = false;
          this.root.classList.add("hidden");
          this.ship.model.visible = true;
          this.deathFx.reset();
          this.escapeStart.copy(this.ship.position);
          this.escapeDir
            .set(0, 0, -1)
            .applyQuaternion(this.ship.quaternion)
            .normalize();
          this.game.input.exitPointerLock();
          this.game.music.setScene("victory");
          return;
        }
        if (this.escapeTime <= 0) {
          this.selfDestruct = false;
          this.sdEl.classList.add("hidden");
          this.hull = 0;
          this.die();
          return;
        }
      }

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
      const wp = this.weapons.current;
      this.rktEl.textContent =
        wp === "laser" || wp === "superlaser"
          ? `${WEAPON_NAME[wp]} L${this.weapons.laserLevel}`
          : WEAPON_NAME[wp];
      this.laserEl.textContent =
        wp === "rockets"
          ? `x${this.weapons.rocketAmmo}`
          : wp === "vulcan"
            ? `x${this.weapons.vulcanAmmo}`
            : "";
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

  private updateWin(dt: number) {
    this.pause.classList.add("hidden");
    this.winTimer += dt;

    // Descent-style external shot: camera sits out in space watching the
    // mine; the ship bursts out toward it with the mine exploding behind.
    const CAM_DIST = 46;
    const dist = 22 * this.winTimer + 8 * this.winTimer * this.winTimer;
    this.ship.position
      .copy(this.escapeStart)
      .addScaledVector(this.escapeDir, dist);
    this.ship.model.visible = true;
    this.ship.model.position.copy(this.ship.position);
    this.ship.model.quaternion.copy(this.ship.quaternion);

    const worldUp = new THREE.Vector3(0, 1, 0);
    const side = new THREE.Vector3()
      .crossVectors(this.escapeDir, worldUp)
      .normalize();
    this.camera.position
      .copy(this.escapeStart)
      .addScaledVector(this.escapeDir, CAM_DIST)
      .addScaledVector(worldUp, 7)
      .addScaledVector(side, 6);
    // Watch the ship approach, then turn back to the detonating mine.
    if (dist < CAM_DIST - 4) this.camera.lookAt(this.ship.position);
    else this.camera.lookAt(this.escapeStart);

    this.escapeLight.intensity = 170;
    this.escapeLight.position
      .copy(this.ship.position)
      .addScaledVector(worldUp, 2);
    this.level.update(dt * 0.2, this.ship.position);

    // Chain of explosions behind the ship, back toward the mine.
    this.deathFx.update(dt);
    this.winBoomTimer -= dt;
    if (this.winBoomTimer <= 0 && this.winTimer < 5) {
      this.winBoomTimer = 0.26;
      const back = Math.random() * 18;
      const p = this.escapeStart
        .clone()
        .addScaledVector(this.escapeDir, back)
        .add(
          new THREE.Vector3(
            (Math.random() - 0.5) * 16,
            (Math.random() - 0.5) * 16,
            (Math.random() - 0.5) * 16,
          ),
        );
      this.deathFx.trigger(p, { laser: 0, rockets: 0 });
      this.game.sfx.explosion(2.6);
    }

    // Whiteout flash as the mine goes up.
    const flash = Math.min(0.85, Math.max(0, (this.winTimer - 3.4) / 2));
    this.flashEl.style.background = "#dff0ff";
    this.flashEl.style.opacity = `${flash}`;

    if (this.winTimer > 5) {
      this.deathTitleEl.textContent = "MISSION COMPLETE";
      this.deathTitleEl.style.color = "#5dff8a";
      this.deathSubEl.textContent = "YOU ESCAPED — PRESS SPACE FOR MENU";
      this.deathEl.classList.remove("hidden");
      const sp = this.game.input.isDown("Space");
      if (!sp) this.spaceArmed = true;
      if (this.spaceArmed && sp) {
        this.game.music.setScene("menu");
        this.game.setState(new MenuState());
      }
    }
  }

  private updateDeath(dt: number) {
    this.pause.classList.add("hidden");
    this.game.music.setIntensity(0);
    this.ship.model.visible = false;

    // Slow-motion spectacle; real time still drives the SPACE prompt.
    const sdt = dt * 0.3;
    this.level.update(sdt, this.deathPos);
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
    this.mapView.remove();
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
