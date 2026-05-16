import * as THREE from "three";
import { RAPIER } from "../physics/Physics";
import type { Sfx } from "../audio/Sfx";

export type DoorColor = "normal" | "blue" | "red" | "yellow" | "exit";

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
  exit: 0x33dd66,
};

interface Door {
  def: DoorDef;
  mesh: THREE.Mesh;
  collider: RAPIER.Collider;
  baseY: number;
  t: number; // 0 closed .. 1 open
  solid: boolean; // collider currently enabled
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
    private readonly sfx: Sfx,
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

      // Body carries the door position; opening just disables the
      // collider (Collider.setTranslation is ignored when parented).
      const body = this.world.createRigidBody(
        RAPIER.RigidBodyDesc.fixed().setTranslation(
          def.pos[0],
          def.pos[1],
          def.pos[2],
        ),
      );
      const collider = this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(sx / 2, sy / 2, sz / 2),
        body,
      );

      this.doors.push({
        def,
        mesh,
        collider,
        baseY: def.pos[1],
        t: 0,
        solid: true,
      });
    }
  }

  private escape = false;

  /** Self-destruct triggered: the sealed exit door opens. */
  setEscape(on: boolean) {
    this.escape = on;
  }

  update(dt: number, playerPos: THREE.Vector3, keys: KeyRing) {
    for (const d of this.doors) {
      const c = d.def.color;
      const unlocked =
        c === "normal" ||
        (c === "blue" && keys.blue) ||
        (c === "red" && keys.red) ||
        (c === "yellow" && keys.yellow) ||
        (c === "exit" && this.escape);
      const near =
        playerPos.distanceTo(d.mesh.position) < OPEN_DIST + d.def.size[1];
      const target = unlocked && near ? 1 : 0;

      d.t +=
        Math.sign(target - d.t) *
        Math.min(SPEED * dt, Math.abs(target - d.t));

      // Slide up into the ceiling.
      d.mesh.position.y = d.baseY + d.t * d.def.size[1];

      const solid = d.t < 0.55;
      if (solid !== d.solid) {
        d.solid = solid;
        d.collider.setEnabled(solid);
        if (playerPos.distanceTo(d.mesh.position) < 60) {
          this.sfx.door(!solid);
        }
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
