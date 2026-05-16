import * as THREE from "three";
import type { Sfx } from "../audio/Sfx";

export type PickupKind = "health" | "shield" | "rockets" | "laser";

const ORDER: PickupKind[] = ["shield", "rockets", "health", "laser"];
const COLOR: Record<PickupKind, number> = {
  health: 0x44ff88,
  shield: 0x46d8ff,
  rockets: 0xff9a3a,
  laser: 0xff5ce0,
};
const RADIUS = 3.2;

interface Item {
  mesh: THREE.Mesh;
  kind: PickupKind;
  baseY: number;
  phase: number;
}

/**
 * Floating, spinning power-ups. update() returns the kinds collected
 * this frame so the caller can apply their effects.
 */
export class PickupField {
  readonly group = new THREE.Group();

  private items: Item[] = [];
  private elapsed = 0;

  private readonly geo = new THREE.OctahedronGeometry(1.0, 0);
  private readonly mats: Record<PickupKind, THREE.MeshBasicMaterial>;

  constructor(private readonly sfx: Sfx) {
    this.mats = {
      health: new THREE.MeshBasicMaterial({ color: COLOR.health }),
      shield: new THREE.MeshBasicMaterial({ color: COLOR.shield }),
      rockets: new THREE.MeshBasicMaterial({ color: COLOR.rockets }),
      laser: new THREE.MeshBasicMaterial({ color: COLOR.laser }),
    };
  }

  spawn(points: THREE.Vector3[]) {
    points.forEach((p, i) => {
      const kind = ORDER[i % ORDER.length];
      const mesh = new THREE.Mesh(this.geo, this.mats[kind]);
      mesh.position.copy(p);
      this.group.add(mesh);
      this.items.push({ mesh, kind, baseY: p.y, phase: i * 1.3 });
    });
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
    for (const k of ORDER) this.mats[k].dispose();
    this.items = [];
  }
}
