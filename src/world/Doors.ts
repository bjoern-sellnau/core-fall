import * as THREE from "three";
import { RAPIER } from "../physics/Physics";

export type DoorColor = "normal" | "blue" | "red" | "yellow";

export interface DoorDef {
  pos: [number, number, number];
  size: [number, number, number];
  color: DoorColor;
}

export interface KeyRing {
  blue: boolean;
  red: boolean;
  yellow: boolean;
}

const OPEN_DIST = 11;
const SPEED = 2.4; // open/close per second
const COLOR: Record<DoorColor, number> = {
  normal: 0x7d8c9a,
  blue: 0x3a7bff,
  red: 0xff3a3a,
  yellow: 0xffd23a,
};

interface Door {
  def: DoorDef;
  mesh: THREE.Mesh;
  collider: RAPIER.Collider;
  baseY: number;
  t: number; // 0 closed .. 1 open
  away: boolean; // collider currently moved out of the way
}

/**
 * Sliding doors. Normal doors auto-open near the player; coloured doors
 * also require the matching key. Closed doors carry a solid collider.
 */
export class Doors {
  readonly group = new THREE.Group();
  private doors: Door[] = [];

  constructor(
    private readonly world: RAPIER.World,
    defs: DoorDef[],
  ) {
    for (const def of defs) {
      const [sx, sy, sz] = def.size;
      const mat = new THREE.MeshStandardMaterial({
        color: COLOR[def.color],
        metalness: 0.6,
        roughness: 0.5,
        emissive: COLOR[def.color],
        emissiveIntensity: def.color === "normal" ? 0.05 : 0.35,
      });
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
      mesh.position.set(def.pos[0], def.pos[1], def.pos[2]);
      this.group.add(mesh);

      const body = this.world.createRigidBody(
        RAPIER.RigidBodyDesc.fixed(),
      );
      const collider = this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(sx / 2, sy / 2, sz / 2),
        body,
      );
      collider.setTranslation({
        x: def.pos[0],
        y: def.pos[1],
        z: def.pos[2],
      });

      this.doors.push({
        def,
        mesh,
        collider,
        baseY: def.pos[1],
        t: 0,
        away: false,
      });
    }
  }

  update(dt: number, playerPos: THREE.Vector3, keys: KeyRing) {
    for (const d of this.doors) {
      const c = d.def.color;
      const unlocked =
        c === "normal" ||
        (c === "blue" && keys.blue) ||
        (c === "red" && keys.red) ||
        (c === "yellow" && keys.yellow);
      const near =
        playerPos.distanceTo(d.mesh.position) < OPEN_DIST + d.def.size[1];
      const target = unlocked && near ? 1 : 0;

      d.t += Math.sign(target - d.t) * Math.min(SPEED * dt, Math.abs(target - d.t));

      // Slide up into the ceiling.
      d.mesh.position.y = d.baseY + d.t * d.def.size[1];

      const shouldBeAway = d.t > 0.55;
      if (shouldBeAway !== d.away) {
        d.away = shouldBeAway;
        d.collider.setTranslation({
          x: d.def.pos[0],
          y: shouldBeAway ? d.def.pos[1] - 10000 : d.def.pos[1],
          z: d.def.pos[2],
        });
      }
    }
  }

  dispose() {
    for (const d of this.doors) {
      d.mesh.geometry.dispose();
      (d.mesh.material as THREE.Material).dispose();
    }
    this.doors = [];
  }
}
