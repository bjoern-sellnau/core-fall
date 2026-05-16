import * as THREE from "three";
import type { Sfx } from "../audio/Sfx";
import { BOLT_SPEED, type WeaponSystem } from "./Weapons";

const DRONE_RADIUS = 2.0;
const DRONE_HP = 2;
const ORBIT_RADIUS = 4;
const ORBIT_SPEED = 0.6;
const DETECT = 85;
const MIN_PLAYER_DIST = 22;
const CHASE_SPEED = 7;

interface Drone {
  mesh: THREE.Mesh;
  home: THREE.Vector3;
  phase: number;
  hp: number;
}

interface Boom {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  light: THREE.PointLight;
  life: number;
  max: number;
}

/** Squared distance from point p to segment a-b. */
function distToSeg(p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3) {
  const abx = b.x - a.x,
    aby = b.y - a.y,
    abz = b.z - a.z;
  const apx = p.x - a.x,
    apy = p.y - a.y,
    apz = p.z - a.z;
  const len2 = abx * abx + aby * aby + abz * abz || 1;
  let t = (apx * abx + apy * aby + apz * abz) / len2;
  t = Math.max(0, Math.min(1, t));
  const dx = apx - abx * t,
    dy = apy - aby * t,
    dz = apz - abz * t;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Hostile drones that hover/patrol their spawn point and drift toward
 * the player when in range. Killed by laser bolts; explode with sound.
 */
export class EnemySwarm {
  readonly group = new THREE.Group();

  private drones: Drone[] = [];
  private booms: Boom[] = [];
  private elapsed = 0;

  private readonly geo = new THREE.OctahedronGeometry(1.7, 0);
  private readonly mat = new THREE.MeshStandardMaterial({
    color: 0x223040,
    emissive: 0xff3344,
    emissiveIntensity: 1.1,
    metalness: 0.6,
    roughness: 0.4,
  });
  private readonly boomGeo = new THREE.SphereGeometry(1, 12, 12);
  private readonly seg = { a: new THREE.Vector3(), b: new THREE.Vector3() };
  private readonly toPlayer = new THREE.Vector3();
  private readonly desired = new THREE.Vector3();

  constructor(private readonly sfx: Sfx) {}

  get count(): number {
    return this.drones.length;
  }

  spawn(points: THREE.Vector3[]) {
    points.forEach((p, i) => {
      const mesh = new THREE.Mesh(this.geo, this.mat);
      mesh.position.copy(p);
      this.group.add(mesh);
      this.drones.push({
        mesh,
        home: p.clone(),
        phase: i * 1.7,
        hp: DRONE_HP,
      });
    });
  }

  update(dt: number, playerPos: THREE.Vector3, weapons: WeaponSystem) {
    this.elapsed += dt;
    const damp = 1 - Math.exp(-4 * dt);
    const bolts = [...weapons.bolts];

    for (let i = this.drones.length - 1; i >= 0; i--) {
      const dr = this.drones[i];
      const distToPlayer = dr.home.distanceTo(playerPos);

      if (distToPlayer < DETECT && distToPlayer > MIN_PLAYER_DIST) {
        this.toPlayer.subVectors(playerPos, dr.home).normalize();
        dr.home.addScaledVector(this.toPlayer, CHASE_SPEED * dt);
      }

      const ph = (this.elapsed + dr.phase) * ORBIT_SPEED;
      this.desired.set(
        dr.home.x + Math.cos(ph) * ORBIT_RADIUS,
        dr.home.y + Math.sin(ph * 1.3) * ORBIT_RADIUS * 0.5,
        dr.home.z + Math.sin(ph) * ORBIT_RADIUS,
      );
      dr.mesh.position.lerp(this.desired, damp);

      if (distToPlayer < DETECT) dr.mesh.lookAt(playerPos);
      else dr.mesh.rotation.y += dt * 1.2;

      // Bolt hits: sweep each bolt's travel segment against the drone.
      for (const b of bolts) {
        this.seg.b.copy(b.mesh.position);
        this.seg.a
          .copy(b.mesh.position)
          .addScaledVector(b.dir, -BOLT_SPEED * dt);
        if (
          distToSeg(dr.mesh.position, this.seg.a, this.seg.b) <
          DRONE_RADIUS + 0.4
        ) {
          weapons.kill(b);
          dr.hp -= 1;
          if (dr.hp <= 0) {
            this.explode(dr.mesh.position);
            this.group.remove(dr.mesh);
            this.drones.splice(i, 1);
          }
          break;
        }
      }
    }

    for (let i = this.booms.length - 1; i >= 0; i--) {
      const bm = this.booms[i];
      bm.life -= dt;
      const k = Math.max(0, bm.life / bm.max);
      bm.mesh.scale.setScalar(1 + (1 - k) * 7);
      bm.mat.opacity = k;
      bm.light.intensity = 90 * k;
      if (bm.life <= 0) {
        this.group.remove(bm.mesh);
        this.group.remove(bm.light);
        bm.mat.dispose();
        this.booms.splice(i, 1);
      }
    }
  }

  private explode(p: THREE.Vector3) {
    this.sfx.explosion(1);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffb066,
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(this.boomGeo, mat);
    mesh.position.copy(p);
    const light = new THREE.PointLight(0xff7a3a, 90, 50, 2);
    light.position.copy(p);
    this.group.add(mesh);
    this.group.add(light);
    this.booms.push({ mesh, mat, light, life: 0.4, max: 0.4 });
  }

  dispose() {
    this.geo.dispose();
    this.mat.dispose();
    this.boomGeo.dispose();
    for (const bm of this.booms) bm.mat.dispose();
    this.drones = [];
    this.booms = [];
  }
}
