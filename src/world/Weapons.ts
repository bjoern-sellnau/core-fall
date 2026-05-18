import * as THREE from "three";
import { RAPIER } from "../physics/Physics";
import type { Sfx } from "../audio/Sfx";

export const ROCKET_SPEED = 85;
const ROCKET_LIFETIME = 4;
const ROCKET_INTERVAL = 0.6;
const MAX_ENERGY = 100;
const MUZZLE = 2.2;
const MAX_LASER_LEVEL = 4;

export type Weapon =
  // primaries (energy / vulcan ammo) — number keys 1..6
  | "laser"
  | "superlaser"
  | "vulcan"
  | "plasma"
  | "spreadfire"
  | "fusion"
  // secondaries (shared missile ammo) — cycled with 0
  | "rockets"
  | "homing"
  | "proximity"
  | "smart"
  | "mega"
  // gadget — key 7
  | "chrono";

export const PRIMARY: Weapon[] = [
  "laser",
  "superlaser",
  "vulcan",
  "plasma",
  "spreadfire",
  "fusion",
];

export const SECONDARY: Weapon[] = [
  "rockets",
  "homing",
  "proximity",
  "smart",
  "mega",
];

export const WEAPON_NAME: Record<Weapon, string> = {
  laser: "LASER",
  superlaser: "SUPER LASER",
  vulcan: "VULCAN",
  plasma: "PLASMA",
  spreadfire: "SPREADFIRE",
  fusion: "FUSION",
  rockets: "CONCUSSION",
  homing: "HOMING",
  proximity: "PROX BOMB",
  smart: "SMART MSL",
  mega: "MEGA MSL",
  chrono: "CHRONOSPHERE",
};

/** Missile ammo cost per shot, by secondary kind. */
const MISSILE_COST: Record<string, number> = {
  rockets: 1,
  homing: 1,
  proximity: 1,
  smart: 2,
  mega: 4,
};

export interface Bolt {
  mesh: THREE.Mesh;
  dir: THREE.Vector3;
  life: number;
  speed: number;
  damage: number;
}

export type RocketKind =
  | "rockets"
  | "homing"
  | "proximity"
  | "smart"
  | "mega";

export interface Rocket {
  mesh: THREE.Mesh;
  dir: THREE.Vector3;
  life: number;
  kind: RocketKind;
  speed: number;
  homing: boolean;
  splash: number; // splash radius (Enemies reads this)
  trigger: number; // proximity trigger radius
  dmgFactory: number; // damage dealt to a factory
  dmgReactor: number; // damage dealt to the reactor
}

interface Boom {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  life: number;
  max: number;
  grow: number;
}

/**
 * Multi-weapon system, Descent style. Number keys 1-6 select the active
 * primary, 0 cycles owned secondaries (missiles), 7 the Chronosphere.
 * The fire button fires whatever is selected. Primaries draw the energy
 * tank (Vulcan uses ammo); energy no longer auto-recharges — collect
 * energy or sit in a charge room.
 */
export class WeaponSystem {
  readonly group = new THREE.Group();

  private boltList: Bolt[] = [];
  private rocketList: Rocket[] = [];
  private booms: Boom[] = [];

  private cooldown = 0;
  private rocketCool = 0;
  private energy = MAX_ENERGY;
  private charge = 0; // fusion charge
  private prevFiring = false;

  private laser = 1;
  private quad = false;
  private rockets = 0;
  private vulcan = 0;
  private chrono = 0; // chronosphere level (0 = not owned)
  private selected: Weapon = "laser";
  private owned = new Set<Weapon>(["laser"]);

  /** Live enemy points, wired by PlayState for homing/smart guidance. */
  private targetSource: () => THREE.Vector3[] = () => [];

  private readonly geoBolt = new THREE.BoxGeometry(0.16, 0.16, 2.0);
  private readonly geoSlug = new THREE.BoxGeometry(0.18, 0.18, 0.6);
  private readonly geoBall = new THREE.SphereGeometry(0.5, 10, 10);
  private readonly geoFusion = new THREE.SphereGeometry(0.9, 12, 12);
  private readonly rocketGeo = new THREE.CapsuleGeometry(0.32, 1.1, 4, 8);
  private readonly mineGeo = new THREE.IcosahedronGeometry(0.7, 0);
  private readonly boomGeo = new THREE.SphereGeometry(0.5, 10, 10);
  private readonly mats: Record<string, THREE.MeshBasicMaterial> = {
    laser: new THREE.MeshBasicMaterial({ color: 0x66f0ff }),
    superlaser: new THREE.MeshBasicMaterial({ color: 0xff4d4d }),
    vulcan: new THREE.MeshBasicMaterial({ color: 0xffe06a }),
    plasma: new THREE.MeshBasicMaterial({ color: 0x66ff88 }),
    spreadfire: new THREE.MeshBasicMaterial({ color: 0xffa6f0 }),
    fusion: new THREE.MeshBasicMaterial({ color: 0xc8a0ff }),
    rockets: new THREE.MeshBasicMaterial({ color: 0xffae50 }),
    homing: new THREE.MeshBasicMaterial({ color: 0x66ffd0 }),
    proximity: new THREE.MeshBasicMaterial({ color: 0xff5a5a }),
    smart: new THREE.MeshBasicMaterial({ color: 0xff66cc }),
    mega: new THREE.MeshBasicMaterial({ color: 0xff3030 }),
  };
  private readonly zAxis = new THREE.Vector3(0, 0, 1);
  private readonly up = new THREE.Vector3();
  private readonly lightPool: THREE.PointLight[] = [];

  constructor(
    private readonly world: RAPIER.World,
    private readonly excludeBody: RAPIER.RigidBody,
    private readonly sfx: Sfx,
  ) {
    for (let i = 0; i < 6; i++) {
      const l = new THREE.PointLight(0x66f0ff, 0, 34, 1.8);
      this.group.add(l);
      this.lightPool.push(l);
    }
  }

  setTargetSource(fn: () => THREE.Vector3[]) {
    this.targetSource = fn;
  }

  get energy01() {
    return this.energy / MAX_ENERGY;
  }
  get laserLevel() {
    return this.laser;
  }
  get hasQuad() {
    return this.quad;
  }
  get rocketAmmo() {
    return this.rockets;
  }
  get vulcanAmmo() {
    return this.vulcan;
  }
  get chronoLevel() {
    return this.chrono;
  }
  get current() {
    return this.selected;
  }
  get chargeFrac() {
    return this.charge / 1.4;
  }
  get bolts(): readonly Bolt[] {
    return this.boltList;
  }
  get activeRockets(): readonly Rocket[] {
    return this.rocketList;
  }

  addLaserLevel() {
    this.laser = Math.min(MAX_LASER_LEVEL, this.laser + 1);
  }
  addQuad() {
    this.quad = true;
  }
  addRockets(n: number) {
    this.rockets += n;
    this.owned.add("rockets"); // picking up rockets unlocks the launcher
  }
  addVulcan(n: number) {
    this.vulcan += n;
  }
  addEnergy(n: number) {
    this.energy = Math.min(MAX_ENERGY, this.energy + n);
  }
  addChrono() {
    this.chrono = Math.min(3, this.chrono + 1);
    this.owned.add("chrono");
  }

  get owns() {
    return [...this.owned];
  }
  has(w: Weapon) {
    return this.owned.has(w);
  }

  /** Unlock a weapon; if already owned, top up its ammo / energy. */
  addWeapon(w: Weapon) {
    if (!this.owned.has(w)) {
      this.owned.add(w);
      if (w === "vulcan") this.vulcan += 300;
      else if (SECONDARY.includes(w)) this.rockets += 6;
      this.selected = w;
    } else if (w === "vulcan") {
      this.vulcan += 200;
    } else if (SECONDARY.includes(w)) {
      this.rockets += 6;
    } else {
      this.energy = MAX_ENERGY;
    }
    this.charge = 0;
    this.sfx.weaponSelect();
  }

  /** Carry the loadout between story levels. */
  exportLoadout() {
    return {
      weapons: [...this.owned],
      laser: this.laser,
      vulcan: this.vulcan,
      rockets: this.rockets,
      quad: this.quad,
      chrono: this.chrono,
    };
  }
  importLoadout(l: {
    weapons: string[];
    laser: number;
    vulcan: number;
    rockets: number;
    quad?: boolean;
    chrono?: number;
  }) {
    const ws = (l.weapons.length ? l.weapons : ["laser"]) as Weapon[];
    this.owned = new Set(ws);
    this.laser = l.laser;
    this.vulcan = l.vulcan;
    this.rockets = l.rockets;
    this.quad = !!l.quad;
    this.chrono = l.chrono ?? 0;
    this.selected = "laser";
  }

  /** Owned weapons except the starting laser (dropped on death). */
  extraWeapons(): Weapon[] {
    return [...this.owned].filter((w) => w !== "laser" && w !== "chrono");
  }

  /** Strip back to the starting loadout (ship destroyed). */
  resetToBase() {
    this.owned = new Set<Weapon>(["laser"]);
    this.laser = 1;
    this.quad = false;
    this.rockets = 0;
    this.vulcan = 0;
    this.energy = MAX_ENERGY;
    this.selected = "laser";
    this.charge = 0;
    // The Chronosphere is a gadget, not gear — it survives a respawn.
    if (this.chrono > 0) this.owned.add("chrono");
  }

  /** 1-6 → primary, 0 → next owned missile, 7 → chrono. */
  selectSlot(slot: number) {
    let next = this.selected;
    if (slot === 7) {
      next = "chrono";
    } else if (slot === 0) {
      const ownedSec = SECONDARY.filter((w) => this.owned.has(w));
      if (ownedSec.length === 0) {
        this.sfx.hit();
        return;
      }
      const here = ownedSec.indexOf(this.selected);
      next = ownedSec[(here + 1) % ownedSec.length];
    } else if (slot >= 1 && slot <= PRIMARY.length) {
      next = PRIMARY[slot - 1];
    }
    if (next === this.selected && slot !== 0) return;
    if (!this.owned.has(next)) {
      this.sfx.hit();
      return;
    }
    this.selected = next;
    this.charge = 0;
    this.sfx.weaponSelect();
  }

  kill(b: Bolt) {
    const i = this.boltList.indexOf(b);
    if (i >= 0) this.removeBolt(i);
  }

  detonateRocket(r: Rocket) {
    const i = this.rocketList.indexOf(r);
    if (i < 0) return;
    const big = r.kind === "mega";
    this.spawnBoom(
      r.mesh.position,
      big ? 16 : 9,
      big ? 0.55 : 0.4,
      big ? 0xff5030 : 0xffb066,
    );
    this.sfx.explosion(big ? 2.2 : 1.4);
    if (r.kind === "smart") {
      // Bursts into a cloud of seeking sub-bolts.
      for (let k = 0; k < 7; k++) {
        const d = new THREE.Vector3(
          Math.random() - 0.5,
          Math.random() - 0.5,
          Math.random() - 0.5,
        ).normalize();
        const mesh = new THREE.Mesh(this.geoBall, this.mats.smart);
        mesh.position.copy(r.mesh.position);
        mesh.quaternion.setFromUnitVectors(this.zAxis, d);
        this.group.add(mesh);
        this.boltList.push({
          mesh,
          dir: d,
          life: 1.1,
          speed: 90,
          damage: 2.4,
        });
      }
    }
    this.removeRocket(i);
  }

  /** Drive firing each frame from the held fire button. */
  fire(
    firing: boolean,
    pos: THREE.Vector3,
    fwd: THREE.Vector3,
    right: THREE.Vector3,
  ) {
    // The Chronosphere is not a weapon; PlayState handles its trigger.
    if (this.selected === "chrono") {
      this.prevFiring = firing;
      return;
    }

    const released = this.prevFiring && !firing;

    if (this.selected === "fusion") {
      if (firing && this.energy > 4) {
        this.charge = Math.min(1.4, this.charge + 0.016);
      } else if ((released || this.charge >= 1.4) && this.charge > 0.2) {
        const dmg = 4 + this.charge * 9;
        this.energy = Math.max(0, this.energy - (10 + this.charge * 20));
        this.spawn(pos, fwd, 0, "fusion", {
          speed: 95,
          life: 2.6,
          damage: dmg,
          scale: 1 + this.charge,
        });
        this.sfx.laser();
        this.charge = 0;
      }
      this.prevFiring = firing;
      return;
    }
    this.charge = 0;

    if (firing && this.cooldown <= 0) this.fireSelected(pos, fwd, right);
    this.prevFiring = firing;
  }

  private fireSelected(
    pos: THREE.Vector3,
    fwd: THREE.Vector3,
    right: THREE.Vector3,
  ) {
    switch (this.selected) {
      case "laser":
      case "superlaser": {
        const sup = this.selected === "superlaser";
        // Workhorse weapon — keep it cheap so the tank lasts.
        const cost = (sup ? 3 : 1.5) + (this.laser - 1) * (sup ? 0.7 : 0.4);
        if (this.energy < cost) return;
        const sides =
          this.laser >= 4
            ? [-1.4, -0.5, 0.5, 1.4]
            : this.laser === 3
              ? [-1, 0, 1]
              : this.laser >= 2
                ? [-0.8, 0.8]
                : [0];
        const all = this.quad
          ? sides.flatMap((s) => [s - 0.35, s + 0.35])
          : sides;
        for (const s of all) {
          this.spawn(pos, fwd, s, this.selected, {
            speed: sup ? 200 : 160,
            life: 2.2,
            damage: (sup ? 2.4 : 1.2) + (this.laser - 1) * 0.6,
            right,
          });
        }
        this.energy -= cost;
        this.cooldown = sup ? 0.09 : 0.13;
        this.sfx.laser();
        break;
      }
      case "spreadfire": {
        if (this.energy < 6) return;
        this.energy -= 6;
        this.up.crossVectors(right, fwd).normalize();
        const fan = [-0.2, -0.1, 0, 0.1, 0.2];
        for (const a of fan) {
          const d = fwd.clone().applyAxisAngle(this.up, a).normalize();
          this.spawn(pos, d, 0, "spreadfire", {
            speed: 150,
            life: 1.8,
            damage: 1.5,
          });
        }
        // A light vertical splay so it fills a corridor.
        for (const a of [-0.12, 0.12]) {
          const d = fwd.clone().applyAxisAngle(right, a).normalize();
          this.spawn(pos, d, 0, "spreadfire", {
            speed: 150,
            life: 1.8,
            damage: 1.5,
          });
        }
        this.cooldown = 0.16;
        this.sfx.laser();
        break;
      }
      case "vulcan": {
        if (this.vulcan <= 0) return;
        this.vulcan -= 1;
        const j = () => (Math.random() - 0.5) * 0.06;
        const d = fwd.clone();
        d.x += j();
        d.y += j();
        d.z += j();
        d.normalize();
        this.spawn(pos, d, 0, "vulcan", {
          speed: 220,
          life: 1.6,
          damage: 1,
        });
        this.cooldown = 0.06;
        this.sfx.impact();
        break;
      }
      case "plasma": {
        if (this.energy < 7) return;
        this.energy -= 7;
        for (const s of [-0.5, 0.5]) {
          this.spawn(pos, fwd, s, "plasma", {
            speed: 130,
            life: 2.0,
            damage: 2.2,
            right,
          });
        }
        this.cooldown = 0.08;
        this.sfx.laser();
        break;
      }
      case "rockets":
      case "homing":
      case "proximity":
      case "smart":
      case "mega":
        this.fireMissile(this.selected, pos, fwd);
        break;
    }
  }

  private fireMissile(
    kind: RocketKind,
    pos: THREE.Vector3,
    fwd: THREE.Vector3,
  ) {
    const cost = MISSILE_COST[kind];
    if (this.rocketCool > 0 || this.rockets < cost) return;
    this.rockets -= cost;
    const interval =
      kind === "mega" ? 1.1 : kind === "proximity" ? 0.5 : ROCKET_INTERVAL;
    this.rocketCool = interval;
    this.cooldown = interval;

    const prox = kind === "proximity";
    const mesh = new THREE.Mesh(
      prox ? this.mineGeo : this.rocketGeo,
      this.mats[kind],
    );
    mesh.position.copy(pos).addScaledVector(fwd, MUZZLE);
    mesh.quaternion.setFromUnitVectors(this.zAxis, fwd);
    if (kind === "mega") mesh.scale.setScalar(1.6);
    this.group.add(mesh);
    this.rocketList.push({
      mesh,
      dir: fwd.clone(),
      life: prox ? 22 : kind === "mega" ? 5 : ROCKET_LIFETIME,
      kind,
      speed: prox ? 0 : kind === "mega" ? 60 : ROCKET_SPEED,
      homing: kind === "homing" || kind === "smart",
      splash:
        kind === "mega" ? 26 : kind === "proximity" ? 18 : 13,
      trigger: prox ? 7 : 3.5,
      dmgFactory: kind === "mega" ? 20 : kind === "proximity" ? 10 : 6,
      dmgReactor: kind === "mega" ? 26 : kind === "proximity" ? 14 : 8,
    });
    this.sfx.rocket();
  }

  private spawn(
    pos: THREE.Vector3,
    dir: THREE.Vector3,
    side: number,
    kind: string,
    o: {
      speed: number;
      life: number;
      damage: number;
      right?: THREE.Vector3;
      scale?: number;
    },
  ) {
    const geo =
      kind === "plasma"
        ? this.geoBall
        : kind === "fusion"
          ? this.geoFusion
          : kind === "vulcan"
            ? this.geoSlug
            : this.geoBolt;
    const mesh = new THREE.Mesh(geo, this.mats[kind]);
    mesh.position.copy(pos).addScaledVector(dir, MUZZLE);
    if (side !== 0 && o.right) mesh.position.addScaledVector(o.right, side * 0.7);
    mesh.quaternion.setFromUnitVectors(this.zAxis, dir);
    if (o.scale) mesh.scale.setScalar(o.scale);
    this.group.add(mesh);
    this.boltList.push({
      mesh,
      dir: dir.clone(),
      life: o.life,
      speed: o.speed,
      damage: o.damage,
    });
  }

  /** Nearest live enemy point to `p` within `maxD`, else null. */
  private nearestTarget(
    p: THREE.Vector3,
    maxD: number,
  ): THREE.Vector3 | null {
    let best: THREE.Vector3 | null = null;
    let bestD = maxD * maxD;
    for (const t of this.targetSource()) {
      const d = p.distanceToSquared(t);
      if (d < bestD) {
        bestD = d;
        best = t;
      }
    }
    return best;
  }

  update(dt: number) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.rocketCool = Math.max(0, this.rocketCool - dt);

    for (let i = this.boltList.length - 1; i >= 0; i--) {
      const b = this.boltList[i];
      b.life -= dt;
      const step = b.speed * dt;
      const hit = this.world.castRay(
        new RAPIER.Ray(b.mesh.position, b.dir),
        step,
        true,
        undefined,
        undefined,
        undefined,
        this.excludeBody,
      );
      if (hit) {
        this.spawnBoom(
          b.mesh.position.clone().addScaledVector(b.dir, hit.timeOfImpact),
          3,
          0.18,
          0x9ff6ff,
        );
        this.sfx.impact();
        this.removeBolt(i);
        continue;
      }
      b.mesh.position.addScaledVector(b.dir, step);
      if (b.life <= 0) this.removeBolt(i);
    }

    for (let i = this.rocketList.length - 1; i >= 0; i--) {
      const r = this.rocketList[i];
      r.life -= dt;

      if (r.homing) {
        const tgt = this.nearestTarget(r.mesh.position, 90);
        if (tgt) {
          const want = tgt
            .clone()
            .sub(r.mesh.position)
            .normalize();
          r.dir.lerp(want, Math.min(1, 3.5 * dt)).normalize();
          r.mesh.quaternion.setFromUnitVectors(this.zAxis, r.dir);
        }
      }

      const step = r.speed * dt;
      if (step > 0) {
        const hit = this.world.castRay(
          new RAPIER.Ray(r.mesh.position, r.dir),
          step,
          true,
          undefined,
          undefined,
          undefined,
          this.excludeBody,
        );
        if (hit) {
          this.detonateRocket(r);
          continue;
        }
        r.mesh.position.addScaledVector(r.dir, step);
      } else {
        r.mesh.rotation.y += dt * 1.5; // armed mine idle spin
      }
      if (r.life <= 0) {
        if (r.kind === "proximity" || r.kind === "smart") {
          this.detonateRocket(r);
        } else {
          this.removeRocket(i);
        }
      }
    }

    for (let i = this.booms.length - 1; i >= 0; i--) {
      const bm = this.booms[i];
      bm.life -= dt;
      const k = Math.max(0, bm.life / bm.max);
      bm.mesh.scale.setScalar(1 + (1 - k) * bm.grow);
      bm.mat.opacity = k;
      if (bm.life <= 0) {
        this.group.remove(bm.mesh);
        bm.mat.dispose();
        this.booms.splice(i, 1);
      }
    }

    this.updateLights();
  }

  private updateLights() {
    let n = 0;
    for (const r of this.rocketList) {
      if (n >= this.lightPool.length) break;
      const l = this.lightPool[n++];
      l.color.setHex(r.kind === "mega" ? 0xff5030 : 0xffae50);
      l.intensity = 26;
      l.distance = 40;
      l.position.copy(r.mesh.position);
    }
    for (let i = this.booms.length - 1; i >= 0 && n < this.lightPool.length; i--) {
      const l = this.lightPool[n++];
      l.color.setHex(0xbfefff);
      l.intensity = 40;
      l.distance = 46;
      l.position.copy(this.booms[i].mesh.position);
    }
    for (const b of this.boltList) {
      if (n >= this.lightPool.length) break;
      const l = this.lightPool[n++];
      l.color.setHex(0x88e0ff);
      l.intensity = 16;
      l.distance = 30;
      l.position.copy(b.mesh.position);
    }
    for (; n < this.lightPool.length; n++) this.lightPool[n].intensity = 0;
  }

  private removeBolt(i: number) {
    this.group.remove(this.boltList[i].mesh);
    this.boltList.splice(i, 1);
  }

  private removeRocket(i: number) {
    this.group.remove(this.rocketList[i].mesh);
    this.rocketList.splice(i, 1);
  }

  private spawnBoom(
    p: THREE.Vector3,
    grow: number,
    max: number,
    color: number,
  ) {
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(this.boomGeo, mat);
    mesh.position.copy(p);
    this.group.add(mesh);
    this.booms.push({ mesh, mat, life: max, max, grow });
  }

  dispose() {
    this.geoBolt.dispose();
    this.geoSlug.dispose();
    this.geoBall.dispose();
    this.geoFusion.dispose();
    this.rocketGeo.dispose();
    this.mineGeo.dispose();
    this.boomGeo.dispose();
    for (const k of Object.keys(this.mats)) this.mats[k].dispose();
    this.boltList = [];
    this.rocketList = [];
    this.booms = [];
  }
}
