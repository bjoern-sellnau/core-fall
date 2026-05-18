import * as THREE from "three";
import type { Game } from "../engine/Game";
import type { GameState } from "./GameState";
import { MenuState } from "./MenuState";
import { BriefingState } from "./BriefingState";
import { LeaderboardState } from "./LeaderboardState";
import { PhysicsWorld, RAPIER } from "../physics/Physics";
import { Level } from "../world/Level";
import { Ship } from "../world/Ship";
import {
  WeaponSystem,
  WEAPON_NAME,
  SECONDARY,
  type Weapon,
} from "../world/Weapons";
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
  energy: { css: "#66ddff", label: "ENERGY +65" },
  vammo: { css: "#f4c542", label: "VULCAN +200" },
  ecap: { css: "#33ffff", label: "ENERGY CAP 200" },
  scap: { css: "#7affc0", label: "SHIELD CAP 200" },
  quad: { css: "#ff5ce0", label: "QUAD LASER" },
  chrono: { css: "#b060ff", label: "CHRONOSPHERE" },
  keyblue: { css: "#3a7bff", label: "BLUE KEY" },
  keyred: { css: "#ff3a3a", label: "RED KEY" },
  keyyellow: { css: "#ffd23a", label: "YELLOW KEY" },
  wsuperlaser: { css: "#ffe27a", label: "SUPER LASER" },
  wvulcan: { css: "#ffe27a", label: "VULCAN" },
  wplasma: { css: "#ffe27a", label: "PLASMA" },
  wfusion: { css: "#ffe27a", label: "FUSION" },
  wrockets: { css: "#ffe27a", label: "CONCUSSION" },
  wspreadfire: { css: "#ffe27a", label: "SPREADFIRE" },
  whoming: { css: "#ffe27a", label: "HOMING MSL" },
  wproximity: { css: "#ffe27a", label: "PROX BOMB" },
  wsmart: { css: "#ffe27a", label: "SMART MSL" },
  wmega: { css: "#ffe27a", label: "MEGA MSL" },
};

const WPN_OF: Partial<Record<PickupKind, Weapon>> = {
  wsuperlaser: "superlaser",
  wvulcan: "vulcan",
  wplasma: "plasma",
  wfusion: "fusion",
  wrockets: "rockets",
  wspreadfire: "spreadfire",
  whoming: "homing",
  wproximity: "proximity",
  wsmart: "smart",
  wmega: "mega",
};

// The campaign hands out the extended arsenal one weapon at a time so
// every system becomes available over the 10 missions.
const EXTRA_BY_LEVEL: Record<number, PickupKind[]> = {
  1: ["wspreadfire"],
  2: ["whoming"],
  3: ["wproximity"],
  4: ["wsmart"],
  5: ["wmega"],
};

// Chrono active duration / cooldown (seconds) by chrono level (1..3).
const CHRONO_DUR = [0, 3.5, 5, 7];
const CHRONO_COOL = [0, 14, 11, 9];
const CHRONO_SCALE = 0.32; // world time multiplier while active
const ENERGY_ROOM_RATE = 85; // energy/s while inside a charge room
const VAMMO_PICKUP = 200; // vulcan rounds per ammo pickup
const SUPPLY_CYCLE: PickupKind[] = [
  "energy",
  "rockets",
  "vammo",
  "energy",
  "health",
];

const MAX_HULL = 100;
const MAX_SHIELD = 100;
const UP_SHIELD = 200; // with the shield-capacity plug-in (mission 5+)
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
  private shieldMax = MAX_SHIELD;
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
  private chargeEl!: HTMLElement;
  private chronoEl!: HTMLElement;
  private chronoActive = 0;
  private chronoCool = 0;
  private fireWasDown = false;
  private chargeSnd = false;
  private digitDown: boolean[] = [];

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
  private readonly winStart = new THREE.Vector3();
  private starfield!: THREE.Points;
  private warp!: THREE.LineSegments;
  private deathTimer = 0;
  private spaceArmed = false;
  private readonly deathPos = new THREE.Vector3();
  private livesEl!: HTMLElement;
  private deathEl!: HTMLElement;
  private winFade!: HTMLElement;
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
    this.weapons.setTargetSource(() => this.enemies.enemyPoints());

    // Carry the loadout across story levels (before deciding which extra
    // pickups still need to be offered this mission). Hull / shield /
    // energy travel with you, exactly as you left the previous shaft.
    if (this.game.loadout) {
      this.weapons.importLoadout(this.game.loadout);
      this.shieldMax = this.game.loadout.shieldMax;
      this.shield = Math.min(this.game.loadout.shield, this.shieldMax);
      this.hull = Math.min(this.game.loadout.hull, MAX_HULL);
    }

    this.pickups = new PickupField(this.game.sfx);
    this.pickups.spawn(this.level.pickupSpawns);
    // A second supply cache per room (ammo / energy heavy) so the
    // energy weapons don't dry out between charge rooms.
    this.level.pickupSpawns.forEach((p, i) => {
      const off = new THREE.Vector3(
        i % 2 ? 4 : -4,
        -2,
        i % 3 ? 3 : -3,
      );
      this.pickups.add(
        p.clone().add(off),
        SUPPLY_CYCLE[i % SUPPLY_CYCLE.length],
      );
    });
    for (const k of this.level.keySpawns) {
      this.pickups.add(k.pos, k.kind as PickupKind);
    }
    // This level's reward, in an early room: a new weapon, or a laser
    // upgrade once you already have the full arsenal.
    const lw = LEVELS[this.game.levelIndex].weapon;
    const wkind = (lw === "laser" ? "laser" : "w" + lw) as PickupKind;
    const wpos = this.level.pickupSpawns.length
      ? this.level.pickupSpawns[
          Math.min(2, this.level.pickupSpawns.length - 1)
        ]
      : this.level.spawnPosition.clone();
    this.pickups.add(wpos.clone(), wkind);

    // Spread the extended arsenal + gadgets across the campaign.
    const spawns = this.level.pickupSpawns;
    const slot = (i: number): THREE.Vector3 =>
      spawns.length
        ? spawns[Math.min(i, spawns.length - 1)].clone()
        : this.level.spawnPosition.clone().add(new THREE.Vector3(0, 2, i));
    let si = 4;
    for (const k of EXTRA_BY_LEVEL[this.game.levelIndex] ?? []) {
      this.pickups.add(slot(si), k);
      si += 3;
    }
    if (this.game.levelIndex >= 1 && !this.weapons.hasQuad) {
      this.pickups.add(slot(si), "quad");
      si += 3;
    }
    // Energy-capacity install (mission 2+, once, then permanent).
    if (this.game.levelIndex >= 1 && !this.weapons.hasEnergyCap) {
      this.pickups.add(slot(si), "ecap");
      si += 3;
    }
    // Shield-capacity plug-in from mission 5 onward, once.
    if (this.game.levelIndex >= 4 && this.shieldMax < UP_SHIELD) {
      this.pickups.add(slot(si), "scap");
      si += 3;
    }
    // Chronosphere appears from mission 3 onward; carried after that.
    if (this.game.levelIndex >= 2 && this.weapons.chronoLevel < 3) {
      this.pickups.add(slot(si), "chrono");
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
      <div class="hud__charge" id="cf-charge">⚡ ENERGY CHARGING</div>
      <div class="hud__crosshair"></div>
      <div class="hud__reactor hidden" id="cf-reactor-wrap">
        <div class="hud__bar-label">REACTOR</div>
        <div class="hud__bar"><div class="hud__bar-fill hud__bar-fill--reactor" id="cf-reactor"></div></div>
      </div>
      <div class="hud__sd hidden" id="cf-sd"></div>
      <div class="hud__hint">LMB FIRE &middot; 1-6 GUN &middot; 0 MISSILE &middot; 7 CHRONO &middot; V VIEW &middot; M MAP &middot; R ROLL &middot; H HEIGHT</div>
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
    this.chargeEl = this.root.querySelector<HTMLElement>("#cf-charge")!;

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

    // Slow-motion vignette while the Chronosphere is engaged.
    this.chronoEl = document.createElement("div");
    this.chronoEl.className = "cf-chrono hidden";
    game.container.appendChild(this.chronoEl);

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

    this.chronoActive = 0;
    this.chronoEl.classList.add("hidden");
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

  /** In-place respawn: enemies stay dead, lost gear lies where we fell. */
  private respawn() {
    this.deathFx.reset();
    this.game.music.setScene("game");

    const j = () => (Math.random() - 0.5) * 5;
    const drop = (kind: PickupKind) => {
      // Offset from the death spot, but never through a wall.
      const off = new THREE.Vector3(j(), j(), j());
      const len = off.length() || 0.01;
      const dir = off.clone().multiplyScalar(1 / len);
      const hit = this.physics.world.castRay(
        new RAPIER.Ray(this.deathPos, dir),
        len,
        true,
        undefined,
        undefined,
        undefined,
        this.ship.rigidBody,
      );
      const d = hit ? Math.max(0, hit.timeOfImpact - 1) : len;
      this.pickups.add(
        this.deathPos.clone().addScaledVector(dir, d),
        kind,
      );
    };
    for (const w of this.weapons.extraWeapons()) {
      drop(("w" + w) as PickupKind);
    }
    for (let i = 1; i < this.weapons.laserLevel; i++) drop("laser");
    if (this.weapons.hasQuad) drop("quad");
    this.weapons.resetToBase();

    this.ship.respawn(this.level.spawnPosition, this.level.spawnQuaternion);
    this.ship.syncCamera(this.camera);
    this.game.sfx.spawn();
    // Capacity plug-ins are permanent: respawn at the upgraded max.
    this.hull = MAX_HULL;
    this.shield = this.shieldMax;
    this.phase = "play";
    this.deathEl.classList.add("hidden");
    this.root.classList.remove("hidden");
  }

  private onClick: () => void = () => {};

  /** Drives the looping recharge sound, de-duped so it never stutters. */
  private setCharge(on: boolean) {
    if (on === this.chargeSnd) return;
    this.chargeSnd = on;
    this.game.sfx.energyCharge(on);
  }

  update(dt: number) {
    const nDown = this.game.input.isAction("muteMusic");
    if (nDown && !this.musicKeyDown) this.game.music.toggleMute();
    this.musicKeyDown = nDown;

    if (this.wantMenu) {
      this.game.setState(new MenuState());
      return;
    }

    if (this.phase === "won") {
      this.setCharge(false);
      this.updateWin(dt);
      this.game.renderer.render(this.scene, this.camera);
      return;
    }
    if (this.phase !== "play") {
      this.setCharge(false);
      this.updateDeath(dt);
      this.game.renderer.render(this.scene, this.camera);
      return;
    }

    const locked = this.game.input.isLocked;

    // Automap toggle (pauses the sim while open).
    const mDown = this.game.input.isAction("map");
    if (mDown && !this.mapKeyDown) this.mapView.toggle();
    this.mapKeyDown = mDown;

    if (this.mapView.visible) {
      this.setCharge(false);
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

    const vDown = this.game.input.isAction("view");
    if (locked && vDown && !this.viewKeyDown) {
      this.viewMode = this.viewMode === "fp" ? "chase" : "fp";
    }
    this.viewKeyDown = vDown;

    if (!locked) this.setCharge(false);
    if (locked) {
      if (!this.spawned) {
        this.spawned = true;
        this.game.sfx.spawn();
      }
      // Chronosphere bullet-time scales the whole world clock; the HUD
      // and the chrono/escape timers keep running on real time.
      this.chronoCool = Math.max(0, this.chronoCool - dt);
      if (this.chronoActive > 0) {
        this.chronoActive = Math.max(0, this.chronoActive - dt);
        if (this.chronoActive === 0) {
          this.chronoCool = CHRONO_COOL[this.weapons.chronoLevel] || 12;
        }
      }
      const sdt = this.chronoActive > 0 ? dt * CHRONO_SCALE : dt;
      this.chronoEl.classList.toggle("hidden", this.chronoActive <= 0);

      this.ship.update(sdt, this.game.input);
      this.physics.step(sdt);
      this.level.update(sdt, this.ship.position);

      this.ship.model.position.copy(this.ship.position);
      this.ship.model.quaternion.copy(this.ship.quaternion);
      if (this.viewMode === "chase") {
        this.ship.model.visible = true;
        this.updateChaseCamera();
      } else {
        this.ship.model.visible = false;
        this.ship.syncCamera(this.camera);
      }

      this.doors.update(sdt, this.ship.position, this.keys);

      // Weapon selection: 1-6 primary, 0 cycles missiles, 7 chrono.
      // Edge-triggered so holding 0 doesn't spin through missiles.
      for (let s = 0; s <= 7; s++) {
        const d = this.game.input.isDown(`Digit${s}`);
        if (d && !this.digitDown[s]) this.weapons.selectSlot(s);
        this.digitDown[s] = d;
      }

      this.tmpFwd.set(0, 0, -1).applyQuaternion(this.ship.quaternion);
      this.tmpRight.set(1, 0, 0).applyQuaternion(this.ship.quaternion);
      const fireDown = this.game.input.isMouseDown(0);
      if (
        this.weapons.current === "chrono" &&
        fireDown &&
        !this.fireWasDown &&
        this.chronoActive <= 0 &&
        this.chronoCool <= 0 &&
        this.weapons.chronoLevel > 0
      ) {
        this.chronoActive = CHRONO_DUR[this.weapons.chronoLevel] || 3.5;
        this.game.sfx.spawn();
      }
      this.fireWasDown = fireDown;
      this.weapons.fire(
        fireDown,
        this.ship.position,
        this.tmpFwd,
        this.tmpRight,
      );

      this.weapons.update(sdt);
      this.enemies.update(sdt, this.ship.position, this.weapons);
      this.game.music.setIntensity(this.enemies.threat);

      // Energy charge rooms: top up while inside the glowing core.
      let charging = false;
      for (const z of this.level.energyZones) {
        if (this.ship.position.distanceTo(z.pos) < z.r) {
          charging = true;
          break;
        }
      }
      const recharging = charging && this.weapons.energy01 < 1;
      if (recharging) {
        // Fast up to the base 100, then a slow trickle into the
        // upgraded 100–200 overcharge band.
        const over = this.weapons.energyValue >= 100;
        this.weapons.addEnergy(ENERGY_ROOM_RATE * (over ? 0.4 : 1) * dt);
      }
      this.chargeEl.style.opacity = recharging ? "1" : "0";
      this.setCharge(recharging);

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
          this.winStart.copy(this.ship.position);
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
          this.shield = this.shieldMax;
        } else if (k === "rockets") {
          this.weapons.addRockets(ROCKET_PICKUP);
        } else if (k === "laser") {
          this.weapons.addLaserLevel();
        } else if (k === "energy") {
          this.weapons.addEnergy(65);
        } else if (k === "vammo") {
          this.weapons.addVulcan(VAMMO_PICKUP);
        } else if (k === "ecap") {
          this.weapons.addEnergyCapacity();
        } else if (k === "scap") {
          this.shieldMax = UP_SHIELD;
          this.shield = this.shieldMax;
        } else if (k === "quad") {
          this.weapons.addQuad();
        } else if (k === "chrono") {
          this.weapons.addChrono();
        } else if (k === "keyblue") {
          this.keys.blue = true;
        } else if (k === "keyred") {
          this.keys.red = true;
        } else if (k === "keyyellow") {
          this.keys.yellow = true;
        } else if (WPN_OF[k]) {
          this.weapons.addWeapon(WPN_OF[k]!);
        }
        const info = PICKUP_INFO[k];
        this.flashT = 0.55;
        this.flashColor = info.css;
        this.pickupEl.textContent =
          k === "laser"
            ? `LASER L${this.weapons.laserLevel}`
            : k === "chrono"
              ? `CHRONO L${this.weapons.chronoLevel}`
              : info.label;
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
      if (this.shieldDelay <= 0 && this.shield < this.shieldMax) {
        this.shield = Math.min(
          this.shieldMax,
          this.shield + SHIELD_REGEN * dt,
        );
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
      this.shieldEl.style.width = `${Math.max(0, (this.shield / this.shieldMax) * 100).toFixed(0)}%`;
      const wp = this.weapons.current;
      const isLaser = wp === "laser" || wp === "superlaser";
      this.rktEl.textContent =
        wp === "chrono"
          ? `CHRONOSPHERE L${this.weapons.chronoLevel}`
          : isLaser
            ? `${WEAPON_NAME[wp]} L${this.weapons.laserLevel}${
                this.weapons.hasQuad ? " [QUAD]" : ""
              }`
            : WEAPON_NAME[wp];
      this.laserEl.textContent =
        wp === "chrono"
          ? this.chronoActive > 0
            ? `ACTIVE ${this.chronoActive.toFixed(1)}s`
            : this.chronoCool > 0
              ? `CHARGING ${this.chronoCool.toFixed(0)}s`
              : this.weapons.chronoLevel > 0
                ? "READY"
                : "—"
          : SECONDARY.includes(wp)
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

    const T_HYPER = 3.4; // leave the mine, engage hyperdrive
    const T_JUMP = 4.6; // light-speed flash
    const T_BLACK = 5.1; // pure black screen
    const T_TEXT = 5.8; // completion text
    const t = this.winTimer;

    // --- Phase 1: still inside the mine — fly out, mine blows behind ---
    if (t < T_HYPER) {
      this.ship.model.visible = true;
      this.ship.model.rotation.set(0, 0, 0); // nose along -Z (outward)
      // Accelerating burn out through the mine mouth.
      const sz = this.winStart.z - (26 * t + 7 * t * t);
      this.ship.position.set(this.winStart.x, this.winStart.y, sz);
      this.ship.model.position.copy(this.ship.position);

      // Bright daylight spilling in from the open mouth ahead.
      const near = t / T_HYPER;
      this.escapeLight.color.setHex(0xdff0ff);
      this.escapeLight.intensity = 160 + near * 520;
      this.escapeLight.distance = 220;
      this.escapeLight.position.set(
        this.winStart.x,
        this.winStart.y + 2,
        sz - 26,
      );

      // Camera chases from behind, with a collapse rumble that eases off.
      const shake = (1 - near) * 0.9;
      this.camera.position.set(
        this.winStart.x + 4 + (Math.random() - 0.5) * shake,
        this.winStart.y + 3 + (Math.random() - 0.5) * shake,
        sz + 17 + (Math.random() - 0.5) * shake,
      );
      this.camera.lookAt(this.winStart.x, this.winStart.y, sz - 30);
      this.level.update(dt, this.ship.position);

      this.deathFx.update(dt);
      this.winBoomTimer -= dt;
      if (this.winBoomTimer <= 0) {
        this.winBoomTimer = 0.1 + Math.random() * 0.08;
        const big = Math.random() < 0.4;
        this.deathFx.trigger(
          new THREE.Vector3(
            this.winStart.x + (Math.random() - 0.5) * 30,
            this.winStart.y + (Math.random() - 0.5) * 22,
            sz + 14 + Math.random() * 70,
          ),
          { laser: 0, rockets: 0 },
        );
        this.game.sfx.explosion(big ? 3.2 : 2.2);
      }
      // Light bloom into the jump flash as the mouth swallows the screen.
      this.winFade.style.background = "#dfeaff";
      this.winFade.style.opacity = `${Math.max(0, (near - 0.78) / 0.22) * 0.55}`;
      return;
    }

    // --- Phase 2: cut to open space + Star Wars hyperdrive ---
    if (!this.winInit) {
      this.winInit = true;
      this.level.group.visible = false;
      this.scene.fog = null;
      (this.scene.background as THREE.Color).set(0x05060c);
      this.starfield.visible = true;
      this.deathFx.reset();
      this.ship.model.visible = true;
      this.ship.model.rotation.set(0, Math.PI, 0); // nose along +Z
      this.game.sfx.spawn(); // hyperdrive whoosh
    }

    const ht = t - T_HYPER;
    const z = -20 + 60 * ht + 700 * ht * ht; // streaks away fast
    this.ship.position.set(0, 0, z);
    this.ship.model.position.copy(this.ship.position);
    this.escapeLight.intensity = 200;
    this.escapeLight.position.set(0, 4, z + 3);
    this.camera.position.set(-6, 3.4, -20 + 18 * ht - (14 + ht * 8));
    this.camera.lookAt(0, 0.5, this.camera.position.z + 30);

    // Hyperdrive starlines: streaks erupt and stretch past the camera.
    if (t < T_BLACK) {
      this.starfield.visible = false;
      this.warp.visible = true;
      const k = Math.min(1, ht / (T_JUMP - T_HYPER));
      this.warp.position.z = this.camera.position.z + 40;
      this.warp.scale.set(1, 1, 1 + k * 60);
      (this.warp.material as THREE.LineBasicMaterial).opacity =
        0.35 + k * 0.65;
    }

    // White blink → pure black, then the text.
    if (t < T_JUMP) {
      // Carry the mouth bloom across the cut, then fade to reveal space.
      const f = Math.max(0, 0.55 - (t - T_HYPER) * 1.6);
      this.winFade.style.background = "#dfeaff";
      this.winFade.style.opacity = `${f}`;
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
          this.game.loadout = {
            ...this.weapons.exportLoadout(),
            hull: this.hull,
            shield: this.shield,
            shieldMax: this.shieldMax,
          };
          this.game.levelIndex += 1;
          this.game.setState(new BriefingState());
        } else if (storyDone) {
          this.game.loadout = null;
          this.game.music.setScene("menu");
          this.game.setState(new LeaderboardState(true));
        } else {
          this.game.loadout = null;
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
        this.game.loadout = null;
        this.game.setState(new MenuState());
      } else {
        this.respawn();
      }
    }
  }

  exit() {
    this.setCharge(false);
    this.game.input.exitPointerLock();
    this.game.renderer.domElement.removeEventListener("click", this.onClick);
    this.root.remove();
    this.pause.remove();
    this.deathEl.remove();
    this.winFade.remove();
    this.chronoEl.remove();
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
