import * as THREE from "three";
import type { Sfx } from "../audio/Sfx";

export type PickupKind =
  | "health"
  | "shield"
  | "rockets"
  | "laser"
  | "keyblue"
  | "keyred"
  | "keyyellow";

const POWERUPS: PickupKind[] = ["shield", "rockets", "health", "laser"];
const COLOR: Record<PickupKind, number> = {
  health: 0x44ff88,
  shield: 0x46d8ff,
  rockets: 0xff9a3a,
  laser: 0xff5ce0,
  keyblue: 0x3a7bff,
  keyred: 0xff3a3a,
  keyyellow: 0xffd23a,
};
const RADIUS = 3.4;

interface Item {
  mesh: THREE.Mesh;
  kind: PickupKind;
  baseY: number;
  phase: number;
}

const isKey = (k: PickupKind) => k.startsWith("key");

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
      isKey(kind) ? this.keyGeo : this.geo,
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
    for (const k of Object.keys(this.mats) as PickupKind[]) {
      this.mats[k].dispose();
    }
    this.items = [];
  }
}
