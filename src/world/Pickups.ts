import * as THREE from "three";
import type { Sfx } from "../audio/Sfx";

export type PickupKind =
  | "health"
  | "shield"
  | "rockets"
  | "laser"
  | "energy"
  | "vammo"
  | "quad"
  | "chrono"
  | "keyblue"
  | "keyred"
  | "keyyellow"
  | "wsuperlaser"
  | "wvulcan"
  | "wplasma"
  | "wfusion"
  | "wrockets"
  | "wspreadfire"
  | "whoming"
  | "wproximity"
  | "wsmart"
  | "wmega";

// Weighted so ammo / energy show up far more often than buffs —
// the energy weapons drain fast without an auto-recharge.
const POWERUPS: PickupKind[] = [
  "energy",
  "rockets",
  "health",
  "energy",
  "vammo",
  "shield",
  "energy",
  "rockets",
  "laser",
];
const COLOR: Record<PickupKind, number> = {
  health: 0x44ff88,
  shield: 0x46d8ff,
  rockets: 0xff9a3a,
  laser: 0xff5ce0,
  energy: 0x66ddff,
  vammo: 0xf4c542,
  quad: 0xff5ce0,
  chrono: 0xb060ff,
  keyblue: 0x3a7bff,
  keyred: 0xff3a3a,
  keyyellow: 0xffd23a,
  wsuperlaser: 0xffe27a,
  wvulcan: 0xffe27a,
  wplasma: 0xffe27a,
  wfusion: 0xffe27a,
  wrockets: 0xffe27a,
  wspreadfire: 0xffe27a,
  whoming: 0xffe27a,
  wproximity: 0xffe27a,
  wsmart: 0xffe27a,
  wmega: 0xffe27a,
};
const RADIUS = 3.4;

interface Item {
  mesh: THREE.Mesh;
  kind: PickupKind;
  baseY: number;
  phase: number;
}

const isKey = (k: PickupKind) => k.startsWith("key");
const isWeapon = (k: PickupKind) => k.startsWith("w");

/**
 * Floating, spinning power-ups and access keys. update() returns the
 * kinds collected this frame so the caller can apply their effects.
 */
export class PickupField {
  readonly group = new THREE.Group();

  private items: Item[] = [];
  private elapsed = 0;
  private idx = 0;

  private readonly geo = new THREE.OctahedronGeometry(1.0, 0);
  private readonly keyGeo = new THREE.TorusGeometry(0.8, 0.28, 8, 16);
  private readonly wpnGeo = new THREE.TorusKnotGeometry(0.62, 0.24, 64, 8);
  private readonly chronoGeo = new THREE.DodecahedronGeometry(1.0, 0);
  private readonly mats = {} as Record<PickupKind, THREE.MeshBasicMaterial>;

  constructor(private readonly sfx: Sfx) {
    (Object.keys(COLOR) as PickupKind[]).forEach((k) => {
      this.mats[k] = new THREE.MeshBasicMaterial({ color: COLOR[k] });
    });
  }

  /** Power-ups, cycled through the standard set. */
  spawn(points: THREE.Vector3[]) {
    for (const p of points) this.add(p, POWERUPS[this.idx++ % POWERUPS.length]);
  }

  /** Add one specific pickup (used for keys). */
  add(p: THREE.Vector3, kind: PickupKind) {
    const mesh = new THREE.Mesh(
      kind === "chrono"
        ? this.chronoGeo
        : isWeapon(kind)
          ? this.wpnGeo
          : isKey(kind)
            ? this.keyGeo
            : this.geo,
      this.mats[kind],
    );
    mesh.position.copy(p);
    this.group.add(mesh);
    this.items.push({ mesh, kind, baseY: p.y, phase: this.items.length * 1.3 });
  }

  update(dt: number, playerPos: THREE.Vector3): PickupKind[] {
    this.elapsed += dt;
    const got: PickupKind[] = [];

    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.mesh.rotation.y += dt * 1.6;
      it.mesh.rotation.x += dt * 0.8;
      it.mesh.position.y =
        it.baseY + Math.sin(this.elapsed * 2 + it.phase) * 0.4;

      if (it.mesh.position.distanceTo(playerPos) < RADIUS) {
        got.push(it.kind);
        this.sfx.pickup();
        this.group.remove(it.mesh);
        this.items.splice(i, 1);
      }
    }
    return got;
  }

  dispose() {
    this.geo.dispose();
    this.keyGeo.dispose();
    this.wpnGeo.dispose();
    this.chronoGeo.dispose();
    for (const k of Object.keys(this.mats) as PickupKind[]) {
      this.mats[k].dispose();
    }
    this.items = [];
  }
}
