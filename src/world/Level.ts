import * as THREE from "three";
import { RAPIER } from "../physics/Physics";
import type { DoorDef } from "./Doors";

interface Box {
  min: [number, number, number];
  max: [number, number, number];
  light: number; // point-light intensity at centre (0 = none)
  warm?: boolean;
}

function box(
  cx: number,
  cy: number,
  cz: number,
  sx: number,
  sy: number,
  sz: number,
  light: number,
  warm = false,
): Box {
  return {
    min: [cx - sx / 2, cy - sy / 2, cz - sz / 2],
    max: [cx + sx / 2, cy + sy / 2, cz + sz / 2],
    light,
    warm,
  };
}

type Rect = { x0: number; x1: number; y0: number; y1: number };

/** Rect minus an axis-aligned hole → up to 4 sub-rects. */
function carve(r: Rect, h: Rect): Rect[] {
  const hx0 = Math.max(r.x0, h.x0);
  const hx1 = Math.min(r.x1, h.x1);
  const hy0 = Math.max(r.y0, h.y0);
  const hy1 = Math.min(r.y1, h.y1);
  if (hx0 >= hx1 || hy0 >= hy1) return [r]; // no overlap
  const out: Rect[] = [];
  if (hy0 > r.y0) out.push({ x0: r.x0, x1: r.x1, y0: r.y0, y1: hy0 });
  if (hy1 < r.y1) out.push({ x0: r.x0, x1: r.x1, y0: hy1, y1: r.y1 });
  if (hx0 > r.x0) out.push({ x0: r.x0, x1: hx0, y0: hy0, y1: hy1 });
  if (hx1 < r.x1) out.push({ x0: hx1, x1: r.x1, y0: hy0, y1: hy1 });
  return out;
}

/**
 * Descent-style mine: a graph of axis-aligned rooms and corridors.
 * Where two boxes overlap, the shared wall is automatically opened into
 * a doorway, so the interior is one connected, fly-through space.
 */
export class Level {
  readonly group = new THREE.Group();
  readonly spawnPosition: THREE.Vector3;
  readonly spawnQuaternion: THREE.Quaternion;
  readonly corePosition: THREE.Vector3;
  readonly enemySpawns: THREE.Vector3[] = [];
  readonly factorySpawns: THREE.Vector3[] = [];
  readonly pickupSpawns: THREE.Vector3[] = [];
  readonly keySpawns: { pos: THREE.Vector3; kind: string }[] = [];
  readonly doorDefs: DoorDef[] = [
    { pos: [0, 0, -26], size: [11, 10, 1.6], color: "normal" },
    { pos: [0, 0, -80], size: [11, 11, 1.6], color: "blue" },
    { pos: [0, -6, -210], size: [11, 11, 1.6], color: "yellow" },
    { pos: [0, -22, -336], size: [12, 12, 1.6], color: "red" },
    { pos: [0, -8, -450], size: [12, 14, 1.6], color: "normal" },
  ];

  private reactor: THREE.Mesh;
  private reactorLight: THREE.PointLight;
  private elapsed = 0;

  private static readonly CORE = new THREE.Vector3(0, -6, -470);

  constructor(world: RAPIER.World) {
    // Long Descent-style mine: dark sectors, side branches, locked
    // doors, ending in the reactor chamber.
    const boxes: Box[] = [
      box(0, 0, -8, 26, 16, 28, 14), // 0 start
      box(0, 0, -32, 9, 8, 26, 7), // 1 corridor
      box(0, 0, -58, 30, 18, 30, 16), // 2 room
      box(0, 0, -88, 9, 9, 32, 7), // 3 corridor
      box(0, 0, -118, 34, 18, 32, 18), // 4 junction
      box(24, 0, -118, 30, 8, 9, 7), // 5 branch corridor
      box(46, 0, -118, 22, 16, 24, 14, true), // 6 branch room
      box(0, -6, -153, 9, 9, 42, 7), // 7 descending corridor
      box(0, -6, -188, 34, 18, 32, 0), // 8 DARK room
      box(0, -6, -216, 9, 9, 28, 5), // 9 corridor
      box(0, -10, -244, 32, 16, 30, 14), // 10 room
      box(0, -18, -274, 10, 9, 34, 6), // 11 drop corridor
      box(0, -22, -310, 40, 16, 40, 0), // 12 DARK hall
      box(0, -22, -342, 10, 10, 28, 6), // 13 corridor
      box(0, -18, -370, 30, 18, 30, 15), // 14 room
      box(0, -12, -400, 10, 10, 36, 6), // 15 corridor
      box(-24, 0, -118, 30, 8, 9, 7), // 16 -X branch corridor
      box(-46, 0, -118, 22, 16, 24, 14, true), // 17 -X branch room
      box(0, -10, -430, 30, 18, 30, 14), // 18 room
      box(0, -8, -450, 10, 12, 24, 6), // 19 corridor
      box(0, -6, -470, 48, 32, 48, 0, true), // 20 reactor room
    ];

    const verts: number[] = [];
    const push = (
      a: number,
      ua: number,
      va: number,
      coord: number,
      u: number,
      v: number,
    ) => {
      const p = [0, 0, 0];
      p[a] = coord;
      p[ua] = u;
      p[va] = v;
      verts.push(p[0], p[1], p[2]);
    };

    for (let bi = 0; bi < boxes.length; bi++) {
      const b = boxes[bi];
      for (let a = 0; a < 3; a++) {
        const ua = (a + 1) % 3;
        const va = (a + 2) % 3;
        for (const hi of [false, true]) {
          const coord = hi ? b.max[a] : b.min[a];
          let rects: Rect[] = [
            { x0: b.min[ua], x1: b.max[ua], y0: b.min[va], y1: b.max[va] },
          ];
          // Open doorways where another box straddles this face plane.
          for (let bj = 0; bj < boxes.length; bj++) {
            if (bj === bi) continue;
            const o = boxes[bj];
            if (o.min[a] < coord && o.max[a] > coord) {
              const hole: Rect = {
                x0: o.min[ua],
                x1: o.max[ua],
                y0: o.min[va],
                y1: o.max[va],
              };
              const next: Rect[] = [];
              for (const r of rects) next.push(...carve(r, hole));
              rects = next;
            }
          }
          for (const r of rects) {
            push(a, ua, va, coord, r.x0, r.y0);
            push(a, ua, va, coord, r.x1, r.y0);
            push(a, ua, va, coord, r.x1, r.y1);
            push(a, ua, va, coord, r.x0, r.y0);
            push(a, ua, va, coord, r.x1, r.y1);
            push(a, ua, va, coord, r.x0, r.y1);
          }
        }
      }

      const cx = (b.min[0] + b.max[0]) / 2;
      const cy = (b.min[1] + b.max[1]) / 2;
      const cz = (b.min[2] + b.max[2]) / 2;
      if (b.light > 0) {
        const span = Math.max(
          b.max[0] - b.min[0],
          b.max[1] - b.min[1],
          b.max[2] - b.min[2],
        );
        const lamp = new THREE.PointLight(
          b.warm ? 0xffb060 : 0x8fe8ff,
          b.light * 2.4,
          span * 1.9,
          1.7,
        );
        lamp.position.set(cx, cy, cz);
        this.group.add(lamp);
      }
      if (bi !== 0) {
        this.enemySpawns.push(new THREE.Vector3(cx, cy, cz));
      }
    }

    const center = (i: number) =>
      new THREE.Vector3(
        (boxes[i].min[0] + boxes[i].max[0]) / 2,
        (boxes[i].min[1] + boxes[i].max[1]) / 2,
        (boxes[i].min[2] + boxes[i].max[2]) / 2,
      );
    for (const i of [2, 6, 10, 14, 17]) this.factorySpawns.push(center(i));
    for (const i of [1, 3, 5, 11, 13, 15, 18]) {
      this.pickupSpawns.push(center(i).add(new THREE.Vector3(0, 2, 0)));
    }
    // Access keys, each on the main path before its locked door.
    this.keySpawns.push(
      { pos: center(2).add(new THREE.Vector3(0, 3, 0)), kind: "keyblue" },
      { pos: center(8).add(new THREE.Vector3(0, 3, 0)), kind: "keyyellow" },
      { pos: center(12).add(new THREE.Vector3(0, 3, 0)), kind: "keyred" },
    );

    const positions = new Float32Array(verts);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      color: 0x36475a,
      metalness: 0.55,
      roughness: 0.65,
      side: THREE.DoubleSide,
      emissive: 0x16242f,
    });
    this.group.add(new THREE.Mesh(geo, mat));

    // Edge grid for the classic Descent look.
    this.group.add(
      new THREE.LineSegments(
        new THREE.EdgesGeometry(geo, 25),
        new THREE.LineBasicMaterial({
          color: 0x3a7f9c,
          transparent: true,
          opacity: 0.3,
        }),
      ),
    );

    const indices = new Uint32Array(positions.length / 3);
    for (let i = 0; i < indices.length; i++) indices[i] = i;
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    world.createCollider(RAPIER.ColliderDesc.trimesh(positions, indices), body);

    // --- The core ---
    const reactorGeo = new THREE.IcosahedronGeometry(6, 1);
    const reactorMat = new THREE.MeshStandardMaterial({
      color: 0xffb24a,
      emissive: 0xff7b1a,
      emissiveIntensity: 1.4,
      metalness: 0.3,
      roughness: 0.4,
    });
    this.reactor = new THREE.Mesh(reactorGeo, reactorMat);
    this.reactor.position.copy(Level.CORE);
    this.group.add(this.reactor);

    const reactorBody = world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(
        Level.CORE.x,
        Level.CORE.y,
        Level.CORE.z,
      ),
    );
    world.createCollider(RAPIER.ColliderDesc.ball(6.5), reactorBody);

    this.reactorLight = new THREE.PointLight(0xff8a2a, 150, 110, 2);
    this.reactorLight.position.copy(Level.CORE);
    this.group.add(this.reactorLight);

    this.group.add(new THREE.AmbientLight(0x6f86a0, 2.1));
    const fill = new THREE.HemisphereLight(0x9fc4e8, 0x202830, 1.4);
    this.group.add(fill);

    this.corePosition = Level.CORE.clone();

    // Extra hostiles guarding the reactor.
    this.enemySpawns.push(
      Level.CORE.clone().add(new THREE.Vector3(16, 9, 12)),
      Level.CORE.clone().add(new THREE.Vector3(-15, -8, -10)),
      Level.CORE.clone().add(new THREE.Vector3(12, -10, 14)),
    );

    // --- Spawn at the start room, facing into the mine (-Z) ---
    this.spawnPosition = new THREE.Vector3(0, 0, 2);
    const m = new THREE.Matrix4().lookAt(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, -1),
      new THREE.Vector3(0, 1, 0),
    );
    this.spawnQuaternion = new THREE.Quaternion().setFromRotationMatrix(m);
  }

  update(dt: number) {
    this.elapsed += dt;
    this.reactor.rotation.y += dt * 0.6;
    this.reactor.rotation.x += dt * 0.25;
    const pulse = 1 + Math.sin(this.elapsed * 3) * 0.25;
    this.reactorLight.intensity = 150 * pulse;
    (this.reactor.material as THREE.MeshStandardMaterial).emissiveIntensity =
      1.2 + pulse * 0.4;
  }

  dispose() {
    this.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      mesh.geometry?.dispose?.();
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat?.dispose?.();
    });
  }
}
