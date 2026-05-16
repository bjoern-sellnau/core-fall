import * as THREE from "three";
import { RAPIER } from "../physics/Physics";
import type { Sfx } from "../audio/Sfx";

export const BOLT_SPEED = 150; // units / s
export const ROCKET_SPEED = 85;
const BOLT_LIFETIME = 2.4;
const ROCKET_LIFETIME = 4;
const FIRE_INTERVAL = 0.13;
const ROCKET_INTERVAL = 0.6;
const MAX_ENERGY = 100;
const SHOT_COST = 9;
const RECHARGE = 30;
const CANNON_SPREAD = 0.7;
const MUZZLE_FORWARD = 2.2;
const MAX_LASER_LEVEL = 3;

export interface Bolt {
  mesh: THREE.Mesh;
  dir: THREE.Vector3;
  life: number;
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
 * Player weapons: a levelled twin-laser (energy budget) plus rockets
 * (ammo). Projectiles are swept against the Rapier world each frame.
 */
export class WeaponSystem {
  readonly group = new THREE.Group();

  private boltList: Bolt[] = [];
  private rocketList: Rocket[] = [];
  private booms: Boom[] = [];
  private cooldown = 0;
  private rocketCool = 0;
  private energy = MAX_ENERGY;

  private laser = 1;
  private rockets = 0;

  private readonly boltGeo = new THREE.BoxGeometry(0.16, 0.16, 2.0);
  private readonly boltMat = new THREE.MeshBasicMaterial({ color: 0x66f0ff });
  private readonly rocketGeo = new THREE.CapsuleGeometry(0.32, 1.1, 4, 8);
  private readonly rocketMat = new THREE.MeshBasicMaterial({ color: 0xffae50 });
  private readonly boomGeo = new THREE.SphereGeometry(0.5, 10, 10);
  private readonly zAxis = new THREE.Vector3(0, 0, 1);

  // Pooled lights so projectiles illuminate dark rooms as they fly.
  private readonly lightPool: THREE.PointLight[] = [];

  constructor(
    private readonly world: RAPIER.World,
    private readonly excludeBody: RAPIER.RigidBody,
    private readonly sfx: Sfx,
  ) {
    for (let i = 0; i < 10; i++) {
      const l = new THREE.PointLight(0x66f0ff, 0, 34, 1.8);
      l.visible = false;
      this.group.add(l);
      this.lightPool.push(l);
    }
  }

  get energy01(): number {
    return this.energy / MAX_ENERGY;
  }
  get laserLevel(): number {
    return this.laser;
  }
  get rocketAmmo(): number {
    return this.rockets;
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

  kill(b: Bolt) {
    const i = this.boltList.indexOf(b);
    if (i >= 0) this.removeBolt(i);
  }

  /** Detonate a rocket externally (enemy splash). */
  detonateRocket(r: Rocket) {
    const i = this.rocketList.indexOf(r);
    if (i < 0) return;
    this.spawnBoom(r.mesh.position, 9, 0.4, 0xffb066);
    this.sfx.explosion(1.4);
    this.removeRocket(i);
  }

  /** Returns true on the frame a laser volley actually fires. */
  tryFire(
    pos: THREE.Vector3,
    fwd: THREE.Vector3,
    right: THREE.Vector3,
  ): boolean {
    const sides =
      this.laser >= 3
        ? [-1.4, -0.5, 0.5, 1.4]
        : this.laser === 2
          ? [-1, 0, 1]
          : [-1, 1];
    const cost = SHOT_COST + (sides.length - 2) * 2;
    if (this.cooldown > 0 || this.energy < cost) return false;
    this.cooldown = FIRE_INTERVAL;
    this.energy -= cost;

    const q = new THREE.Quaternion().setFromUnitVectors(this.zAxis, fwd);
    for (const side of sides) {
      const origin = pos
        .clone()
        .addScaledVector(fwd, MUZZLE_FORWARD)
        .addScaledVector(right, side * CANNON_SPREAD);
      const mesh = new THREE.Mesh(this.boltGeo, this.boltMat);
      mesh.position.copy(origin);
      mesh.quaternion.copy(q);
      this.group.add(mesh);
      this.boltList.push({ mesh, dir: fwd.clone(), life: BOLT_LIFETIME });
    }
    return true;
  }

  /** Returns true on the frame a rocket launches. */
  tryFireRocket(pos: THREE.Vector3, fwd: THREE.Vector3): boolean {
    if (this.rocketCool > 0 || this.rockets <= 0) return false;
    this.rocketCool = ROCKET_INTERVAL;
    this.rockets -= 1;

    const q = new THREE.Quaternion().setFromUnitVectors(this.zAxis, fwd);
    const mesh = new THREE.Mesh(this.rocketGeo, this.rocketMat);
    mesh.position.copy(pos).addScaledVector(fwd, MUZZLE_FORWARD);
    mesh.quaternion.copy(q);
    this.group.add(mesh);
    this.rocketList.push({ mesh, dir: fwd.clone(), life: ROCKET_LIFETIME });
    return true;
  }

  update(dt: number) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.rocketCool = Math.max(0, this.rocketCool - dt);
    this.energy = Math.min(MAX_ENERGY, this.energy + RECHARGE * dt);

    for (let i = this.boltList.length - 1; i >= 0; i--) {
      const b = this.boltList[i];
      b.life -= dt;
      const step = BOLT_SPEED * dt;
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

  /** Park pool lights on the newest projectiles + active blasts. */
  private updateLights() {
    let n = 0;
    for (const r of this.rocketList) {
      if (n >= this.lightPool.length) break;
      const l = this.lightPool[n++];
      l.visible = true;
      l.color.setHex(0xffae50);
      l.intensity = 26;
      l.distance = 40;
      l.position.copy(r.mesh.position);
    }
    for (let i = this.booms.length - 1; i >= 0 && n < this.lightPool.length; i--) {
      const l = this.lightPool[n++];
      l.visible = true;
      l.color.setHex(0xbfefff);
      l.intensity = 40;
      l.distance = 46;
      l.position.copy(this.booms[i].mesh.position);
    }
    for (const b of this.boltList) {
      if (n >= this.lightPool.length) break;
      const l = this.lightPool[n++];
      l.visible = true;
      l.color.setHex(0x66f0ff);
      l.intensity = 16;
      l.distance = 30;
      l.position.copy(b.mesh.position);
    }
    for (; n < this.lightPool.length; n++) {
      this.lightPool[n].visible = false;
      this.lightPool[n].intensity = 0;
    }
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
    this.boltGeo.dispose();
    this.boltMat.dispose();
    this.rocketGeo.dispose();
    this.rocketMat.dispose();
    this.boomGeo.dispose();
    for (const bm of this.booms) bm.mat.dispose();
    this.boltList = [];
    this.rocketList = [];
    this.booms = [];
  }
}
