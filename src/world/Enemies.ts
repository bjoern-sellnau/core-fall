import * as THREE from "three";
import type { Sfx } from "../audio/Sfx";
import { RAPIER } from "../physics/Physics";
import { type Bolt, type Rocket, type WeaponSystem } from "./Weapons";

const DRONE_RADIUS = 2.0;
const SHIP_RADIUS = 2.0;
const ORBIT_RADIUS = 2.5;
const ORBIT_SPEED = 0.6;
const LEASH = 6; // how far the patrol point may drift from spawn
const MAXR = 9; // hard cap: drone stays within this of spawn (containment)
const DETECT = 95;
const CHASE_SPEED = 6;
const ATTACK_RANGE = 40;
const LUNGE_SPEED = 26;
const LUNGE_TIME = 0.32;
const SHOOT_RANGE = 95;
const EBOLT_SPEED = 58;
const EBOLT_LIFE = 3.5;
const FACTORY_RADIUS = 3.6;

export interface DiffConfig {
  droneHp: number;
  enemyDmg: number;
  factoryInterval: number;
  maxDrones: number;
  factoryHp: number;
  initialFrac: number;
}

const TABLE: Record<number, DiffConfig> = {
  1: { droneHp: 1, enemyDmg: 7, factoryInterval: 16, maxDrones: 6, factoryHp: 8, initialFrac: 0.5 },
  2: { droneHp: 2, enemyDmg: 10, factoryInterval: 11, maxDrones: 9, factoryHp: 10, initialFrac: 0.7 },
  3: { droneHp: 2, enemyDmg: 13, factoryInterval: 7, maxDrones: 13, factoryHp: 12, initialFrac: 0.85 },
  4: { droneHp: 3, enemyDmg: 17, factoryInterval: 4, maxDrones: 17, factoryHp: 15, initialFrac: 1 },
  5: { droneHp: 4, enemyDmg: 23, factoryInterval: 2.2, maxDrones: 22, factoryHp: 18, initialFrac: 1 },
};

export function difficultyConfig(level: number): DiffConfig {
  return TABLE[Math.max(1, Math.min(5, level))];
}

export type Kind =
  | "dasher"
  | "shooter"
  | "interceptor"
  | "tank"
  | "spinner"
  | "sniper"
  | "bomber"
  // Advanced rigs — appear from mission 7 on.
  | "spreader"
  | "twincannon"
  | "quadcannon"
  | "dualplasma"
  | "arcer"
  | "burster"
  | "railer"
  | "swarmer"
  | "mortar"
  | "warden";

/** Advanced hostile roster mixed in from mission 7 onward. */
export const NEW_ENEMY_KINDS: Kind[] = [
  "spreader",
  "twincannon",
  "quadcannon",
  "dualplasma",
  "arcer",
  "burster",
  "railer",
  "swarmer",
  "mortar",
  "warden",
];

interface ESpec {
  hp: number; // bonus HP over the difficulty base
  shots: number; // ebolts per volley
  spread: number; // radians between shots
  range: number;
  cool: number; // base seconds between volleys
  melee?: boolean;
  vert?: boolean; // fan vertically instead of horizontally
}
const ESPEC: Record<string, ESpec> = {
  spreader: { hp: 1, shots: 3, spread: 0.17, range: 95, cool: 1.6 },
  twincannon: { hp: 2, shots: 5, spread: 0.14, range: 98, cool: 1.9 },
  quadcannon: { hp: 2, shots: 4, spread: 0.07, range: 104, cool: 1.5 },
  dualplasma: { hp: 3, shots: 2, spread: 0.05, range: 96, cool: 1.3 },
  arcer: { hp: 1, shots: 4, spread: 0.19, range: 88, cool: 1.7, vert: true },
  burster: { hp: 1, shots: 3, spread: 0.04, range: 92, cool: 1.0 },
  railer: { hp: 2, shots: 1, spread: 0, range: 175, cool: 2.5 },
  swarmer: { hp: 0, shots: 0, spread: 0, range: 0, cool: 0, melee: true },
  mortar: { hp: 2, shots: 2, spread: 0.24, range: 115, cool: 1.9 },
  warden: { hp: 5, shots: 4, spread: 0.1, range: 96, cool: 1.5 },
};
const ECOLOR: Record<string, { body: number; emissive: number }> = {
  spreader: { body: 0x402a1c, emissive: 0xffae3a },
  twincannon: { body: 0x3a2410, emissive: 0xff8a1a },
  quadcannon: { body: 0x103a3a, emissive: 0x33ffe0 },
  dualplasma: { body: 0x163a1c, emissive: 0x5cff7a },
  arcer: { body: 0x2a2440, emissive: 0x8a5cff },
  burster: { body: 0x3a1430, emissive: 0xff5ce0 },
  railer: { body: 0x102a40, emissive: 0x4ad0ff },
  swarmer: { body: 0x401818, emissive: 0xff4040 },
  mortar: { body: 0x3a3414, emissive: 0xe8d24a },
  warden: { body: 0x40202a, emissive: 0xff5a7a },
};

interface Drone {
  mesh: THREE.Mesh;
  origin: THREE.Vector3;
  home: THREE.Vector3;
  phase: number;
  hp: number;
  kind: Kind;
  cool: number;
  lungeT: number;
  lungeDir: THREE.Vector3;
  dead: boolean;
}

interface Factory {
  mesh: THREE.Mesh;
  pos: THREE.Vector3;
  hp: number;
  cool: number;
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

/** Clamp `v` to within `r` of `c` (keeps drones inside their room). */
function clampTo(v: THREE.Vector3, c: THREE.Vector3, r: number) {
  const dx = v.x - c.x,
    dy = v.y - c.y,
    dz = v.z - c.z;
  const d = Math.hypot(dx, dy, dz);
  if (d > r) {
    const s = r / d;
    v.set(c.x + dx * s, c.y + dy * s, c.z + dz * s);
  }
}

/**
 * Hostiles: "dasher" lunges, "shooter" fires at range. Factories keep
 * producing drones until destroyed. Drones are leashed to their spawn
 * so they can't drift out of the level.
 */
export class EnemySwarm {
  readonly group = new THREE.Group();

  private drones: Drone[] = [];
  private factories: Factory[] = [];
  private ebolts: EBolt[] = [];
  private booms: Boom[] = [];
  private elapsed = 0;

  private reactorPos = new THREE.Vector3();
  private reactorHp = 0;
  private reactorMaxHp = 1;
  private reactorAliveFlag = false;
  private reactorCool = 2;
  private reactorKilled = false;
  private threatLevel = 0;
  private pendingDamage = 0;
  private spawnCount = 0;

  private readonly geoD = new THREE.OctahedronGeometry(1.7, 0);
  private readonly geoS = new THREE.IcosahedronGeometry(1.8, 0);
  private readonly geoI = new THREE.TetrahedronGeometry(1.7);
  private readonly geoT = new THREE.BoxGeometry(3.2, 3.2, 3.2);
  private readonly geoF = new THREE.BoxGeometry(5, 5, 5);
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
  private readonly matI = new THREE.MeshStandardMaterial({
    color: 0x203840,
    emissive: 0x33ffd0,
    emissiveIntensity: 1.2,
    metalness: 0.6,
    roughness: 0.35,
  });
  private readonly matT = new THREE.MeshStandardMaterial({
    color: 0x402020,
    emissive: 0xff7a22,
    emissiveIntensity: 1.0,
    metalness: 0.6,
    roughness: 0.5,
  });
  private readonly matF = new THREE.MeshStandardMaterial({
    color: 0x3a1c1c,
    emissive: 0xff5522,
    emissiveIntensity: 0.9,
    metalness: 0.5,
    roughness: 0.6,
  });
  private readonly geoSp = new THREE.TorusGeometry(1.5, 0.5, 6, 12);
  private readonly geoSn = new THREE.ConeGeometry(1.4, 3, 8);
  private readonly geoB = new THREE.BoxGeometry(4, 4, 4);
  private readonly matSp = new THREE.MeshStandardMaterial({
    color: 0x402a40,
    emissive: 0xff5ad0,
    emissiveIntensity: 1.2,
    metalness: 0.6,
    roughness: 0.4,
  });
  private readonly matSn = new THREE.MeshStandardMaterial({
    color: 0x2a3a2a,
    emissive: 0x9bff4a,
    emissiveIntensity: 1.1,
    metalness: 0.6,
    roughness: 0.4,
  });
  private readonly matB = new THREE.MeshStandardMaterial({
    color: 0x3a2a18,
    emissive: 0xffb020,
    emissiveIntensity: 1.0,
    metalness: 0.6,
    roughness: 0.5,
  });
  private readonly eboltGeo = new THREE.SphereGeometry(0.5, 8, 8);
  private readonly eboltMat = new THREE.MeshBasicMaterial({ color: 0xff66cc });
  private readonly boomGeo = new THREE.SphereGeometry(1, 12, 12);
  private readonly segA = new THREE.Vector3();
  private readonly segB = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();
  private readonly losDir = new THREE.Vector3();
  private readonly desired = new THREE.Vector3();
  private readonly UP = new THREE.Vector3(0, 1, 0);

  private playerPos = new THREE.Vector3();
  private readonly extraMats: Record<string, THREE.MeshStandardMaterial> = {};

  constructor(
    private readonly world: RAPIER.World,
    private readonly sfx: Sfx,
    private readonly cfg: DiffConfig,
    private readonly tier = 1,
    private readonly roster: Kind[] = ["dasher", "shooter"],
  ) {
    for (const k of Object.keys(ECOLOR)) {
      this.extraMats[k] = new THREE.MeshStandardMaterial({
        color: ECOLOR[k].body,
        emissive: ECOLOR[k].emissive,
        emissiveIntensity: 1.15,
        metalness: 0.6,
        roughness: 0.4,
      });
    }
  }

  private kindFor(i: number): Kind {
    return this.roster[i % this.roster.length];
  }

  get count(): number {
    return this.drones.length;
  }
  get factoryCount(): number {
    return this.factories.length;
  }
  /** Live targetable points (drones, factories, reactor) for homing. */
  enemyPoints(): THREE.Vector3[] {
    const pts: THREE.Vector3[] = [];
    for (const d of this.drones) if (!d.dead) pts.push(d.mesh.position);
    for (const f of this.factories) if (!f.dead) pts.push(f.pos);
    if (this.reactorAliveFlag) pts.push(this.reactorPos);
    return pts;
  }
  get threat(): number {
    return this.threatLevel;
  }
  consumeDamage(): number {
    const d = this.pendingDamage;
    this.pendingDamage = 0;
    return d;
  }

  get reactorAlive(): boolean {
    return this.reactorAliveFlag;
  }
  get reactorHp01(): number {
    return Math.max(0, this.reactorHp / this.reactorMaxHp);
  }
  /** True only on the frame the reactor is destroyed. */
  consumeReactorKilled(): boolean {
    const k = this.reactorKilled;
    this.reactorKilled = false;
    return k;
  }

  spawn(
    points: THREE.Vector3[],
    factories: THREE.Vector3[],
    reactorPos: THREE.Vector3,
  ) {
    const n = Math.max(1, Math.round(points.length * this.cfg.initialFrac));
    for (let i = 0; i < n; i++) this.makeDrone(points[i]);
    for (const f of factories) {
      const mesh = new THREE.Mesh(this.geoF, this.matF);
      mesh.position.copy(f);
      this.group.add(mesh);
      this.factories.push({
        mesh,
        pos: f.clone(),
        hp: this.cfg.factoryHp,
        cool: this.cfg.factoryInterval,
        dead: false,
      });
    }
    this.reactorPos.copy(reactorPos);
    this.reactorMaxHp = this.cfg.factoryHp * 9;
    this.reactorHp = this.reactorMaxHp;
    this.reactorAliveFlag = true;
  }

  private makeDrone(p: THREE.Vector3) {
    const kind = this.kindFor(this.spawnCount);
    this.spawnCount++;
    const baseGeo: Record<string, THREE.BufferGeometry> = {
      dasher: this.geoD,
      shooter: this.geoS,
      interceptor: this.geoI,
      tank: this.geoT,
      spinner: this.geoSp,
      sniper: this.geoSn,
      bomber: this.geoB,
      spreader: this.geoS,
      twincannon: this.geoS,
      quadcannon: this.geoT,
      dualplasma: this.geoT,
      arcer: this.geoSn,
      burster: this.geoSn,
      railer: this.geoSn,
      swarmer: this.geoI,
      mortar: this.geoB,
      warden: this.geoT,
    };
    const baseMat: Record<string, THREE.Material> = {
      dasher: this.matD,
      shooter: this.matS,
      interceptor: this.matI,
      tank: this.matT,
      spinner: this.matSp,
      sniper: this.matSn,
      bomber: this.matB,
    };
    const mesh = new THREE.Mesh(
      baseGeo[kind],
      baseMat[kind] ?? this.extraMats[kind],
    );
    mesh.position.copy(p);
    this.group.add(mesh);
    const spec = ESPEC[kind];
    const hp = spec
      ? spec.melee
        ? 1
        : this.cfg.droneHp + spec.hp + this.tier
      : kind === "tank"
        ? this.cfg.droneHp * 3 + this.tier
        : kind === "bomber"
          ? this.cfg.droneHp * 4 + this.tier
          : kind === "interceptor" || kind === "spinner"
            ? 1
            : this.cfg.droneHp;
    this.drones.push({
      mesh,
      origin: p.clone(),
      home: p.clone(),
      phase: this.spawnCount * 1.7,
      hp,
      kind,
      cool: 1.5 + Math.random() * 2.5,
      lungeT: 0,
      lungeDir: new THREE.Vector3(),
      dead: false,
    });
  }

  update(dt: number, playerPos: THREE.Vector3, weapons: WeaponSystem) {
    this.elapsed += dt;
    this.playerPos.copy(playerPos);
    const damp = 1 - Math.exp(-4 * dt);
    const bolts = [...weapons.bolts];
    const rockets = [...weapons.activeRockets];
    let threat = 0;

    // The reactor: fires at the player, takes weapon damage.
    if (this.reactorAliveFlag) {
      this.reactorCool -= dt;
      const rdist = this.reactorPos.distanceTo(playerPos);
      if (
        this.reactorCool <= 0 &&
        rdist < 130 &&
        !this.blocked(this.reactorPos, playerPos)
      ) {
        this.spawnEBolt(this.reactorPos, playerPos);
        this.spawnEBolt(this.reactorPos, playerPos);
        this.reactorCool = 0.9 + Math.random() * 0.7;
        threat += 0.8;
      }
      for (const b of bolts) {
        this.segB.copy(b.mesh.position);
        this.segA
          .copy(b.mesh.position)
          .addScaledVector(b.dir, -b.speed * dt);
        if (distToSeg(this.reactorPos, this.segA, this.segB) < 7.5) {
          weapons.kill(b);
          this.reactorHp -= b.damage;
        }
      }
      for (const r of rockets) {
        if (this.reactorPos.distanceTo(r.mesh.position) < 9) {
          weapons.detonateRocket(r);
          this.reactorHp -= r.dmgReactor;
        }
      }
      if (this.reactorHp <= 0) {
        this.reactorAliveFlag = false;
        this.reactorKilled = true;
        for (let i = 0; i < 6; i++) {
          this.tmp.set(
            (Math.random() - 0.5) * 16,
            (Math.random() - 0.5) * 16,
            (Math.random() - 0.5) * 16,
          );
          this.explode(this.reactorPos.clone().add(this.tmp), 2.6);
        }
      }
    }

    // Factories spew drones until destroyed.
    for (const f of this.factories) {
      if (f.dead) continue;
      f.cool -= dt;
      if (f.cool <= 0) {
        f.cool = this.cfg.factoryInterval;
        if (this.drones.length < this.cfg.maxDrones) {
          this.tmp.set(
            (Math.random() - 0.5) * 4,
            (Math.random() - 0.5) * 4,
            (Math.random() - 0.5) * 4,
          );
          this.makeDrone(f.pos.clone().add(this.tmp));
        }
      }
      this.resolveFactoryHits(f, dt, bolts, rockets, weapons);
    }

    for (const dr of this.drones) {
      if (dr.dead) continue;
      const dist = dr.mesh.position.distanceTo(playerPos);
      if (dist < DETECT) {
        threat += 0.22 + (1 - dist / DETECT) * 0.85;
        if (dr.lungeT > 0) threat += 0.5;
      }

      dr.cool -= dt;
      const spec = ESPEC[dr.kind];
      const melee =
        dr.kind === "dasher" ||
        dr.kind === "interceptor" ||
        dr.kind === "spinner" ||
        spec?.melee === true;
      if (melee) {
        this.updateDasher(dr, dt, dist, playerPos, damp);
      } else {
        this.updateShooter(dr, dt, dist, damp);
        const range = spec
          ? spec.range
          : dr.kind === "sniper"
            ? SHOOT_RANGE * 1.5
            : SHOOT_RANGE;
        if (
          dr.cool <= 0 &&
          dist < range &&
          !this.blocked(dr.mesh.position, playerPos)
        ) {
          if (spec) {
            this.volley(dr, playerPos, spec.shots, spec.spread, spec.vert);
            dr.cool = spec.cool + Math.random() * 1.2;
          } else {
            this.fireEnemyBolt(dr, playerPos);
            if (dr.kind === "tank" || dr.kind === "bomber")
              this.fireEnemyBolt(dr, playerPos);
            dr.cool =
              (dr.kind === "tank" || dr.kind === "bomber"
                ? 1.0
                : dr.kind === "sniper"
                  ? 2.2
                  : 1.4) +
              Math.random() * 1.6;
          }
          threat += 0.4;
        }
      }

      // Containment: never let a drone leave its room.
      clampTo(dr.home, dr.origin, LEASH);
      clampTo(dr.mesh.position, dr.origin, MAXR);

      if (dist < DETECT) dr.mesh.lookAt(playerPos);
      else dr.mesh.rotation.y += dt * 1.2;

      this.resolveHits(dr, dt, bolts, rockets, weapons);
    }

    for (let i = this.drones.length - 1; i >= 0; i--) {
      if (this.drones[i].dead) {
        this.group.remove(this.drones[i].mesh);
        this.drones.splice(i, 1);
      }
    }
    for (let i = this.factories.length - 1; i >= 0; i--) {
      if (this.factories[i].dead) {
        this.group.remove(this.factories[i].mesh);
        this.factories.splice(i, 1);
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
    const fast = dr.kind === "interceptor" || dr.kind === "spinner";
    if (dr.lungeT > 0) {
      dr.lungeT -= dt;
      dr.mesh.position.addScaledVector(
        dr.lungeDir,
        LUNGE_SPEED * (fast ? 1.8 : 1) * dt,
      );
      return;
    }
    if (dr.cool <= 0 && dist < ATTACK_RANGE && dist > DRONE_RADIUS + 3) {
      dr.lungeT = LUNGE_TIME;
      dr.lungeDir.subVectors(playerPos, dr.mesh.position).normalize();
      dr.cool = (fast ? 0.6 : 1.6) + Math.random() * (fast ? 1.0 : 2.6);
    }
    if (dist < DETECT) {
      this.tmp.subVectors(playerPos, dr.home).normalize();
      dr.home.addScaledVector(this.tmp, CHASE_SPEED * (fast ? 1.8 : 1) * dt);
    }
    this.hover(dr, damp);
  }

  private updateShooter(dr: Drone, dt: number, dist: number, damp: number) {
    if (dist < 45) {
      this.tmp.subVectors(dr.home, dr.origin).normalize();
      dr.home.addScaledVector(this.tmp, CHASE_SPEED * 0.5 * dt);
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

  /** True if level geometry sits between `from` and `to`. */
  private blocked(from: THREE.Vector3, to: THREE.Vector3): boolean {
    this.losDir.subVectors(to, from);
    const dist = this.losDir.length();
    if (dist < 1) return false;
    this.losDir.multiplyScalar(1 / dist);
    const hit = this.world.castRay(
      new RAPIER.Ray(from, this.losDir),
      dist,
      true,
    );
    return !!hit && hit.timeOfImpact < dist - 3;
  }

  private fireEnemyBolt(dr: Drone, playerPos: THREE.Vector3) {
    this.spawnEBolt(dr.mesh.position, playerPos);
  }

  private spawnEBolt(from: THREE.Vector3, playerPos: THREE.Vector3) {
    this.losDir.subVectors(playerPos, from).normalize();
    this.spawnEBoltDir(from, this.losDir);
  }

  private spawnEBoltDir(from: THREE.Vector3, dir: THREE.Vector3) {
    const mesh = new THREE.Mesh(this.eboltGeo, this.eboltMat);
    mesh.position.copy(from);
    const vel = dir.clone().normalize().multiplyScalar(EBOLT_SPEED);
    this.group.add(mesh);
    this.ebolts.push({ mesh, vel, life: EBOLT_LIFE });
    this.sfx.enemyShot();
  }

  /** Fan `n` bolts at the player, `spread` rad apart, h- or v-axis. */
  private volley(
    dr: Drone,
    playerPos: THREE.Vector3,
    n: number,
    spread: number,
    vert?: boolean,
  ) {
    const base = new THREE.Vector3()
      .subVectors(playerPos, dr.mesh.position)
      .normalize();
    const axis = vert
      ? new THREE.Vector3().crossVectors(base, this.UP).normalize()
      : this.UP;
    const start = -((n - 1) / 2);
    for (let i = 0; i < n; i++) {
      const a = (start + i) * spread;
      const d = base.clone().applyAxisAngle(axis, a);
      this.spawnEBoltDir(dr.mesh.position, d);
    }
  }

  private updateEBolts(dt: number, playerPos: THREE.Vector3) {
    for (let i = this.ebolts.length - 1; i >= 0; i--) {
      const e = this.ebolts[i];
      e.life -= dt;

      // Stop at walls instead of passing through them.
      const speed = e.vel.length();
      this.losDir.copy(e.vel).multiplyScalar(1 / (speed || 1));
      const wall = this.world.castRay(
        new RAPIER.Ray(e.mesh.position, this.losDir),
        speed * dt,
        true,
      );
      if (wall) {
        this.group.remove(e.mesh);
        this.ebolts.splice(i, 1);
        continue;
      }

      e.mesh.position.addScaledVector(e.vel, dt);
      if (e.mesh.position.distanceTo(playerPos) < SHIP_RADIUS + 0.6) {
        this.pendingDamage += this.cfg.enemyDmg;
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
      this.segA.copy(b.mesh.position).addScaledVector(b.dir, -b.speed * dt);
      if (
        distToSeg(dr.mesh.position, this.segA, this.segB) <
        DRONE_RADIUS + 0.4
      ) {
        weapons.kill(b);
        dr.hp -= b.damage;
        if (dr.hp <= 0) {
          dr.dead = true;
          if (dr.kind === "bomber") {
            this.explode(dr.mesh.position, 2.4);
            if (dr.mesh.position.distanceTo(this.playerPos) < 16) {
              this.pendingDamage += 28;
            }
          } else {
            this.explode(dr.mesh.position, 1);
          }
        }
        return;
      }
    }
    for (const r of rockets) {
      if (dr.mesh.position.distanceTo(r.mesh.position) < r.trigger) {
        const center = r.mesh.position.clone();
        const splash = r.splash;
        weapons.detonateRocket(r);
        for (const o of this.drones) {
          if (!o.dead && o.mesh.position.distanceTo(center) < splash) {
            o.dead = true;
            this.explode(o.mesh.position, 1.4);
          }
        }
        for (const f of this.factories) {
          if (!f.dead && f.pos.distanceTo(center) < splash) {
            f.hp -= r.dmgFactory;
            if (f.hp <= 0) {
              f.dead = true;
              this.explode(f.pos, 2);
            }
          }
        }
        return;
      }
    }
  }

  private resolveFactoryHits(
    f: Factory,
    dt: number,
    bolts: readonly Bolt[],
    rockets: readonly Rocket[],
    weapons: WeaponSystem,
  ) {
    for (const b of bolts) {
      this.segB.copy(b.mesh.position);
      this.segA.copy(b.mesh.position).addScaledVector(b.dir, -b.speed * dt);
      if (distToSeg(f.pos, this.segA, this.segB) < FACTORY_RADIUS) {
        weapons.kill(b);
        f.hp -= b.damage;
        if (f.hp <= 0) {
          f.dead = true;
          this.explode(f.pos, 2.2);
        }
        return;
      }
    }
    for (const r of rockets) {
      if (f.pos.distanceTo(r.mesh.position) < FACTORY_RADIUS + 1.5) {
        weapons.detonateRocket(r);
        f.hp -= r.dmgFactory;
        if (f.hp <= 0) {
          f.dead = true;
          this.explode(f.pos, 2.2);
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
    mesh.scale.setScalar(scale);
    const light = new THREE.PointLight(0xff7a3a, 90, 50, 2);
    light.position.copy(p);
    this.group.add(mesh);
    this.group.add(light);
    this.booms.push({ mesh, mat, light, life: 0.4, max: 0.4 });
  }

  dispose() {
    this.geoD.dispose();
    this.geoS.dispose();
    this.geoI.dispose();
    this.geoT.dispose();
    this.geoSp.dispose();
    this.geoSn.dispose();
    this.geoB.dispose();
    this.geoF.dispose();
    this.matD.dispose();
    this.matS.dispose();
    this.matI.dispose();
    this.matT.dispose();
    this.matSp.dispose();
    this.matSn.dispose();
    this.matB.dispose();
    this.matF.dispose();
    for (const k of Object.keys(this.extraMats)) this.extraMats[k].dispose();
    this.eboltGeo.dispose();
    this.eboltMat.dispose();
    this.boomGeo.dispose();
    for (const bm of this.booms) bm.mat.dispose();
    this.drones = [];
    this.factories = [];
    this.ebolts = [];
    this.booms = [];
  }
}
