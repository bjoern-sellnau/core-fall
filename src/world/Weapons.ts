import * as THREE from "three";
import { RAPIER } from "../physics/Physics";

export const BOLT_SPEED = 150; // units / s
const BOLT_LIFETIME = 2.4; // s
const FIRE_INTERVAL = 0.13; // s between volleys
const MAX_ENERGY = 100;
const SHOT_COST = 9; // per twin volley
const RECHARGE = 30; // energy / s
const CANNON_SPREAD = 0.7; // lateral offset of each cannon
const MUZZLE_FORWARD = 2.2; // spawn ahead of the ship

export interface Bolt {
  mesh: THREE.Mesh;
  dir: THREE.Vector3;
  life: number;
}

interface Impact {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  life: number;
}

/**
 * Twin-laser weapon: rate-limited volleys with an energy budget that
 * recharges over time. Bolts are swept against the Rapier world each
 * frame so they detonate on tunnel/reactor geometry.
 */
export class WeaponSystem {
  readonly group = new THREE.Group();

  private boltList: Bolt[] = [];
  private impacts: Impact[] = [];
  private cooldown = 0;
  private energy = MAX_ENERGY;

  private readonly boltGeo = new THREE.BoxGeometry(0.16, 0.16, 2.0);
  private readonly boltMat = new THREE.MeshBasicMaterial({ color: 0x66f0ff });
  private readonly impactGeo = new THREE.SphereGeometry(0.5, 8, 8);
  private readonly zAxis = new THREE.Vector3(0, 0, 1);

  constructor(
    private readonly world: RAPIER.World,
    private readonly excludeBody: RAPIER.RigidBody,
  ) {}

  get energy01(): number {
    return this.energy / MAX_ENERGY;
  }

  /** Live bolts, for external hit-testing (enemies). */
  get bolts(): readonly Bolt[] {
    return this.boltList;
  }

  /** Remove a bolt that hit something external. */
  kill(b: Bolt) {
    const i = this.boltList.indexOf(b);
    if (i >= 0) this.removeBolt(i);
  }

  /**
   * Called every frame while the fire button is held; self rate-limits.
   * Returns true on the frame a volley actually leaves the cannons.
   */
  tryFire(
    pos: THREE.Vector3,
    fwd: THREE.Vector3,
    right: THREE.Vector3,
  ): boolean {
    if (this.cooldown > 0 || this.energy < SHOT_COST) return false;
    this.cooldown = FIRE_INTERVAL;
    this.energy -= SHOT_COST;

    const q = new THREE.Quaternion().setFromUnitVectors(this.zAxis, fwd);
    for (const side of [-1, 1]) {
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

  update(dt: number) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.energy = Math.min(MAX_ENERGY, this.energy + RECHARGE * dt);

    for (let i = this.boltList.length - 1; i >= 0; i--) {
      const b = this.boltList[i];
      b.life -= dt;

      const step = BOLT_SPEED * dt;
      const ray = new RAPIER.Ray(b.mesh.position, b.dir);
      const hit = this.world.castRay(
        ray,
        step,
        true,
        undefined,
        undefined,
        undefined,
        this.excludeBody,
      );

      if (hit) {
        const p = b.mesh.position
          .clone()
          .addScaledVector(b.dir, hit.timeOfImpact);
        this.spawnImpact(p);
        this.removeBolt(i);
        continue;
      }

      b.mesh.position.addScaledVector(b.dir, step);
      if (b.life <= 0) this.removeBolt(i);
    }

    for (let i = this.impacts.length - 1; i >= 0; i--) {
      const im = this.impacts[i];
      im.life -= dt;
      const k = Math.max(0, im.life / 0.18);
      im.mesh.scale.setScalar(1 + (1 - k) * 3);
      im.mat.opacity = k;
      if (im.life <= 0) {
        this.group.remove(im.mesh);
        im.mat.dispose();
        this.impacts.splice(i, 1);
      }
    }
  }

  private removeBolt(i: number) {
    this.group.remove(this.boltList[i].mesh);
    this.boltList.splice(i, 1);
  }

  private spawnImpact(p: THREE.Vector3) {
    const mat = new THREE.MeshBasicMaterial({
      color: 0x9ff6ff,
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(this.impactGeo, mat);
    mesh.position.copy(p);
    this.group.add(mesh);
    this.impacts.push({ mesh, mat, life: 0.18 });
  }

  dispose() {
    this.boltGeo.dispose();
    this.boltMat.dispose();
    this.impactGeo.dispose();
    for (const im of this.impacts) im.mat.dispose();
    this.boltList = [];
    this.impacts = [];
  }
}
