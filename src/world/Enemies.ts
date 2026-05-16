import * as THREE from "three";
import type { Sfx } from "../audio/Sfx";
import {
  BOLT_SPEED,
  type Bolt,
  type Rocket,
  type WeaponSystem,
} from "./Weapons";

const DRONE_RADIUS = 2.0;
const SHIP_RADIUS = 2.0;
const DRONE_HP = 2;
const ORBIT_RADIUS = 4;
const ORBIT_SPEED = 0.6;
const DETECT = 95;
const MIN_PLAYER_DIST = 20;
const CHASE_SPEED = 7;
const ATTACK_RANGE = 40;
const LUNGE_SPEED = 34;
const LUNGE_TIME = 0.35;
const SHOOT_RANGE = 95;
const EBOLT_SPEED = 58;
const EBOLT_LIFE = 3.5;
const ENEMY_DMG = 12;
const ROCKET_TRIGGER = 3.5;
const SPLASH_RADIUS = 13;

type Kind = "dasher" | "shooter";

interface Drone {
  mesh: THREE.Mesh;
  home: THREE.Vector3;
  phase: number;
  hp: number;
  kind: Kind;
  cool: number;
  lungeT: number;
  lungeDir: THREE.Vector3;
  dead: boolean;
}

interface EBolt {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
}

interface Boom {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  light: THREE.PointLight;
  life: number;
  max: number;
}

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
 * Hostile drones in two flavours: "dasher" lunges in melee, "shooter"
 * stays at range and fires plasma bolts. Killed by lasers/rockets;
 * `threat` (0..1) drives the dynamic music, `consumeDamage()` reports
 * hits dealt to the player.
 */
export class EnemySwarm {
  readonly group = new THREE.Group();

  private drones: Drone[] = [];
  private ebolts: EBolt[] = [];
  private booms: Boom[] = [];
  private elapsed = 0;
  private threatLevel = 0;
  private pendingDamage = 0;

  private readonly geoD = new THREE.OctahedronGeometry(1.7, 0);
  private readonly geoS = new THREE.IcosahedronGeometry(1.8, 0);
  private readonly matD = new THREE.MeshStandardMaterial({
    color: 0x223040,
    emissive: 0xff3344,
    emissiveIntensity: 1.1,
    metalness: 0.6,
    roughness: 0.4,
  });
  private readonly matS = new THREE.MeshStandardMaterial({
    color: 0x2a2440,
    emissive: 0xaa55ff,
    emissiveIntensity: 1.1,
    metalness: 0.6,
    roughness: 0.4,
  });
  private readonly eboltGeo = new THREE.SphereGeometry(0.5, 8, 8);
  private readonly eboltMat = new THREE.MeshBasicMaterial({ color: 0xff66cc });
  private readonly boomGeo = new THREE.SphereGeometry(1, 12, 12);
  private readonly segA = new THREE.Vector3();
  private readonly segB = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();
  private readonly desired = new THREE.Vector3();

  constructor(private readonly sfx: Sfx) {}

  get count(): number {
    return this.drones.length;
  }
  get threat(): number {
    return this.threatLevel;
  }
  consumeDamage(): number {
    const d = this.pendingDamage;
    this.pendingDamage = 0;
    return d;
  }

  spawn(points: THREE.Vector3[]) {
    points.forEach((p, i) => {
      const kind: Kind = i % 2 === 1 ? "shooter" : "dasher";
      const mesh = new THREE.Mesh(
        kind === "shooter" ? this.geoS : this.geoD,
        kind === "shooter" ? this.matS : this.matD,
      );
      mesh.position.copy(p);
      this.group.add(mesh);
      this.drones.push({
        mesh,
        home: p.clone(),
        phase: i * 1.7,
        hp: DRONE_HP,
        kind,
        cool: 1.5 + Math.random() * 2.5,
        lungeT: 0,
        lungeDir: new THREE.Vector3(),
        dead: false,
      });
    });
  }

  update(dt: number, playerPos: THREE.Vector3, weapons: WeaponSystem) {
    this.elapsed += dt;
    const damp = 1 - Math.exp(-4 * dt);
    const bolts = [...weapons.bolts];
    const rockets = [...weapons.activeRockets];
    let threat = 0;

    for (const dr of this.drones) {
      if (dr.dead) continue;
      const dist = dr.mesh.position.distanceTo(playerPos);
      if (dist < DETECT) {
        threat += 0.22 + (1 - dist / DETECT) * 0.85;
        if (dr.lungeT > 0) threat += 0.5;
      }

      dr.cool -= dt;
      if (dr.kind === "dasher") {
        this.updateDasher(dr, dt, dist, playerPos, damp);
      } else {
        this.updateShooter(dr, dt, dist, playerPos, damp);
        if (dr.cool <= 0 && dist < SHOOT_RANGE) {
          this.fireEnemyBolt(dr, playerPos);
          dr.cool = 1.4 + Math.random() * 1.8;
          threat += 0.4;
        }
      }

      if (dist < DETECT) dr.mesh.lookAt(playerPos);
      else dr.mesh.rotation.y += dt * 1.2;

      this.resolveHits(dr, dt, bolts, rockets, weapons);
    }

    // Single cleanup pass so we never splice mid-iteration.
    for (let i = this.drones.length - 1; i >= 0; i--) {
      if (this.drones[i].dead) {
        this.group.remove(this.drones[i].mesh);
        this.drones.splice(i, 1);
      }
    }

    this.threatLevel = Math.min(1, threat);
    this.updateEBolts(dt, playerPos);
    this.updateBooms(dt);
  }

  private updateDasher(
    dr: Drone,
    dt: number,
    dist: number,
    playerPos: THREE.Vector3,
    damp: number,
  ) {
    if (dr.lungeT > 0) {
      dr.lungeT -= dt;
      dr.mesh.position.addScaledVector(dr.lungeDir, LUNGE_SPEED * dt);
      return;
    }
    if (dr.cool <= 0 && dist < ATTACK_RANGE && dist > DRONE_RADIUS + 3) {
      dr.lungeT = LUNGE_TIME;
      dr.lungeDir.subVectors(playerPos, dr.mesh.position).normalize();
      dr.cool = 1.6 + Math.random() * 2.6;
    }
    if (dist < DETECT && dist > MIN_PLAYER_DIST) {
      this.tmp.subVectors(playerPos, dr.home).normalize();
      dr.home.addScaledVector(this.tmp, CHASE_SPEED * dt);
    }
    this.hover(dr, damp);
  }

  private updateShooter(
    dr: Drone,
    dt: number,
    dist: number,
    playerPos: THREE.Vector3,
    damp: number,
  ) {
    // Keep a stand-off distance, sidling rather than charging.
    if (dist < SHOOT_RANGE && dist < 55) {
      this.tmp.subVectors(dr.home, playerPos).normalize();
      dr.home.addScaledVector(this.tmp, CHASE_SPEED * 0.6 * dt);
    }
    this.hover(dr, damp);
  }

  private hover(dr: Drone, damp: number) {
    const ph = (this.elapsed + dr.phase) * ORBIT_SPEED;
    this.desired.set(
      dr.home.x + Math.cos(ph) * ORBIT_RADIUS,
      dr.home.y + Math.sin(ph * 1.3) * ORBIT_RADIUS * 0.5,
      dr.home.z + Math.sin(ph) * ORBIT_RADIUS,
    );
    dr.mesh.position.lerp(this.desired, damp);
  }

  private fireEnemyBolt(dr: Drone, playerPos: THREE.Vector3) {
    const mesh = new THREE.Mesh(this.eboltGeo, this.eboltMat);
    mesh.position.copy(dr.mesh.position);
    const vel = new THREE.Vector3()
      .subVectors(playerPos, dr.mesh.position)
      .normalize()
      .multiplyScalar(EBOLT_SPEED);
    this.group.add(mesh);
    this.ebolts.push({ mesh, vel, life: EBOLT_LIFE });
    this.sfx.enemyShot();
  }

  private updateEBolts(dt: number, playerPos: THREE.Vector3) {
    for (let i = this.ebolts.length - 1; i >= 0; i--) {
      const e = this.ebolts[i];
      e.life -= dt;
      e.mesh.position.addScaledVector(e.vel, dt);
      if (e.mesh.position.distanceTo(playerPos) < SHIP_RADIUS + 0.6) {
        this.pendingDamage += ENEMY_DMG;
        this.group.remove(e.mesh);
        this.ebolts.splice(i, 1);
      } else if (e.life <= 0) {
        this.group.remove(e.mesh);
        this.ebolts.splice(i, 1);
      }
    }
  }

  private resolveHits(
    dr: Drone,
    dt: number,
    bolts: readonly Bolt[],
    rockets: readonly Rocket[],
    weapons: WeaponSystem,
  ) {
    for (const b of bolts) {
      this.segB.copy(b.mesh.position);
      this.segA.copy(b.mesh.position).addScaledVector(b.dir, -BOLT_SPEED * dt);
      if (
        distToSeg(dr.mesh.position, this.segA, this.segB) <
        DRONE_RADIUS + 0.4
      ) {
        weapons.kill(b);
        dr.hp -= 1;
        if (dr.hp <= 0) {
          dr.dead = true;
          this.explode(dr.mesh.position, 1);
        }
        return;
      }
    }
    for (const r of rockets) {
      if (dr.mesh.position.distanceTo(r.mesh.position) < ROCKET_TRIGGER) {
        const center = r.mesh.position.clone();
        weapons.detonateRocket(r);
        for (const o of this.drones) {
          if (
            !o.dead &&
            o.mesh.position.distanceTo(center) < SPLASH_RADIUS
          ) {
            o.dead = true;
            this.explode(o.mesh.position, 1.4);
          }
        }
        return;
      }
    }
  }

  private updateBooms(dt: number) {
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

  private explode(p: THREE.Vector3, scale: number) {
    this.sfx.explosion(scale);
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
    this.geoD.dispose();
    this.geoS.dispose();
    this.matD.dispose();
    this.matS.dispose();
    this.eboltGeo.dispose();
    this.eboltMat.dispose();
    this.boomGeo.dispose();
    for (const bm of this.booms) bm.mat.dispose();
    this.drones = [];
    this.ebolts = [];
    this.booms = [];
  }
}
