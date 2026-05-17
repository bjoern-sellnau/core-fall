import * as THREE from "three";
import type { Game } from "../engine/Game";
import type { GameState } from "./GameState";
import { MenuState } from "./MenuState";
import { BriefingState } from "./BriefingState";
import { LeaderboardState } from "./LeaderboardState";
import { PhysicsWorld, RAPIER } from "../physics/Physics";
import { Level } from "../world/Level";
import { Ship } from "../world/Ship";
import { WeaponSystem, WEAPON_NAME } from "../world/Weapons";
import { EnemySwarm, difficultyConfig } from "../world/Enemies";
import { LEVELS } from "../world/levels";
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
  private winBoomTimer = 0;
  private winInit = false;
  private starfield!: THREE.Points;
  private warp!: THREE.LineSegments;
  private deathTimer = 0;
  private spaceArmed = false;
  private readonly deathPos = new THREE.Vector3();
  private livesEl!: HTMLElement;
  private deathEl!: HTMLElement;
  private winFade!: HTMLElement;
  private hyperDone = false;
  private deathTitleEl!: HTMLElement;
  private deathSubEl!: HTMLElement;

  private readonly tmpFwd = new THREE.Vector3();
  private readonly tmpRight = new THREE.Vector3();

  enter(game: Game) {
    this.game = game;

    const { width, height } = game.size;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    this.physics = new PhysicsWorld();
    this.level = new Level(this.physics.world, LEVELS[this.game.levelIndex]);
    this.scene.add(this.level.group);

    this.scene.background = new THREE.Color(this.level.fogColor);
    this.scene.fog = new THREE.FogExp2(
      this.level.fogColor,
      this.level.fogDensity,
    );

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
      LEVELS[this.game.levelIndex].tier,
      LEVELS[this.game.levelIndex].kinds,
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
    // Restored from a death-restart: carry lives/keys + dropped gear.
    if (this.game.restartLives >= 0) {
      this.lives = this.game.restartLives;
      if (this.game.restartKeys) this.keys = { ...this.game.restartKeys };
      for (const d of this.game.restartDrops) {
        this.pickups.add(
          new THREE.Vector3(d.x, d.y, d.z),
          d.kind as PickupKind,
        );
      }
    }
    this.scene.add(this.pickups.group);

    this.deathFx = new DeathFx();
    this.scene.add(this.deathFx.group);

    // Starfield used only for the escape-into-space cinematic.
    {
      const n = 1400;
      const pos = new Float32Array(n * 3);
      for (let i = 0; i < n * 3; i++) pos[i] = (Math.random() - 0.5) * 600;
      const sg = new THREE.BufferGeometry();
      sg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      this.starfield = new THREE.Points(
        sg,
        new THREE.PointsMaterial({ color: 0xcfe0ff, size: 1.4 }),
      );
      this.starfield.visible = false;
      this.scene.add(this.starfield);
    }

    // Star Wars-style hyperdrive streak lines (hidden until the jump).
    {
      const n = 260;
      const pos = new Float32Array(n * 6);
      for (let i = 0; i < n; i++) {
        const x = (Math.random() - 0.5) * 90;
        const y = (Math.random() - 0.5) * 60;
        const zz = (Math.random() - 0.5) * 220;
        pos[i * 6] = x;
        pos[i * 6 + 1] = y;
        pos[i * 6 + 2] = zz;
        pos[i * 6 + 3] = x;
        pos[i * 6 + 4] = y;
        pos[i * 6 + 5] = zz + 5;
      }
      const wg = new THREE.BufferGeometry();
      wg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      this.warp = new THREE.LineSegments(
        wg,
        new THREE.LineBasicMaterial({
          color: 0xcfe6ff,
          transparent: true,
          opacity: 0.9,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      this.warp.visible = false;
      this.scene.add(this.warp);
    }

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
      <div class="hud__hint">LMB FIRE &middot; 1-5/0 WEAPON &middot; V VIEW &middot; M MAP &middot; R ROLL &middot; H HEIGHT</div>
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
    this.pause.className = "cf-pause hidden";
    this.pause.innerHTML = `
      <div class="cf-pause-box">
        <div class="cf-pause-kick" id="cf-ptag">PAUSED</div>
        <div class="cf-pause-title" id="cf-ptitle">SYSTEMS HOLD</div>
        <div class="cf-pause-btns">
          <button class="cf-pause-btn" id="cf-resume">ENGAGE</button>
          <button class="cf-pause-btn" id="cf-menu">ABORT TO MENU</button>
        </div>
        <div class="cf-pause-hint">CLICK ANYWHERE TO FLY · ESC RELEASES MOUSE</div>
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

    // Fullscreen fade used for the hyperdrive flash + black end screen.
    this.winFade = document.createElement("div");
    this.winFade.style.cssText =
      "position:fixed;inset:0;background:#000;opacity:0;pointer-events:none;z-index:30;transition:none";
    game.container.appendChild(this.winFade);
    this.deathEl.style.zIndex = "40";

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

    // Stash what to restore if the level is restarted: lives, keys,
    // and the gear scattered where we died (so it can be recovered).
    if (this.lives > 0) {
      const j = () => (Math.random() - 0.5) * 6;
      const drops: { x: number; y: number; z: number; kind: string }[] = [];
      for (let i = 1; i < this.weapons.laserLevel; i++) {
        drops.push({
          x: this.deathPos.x + j(),
          y: this.deathPos.y + j(),
          z: this.deathPos.z + j(),
          kind: "laser",
        });
      }
      if (this.weapons.rocketAmmo > 0) {
        drops.push({
          x: this.deathPos.x + j(),
          y: this.deathPos.y + j(),
          z: this.deathPos.z + j(),
          kind: "rockets",
        });
      }
      this.game.restartDrops = drops;
      this.game.restartLives = this.lives;
      this.game.restartKeys = { ...this.keys };
    }

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
    if (!locked) {
      const tag = this.pause.querySelector<HTMLElement>("#cf-ptag")!;
      const ttl = this.pause.querySelector<HTMLElement>("#cf-ptitle")!;
      if (this.spawned) {
        tag.textContent = "PAUSED";
        ttl.textContent = "SYSTEMS HOLD";
      } else {
        tag.textContent = `MISSION ${this.game.levelIndex + 1}`;
        ttl.textContent = LEVELS[this.game.levelIndex].name;
      }
    }

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
          this.winInit = false;
          this.spaceArmed = false;
          this.root.classList.add("hidden");
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

    // Self-contained cinematic in open space: the ship flies out of
    // the mine while a trailing camera keeps it framed and pulls back,
    // the mine exploding behind it.
    if (!this.winInit) {
      this.winInit = true;
      this.level.group.visible = false;
      this.scene.fog = null;
      this.scene.background = new THREE.Color(0x05060c);
      this.starfield.visible = true;
      this.deathFx.reset();
      this.ship.model.visible = true;
      this.ship.model.rotation.set(0, Math.PI, 0); // nose along +Z
    }

    const T_HYPER = 3.2; // hyperdrive engages
    const T_JUMP = 4.4; // light-speed flash
    const T_BLACK = 4.9; // pure black screen
    const T_TEXT = 5.6; // completion text
    const t = this.winTimer;

    // Ship cruises out (+Z); on hyperdrive it shoots away to a point.
    let z = -10 + 18 * t + 4 * t * t;
    if (t > T_HYPER) z += 900 * (t - T_HYPER) * (t - T_HYPER);
    this.ship.position.set(0, 0, z);
    this.ship.model.position.copy(this.ship.position);
    this.escapeLight.intensity = 190;
    this.escapeLight.position.set(0, 4, z + 3);

    // Smooth 3/4-rear camera that steadily pulls back (no swinging).
    const back = 13 + t * 7;
    const cz = Math.min(z, -10 + 18 * t + 4 * t * t);
    this.camera.position.set(-6, 3.4, cz - back);
    this.camera.lookAt(0, 0.5, cz + 8);

    if (t > T_HYPER && !this.hyperDone) {
      this.hyperDone = true;
      this.game.sfx.spawn(); // hyperdrive whoosh
    }

    // Explosion chain behind the ship — only before the jump.
    this.deathFx.update(dt);
    this.winBoomTimer -= dt;
    if (this.winBoomTimer <= 0 && t < T_HYPER) {
      this.winBoomTimer = 0.22;
      this.deathFx.trigger(
        new THREE.Vector3(
          (Math.random() - 0.5) * 26,
          (Math.random() - 0.5) * 20,
          z - 24 - Math.random() * 55,
        ),
        { laser: 0, rockets: 0 },
      );
      this.game.sfx.explosion(2.6);
    }

    // Hyperdrive starlines: streaks erupt and stretch past the camera.
    if (t > T_HYPER && t < T_BLACK) {
      this.starfield.visible = false;
      this.warp.visible = true;
      const k = Math.min(1, (t - T_HYPER) / (T_JUMP - T_HYPER));
      this.warp.position.z = this.camera.position.z + 40;
      this.warp.scale.set(1, 1, 1 + k * 60);
      (this.warp.material as THREE.LineBasicMaterial).opacity =
        0.35 + k * 0.65;
    }

    // White blink → pure black, then the text.
    if (t < T_JUMP) {
      this.winFade.style.opacity = "0";
    } else if (t < T_BLACK) {
      this.winFade.style.background = "#e8f0ff";
      this.winFade.style.opacity = `${(t - T_JUMP) / (T_BLACK - T_JUMP)}`;
    } else {
      this.winFade.style.background = "#000";
      this.winFade.style.opacity = "1";
      this.starfield.visible = false;
      this.warp.visible = false;
      this.ship.model.visible = false;
    }

    if (t > T_TEXT) {
      const story = this.game.mode === "story";
      const more = story && this.game.levelIndex < LEVELS.length - 1;
      const storyDone = story && !more;
      this.deathTitleEl.textContent = "MISSION COMPLETE";
      this.deathTitleEl.style.color = "#5dff8a";
      this.deathSubEl.textContent = more
        ? "YOU ESCAPED — PRESS SPACE FOR NEXT MISSION"
        : storyDone
          ? "ALL SHAFTS CLEARED — PRESS SPACE FOR LEADERBOARD"
          : "YOU ESCAPED — PRESS SPACE FOR MENU";
      this.deathEl.classList.remove("hidden");
      const sp = this.game.input.isDown("Space");
      if (!sp) this.spaceArmed = true;
      if (this.spaceArmed && sp) {
        if (more) {
          this.game.levelIndex += 1;
          this.game.setState(new BriefingState());
        } else if (storyDone) {
          this.game.music.setScene("menu");
          this.game.setState(new LeaderboardState(true));
        } else {
          this.game.music.setScene("menu");
          this.game.setState(new MenuState());
        }
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
      if (this.phase === "gameover") {
        this.game.clearRestart();
        this.game.setState(new MenuState());
      } else {
        // Restart the level; lost gear & lives are carried over.
        this.game.music.setScene("game");
        this.game.setState(new PlayState());
      }
    }
  }

  exit() {
    this.game.input.exitPointerLock();
    this.game.renderer.domElement.removeEventListener("click", this.onClick);
    this.root.remove();
    this.pause.remove();
    this.deathEl.remove();
    this.winFade.remove();
    this.mapView.remove();
    this.starfield.geometry.dispose();
    (this.starfield.material as THREE.Material).dispose();
    this.warp.geometry.dispose();
    (this.warp.material as THREE.Material).dispose();
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
