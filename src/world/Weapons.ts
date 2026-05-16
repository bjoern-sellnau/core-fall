import * as THREE from "three";
import { RAPIER } from "../physics/Physics";
import type { Sfx } from "../audio/Sfx";

export const ROCKET_SPEED = 85;
const ROCKET_LIFETIME = 4;
const ROCKET_INTERVAL = 0.6;
const MAX_ENERGY = 100;
const RECHARGE = 32;
const MUZZLE = 2.2;
const MAX_LASER_LEVEL = 4;

export type Weapon =
  | "laser"
  | "superlaser"
  | "vulcan"
  | "plasma"
  | "fusion"
  | "rockets";

export const PRIMARY: Weapon[] = [
  "laser",
  "superlaser",
  "vulcan",
  "plasma",
  "fusion",
];

export const WEAPON_NAME: Record<Weapon, string> = {
  laser: "LASER",
  superlaser: "SUPER LASER",
  vulcan: "VULCAN",
  plasma: "PLASMA",
  fusion: "FUSION",
  rockets: "ROCKETS",
};

export interface Bolt {
  mesh: THREE.Mesh;
  dir: THREE.Vector3;
  life: number;
  speed: number;
  damage: number;
}

export interface Rocket {
  mesh: THREE.Mesh;
  dir: THREE.Vector3;
  life: number;
}

interface Boom {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  life: number;
  max: number;
  grow: number;
}

/**
 * Multi-weapon system, Descent style. Number keys select the active
 * weapon (1-5 primary, 0 rockets); the fire button fires whatever is
 * selected. Primaries use the energy tank (Vulcan uses ammo).
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
  private rockets = 0;
  private vulcan = 250;
  private selected: Weapon = "laser";

  private readonly geoBolt = new THREE.BoxGeometry(0.16, 0.16, 2.0);
  private readonly geoSlug = new THREE.BoxGeometry(0.18, 0.18, 0.6);
  private readonly geoBall = new THREE.SphereGeometry(0.5, 10, 10);
  private readonly geoFusion = new THREE.SphereGeometry(0.9, 12, 12);
  private readonly rocketGeo = new THREE.CapsuleGeometry(0.32, 1.1, 4, 8);
  private readonly boomGeo = new THREE.SphereGeometry(0.5, 10, 10);
  private readonly mats: Record<string, THREE.MeshBasicMaterial> = {
    laser: new THREE.MeshBasicMaterial({ color: 0x66f0ff }),
    superlaser: new THREE.MeshBasicMaterial({ color: 0xff4d4d }),
    vulcan: new THREE.MeshBasicMaterial({ color: 0xffe06a }),
    plasma: new THREE.MeshBasicMaterial({ color: 0x66ff88 }),
    fusion: new THREE.MeshBasicMaterial({ color: 0xc8a0ff }),
    rocket: new THREE.MeshBasicMaterial({ color: 0xffae50 }),
  };
  private readonly zAxis = new THREE.Vector3(0, 0, 1);
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

  get energy01() {
    return this.energy / MAX_ENERGY;
  }
  get laserLevel() {
    return this.laser;
  }
  get rocketAmmo() {
    return this.rockets;
  }
  get vulcanAmmo() {
    return this.vulcan;
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
  addRockets(n: number) {
    this.rockets += n;
  }
  addVulcan(n: number) {
    this.vulcan += n;
  }

  /** Slot 1-5 → primary, 0 → rockets. */
  selectSlot(slot: number) {
    if (slot === 0) this.selected = "rockets";
    else if (slot >= 1 && slot <= PRIMARY.length)
      this.selected = PRIMARY[slot - 1];
  }

  kill(b: Bolt) {
    const i = this.boltList.indexOf(b);
    if (i >= 0) this.removeBolt(i);
  }

  detonateRocket(r: Rocket) {
    const i = this.rocketList.indexOf(r);
    if (i < 0) return;
    this.spawnBoom(r.mesh.position, 9, 0.4, 0xffb066);
    this.sfx.explosion(1.4);
    this.removeRocket(i);
  }

  /** Drive firing each frame from the held fire button. */
  fire(firing: boolean, pos: THREE.Vector3, fwd: THREE.Vector3, right: THREE.Vector3) {
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
        const cost = (sup ? 6 : 4) + (this.laser - 1) * 1.5;
        if (this.energy < cost) return;
        const sides =
          this.laser >= 4
            ? [-1.4, -0.5, 0.5, 1.4]
            : this.laser === 3
              ? [-1, 0, 1]
              : this.laser >= 2
                ? [-0.8, 0.8]
                : [0];
        for (const s of sides) {
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
      case "rockets": {
        if (this.rocketCool > 0 || this.rockets <= 0) return;
        this.rockets -= 1;
        this.rocketCool = ROCKET_INTERVAL;
        this.cooldown = ROCKET_INTERVAL;
        const q = new THREE.Quaternion().setFromUnitVectors(this.zAxis, fwd);
        const mesh = new THREE.Mesh(this.rocketGeo, this.mats.rocket);
        mesh.position.copy(pos).addScaledVector(fwd, MUZZLE);
        mesh.quaternion.copy(q);
        this.group.add(mesh);
        this.rocketList.push({
          mesh,
          dir: fwd.clone(),
          life: ROCKET_LIFETIME,
        });
        this.sfx.rocket();
        break;
      }
    }
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

  update(dt: number) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.rocketCool = Math.max(0, this.rocketCool - dt);
    this.energy = Math.min(MAX_ENERGY, this.energy + RECHARGE * dt);

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
      const step = ROCKET_SPEED * dt;
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
        this.spawnBoom(
          r.mesh.position.clone().addScaledVector(r.dir, hit.timeOfImpact),
          9,
          0.4,
          0xffb066,
        );
        this.sfx.explosion(1.4);
        this.removeRocket(i);
        continue;
      }
      r.mesh.position.addScaledVector(r.dir, step);
      if (r.life <= 0) this.removeRocket(i);
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
      l.color.setHex(0xffae50);
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
    this.boomGeo.dispose();
    for (const k of Object.keys(this.mats)) this.mats[k].dispose();
    this.boltList = [];
    this.rocketList = [];
    this.booms = [];
  }
}
