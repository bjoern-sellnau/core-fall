import * as THREE from "three";
import { RAPIER } from "../physics/Physics";
import type { DoorDef } from "./Doors";
import type { LevelDef } from "./levels";

interface Box {
  min: [number, number, number];
  max: [number, number, number];
  light: number;
  warm: boolean;
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

function carve(r: Rect, h: Rect): Rect[] {
  const hx0 = Math.max(r.x0, h.x0);
  const hx1 = Math.min(r.x1, h.x1);
  const hy0 = Math.max(r.y0, h.y0);
  const hy1 = Math.min(r.y1, h.y1);
  if (hx0 >= hx1 || hy0 >= hy1) return [r];
  const out: Rect[] = [];
  if (hy0 > r.y0) out.push({ x0: r.x0, x1: r.x1, y0: r.y0, y1: hy0 });
  if (hy1 < r.y1) out.push({ x0: r.x0, x1: r.x1, y0: hy1, y1: r.y1 });
  if (hx0 > r.x0) out.push({ x0: r.x0, x1: hx0, y0: hy0, y1: hy1 });
  if (hx1 < r.x1) out.push({ x0: hx1, x1: r.x1, y0: hy0, y1: hy1 });
  return out;
}

/** Procedural grey wall texture; `style` gives each level a look. */
function makeWallTexture(style: string): THREE.CanvasTexture {
  const s = 256;
  const cv = document.createElement("canvas");
  cv.width = s;
  cv.height = s;
  const g = cv.getContext("2d")!;
  g.fillStyle = "#8d949c";
  g.fillRect(0, 0, s, s);
  for (let i = 0; i < 2200; i++) {
    g.fillStyle = `rgba(${Math.random() < 0.5 ? 255 : 0},${
      Math.random() < 0.5 ? 255 : 0
    },${Math.random() < 0.5 ? 255 : 0},0.04)`;
    g.fillRect(Math.random() * s, Math.random() * s, 2, 2);
  }
  const dark = "rgba(18,22,26,0.6)";
  const lite = "rgba(228,238,248,0.5)";

  if (style === "rock") {
    for (let i = 0; i < 60; i++) {
      g.fillStyle = `rgba(0,0,0,${0.04 + Math.random() * 0.08})`;
      g.beginPath();
      g.arc(
        Math.random() * s,
        Math.random() * s,
        8 + Math.random() * 26,
        0,
        Math.PI * 2,
      );
      g.fill();
    }
  } else if (style === "circuit") {
    g.strokeStyle = dark;
    g.lineWidth = 2;
    for (let i = 0; i < 22; i++) {
      g.beginPath();
      const y = Math.random() * s;
      g.moveTo(0, y);
      g.lineTo(s * (0.3 + Math.random() * 0.7), y);
      g.lineTo(s * (0.3 + Math.random() * 0.7), Math.random() * s);
      g.stroke();
    }
    g.fillStyle = lite;
    for (let i = 0; i < 40; i++) {
      g.fillRect(Math.random() * s, Math.random() * s, 4, 4);
    }
  } else if (style === "hex") {
    g.strokeStyle = dark;
    g.lineWidth = 2;
    const r = 26;
    for (let row = -1; row < s / (r * 1.5) + 1; row++) {
      for (let col = -1; col < s / (r * 1.8) + 1; col++) {
        const cx = col * r * 1.8 + (row % 2 ? r * 0.9 : 0);
        const cy = row * r * 1.5;
        g.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = (Math.PI / 3) * k + Math.PI / 6;
          const px = cx + Math.cos(a) * r;
          const py = cy + Math.sin(a) * r;
          k ? g.lineTo(px, py) : g.moveTo(px, py);
        }
        g.closePath();
        g.stroke();
      }
    }
  } else if (style === "tile") {
    g.strokeStyle = dark;
    g.lineWidth = 4;
    for (let p = 0; p <= s; p += 32) {
      g.beginPath();
      g.moveTo(p, 0);
      g.lineTo(p, s);
      g.moveTo(0, p);
      g.lineTo(s, p);
      g.stroke();
    }
  } else {
    // "panel" (default): big seams + rivets.
    g.strokeStyle = dark;
    g.lineWidth = 3;
    for (let p = 0; p <= s; p += 64) {
      g.beginPath();
      g.moveTo(p, 0);
      g.lineTo(p, s);
      g.moveTo(0, p);
      g.lineTo(s, p);
      g.stroke();
    }
    g.fillStyle = lite;
    for (let x = 16; x < s; x += 64)
      for (let y = 16; y < s; y += 64) {
        g.beginPath();
        g.arc(x, y, 2.4, 0, Math.PI * 2);
        g.fill();
      }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/**
 * Builds one level from a data-driven LevelDef: a graph of axis-aligned
 * rooms/corridors where overlaps auto-open into doorways.
 */
export class Level {
  readonly group = new THREE.Group();
  readonly spawnPosition: THREE.Vector3;
  readonly spawnQuaternion: THREE.Quaternion;
  readonly corePosition: THREE.Vector3;
  readonly exitZone: THREE.Vector3;
  readonly fogDensity: number;
  readonly fogColor: number;
  readonly mapBoxes: { x0: number; z0: number; x1: number; z1: number }[] = [];
  readonly enemySpawns: THREE.Vector3[] = [];
  readonly factorySpawns: THREE.Vector3[] = [];
  readonly pickupSpawns: THREE.Vector3[] = [];
  readonly keySpawns: { pos: THREE.Vector3; kind: string }[] = [];
  readonly doorDefs: DoorDef[];

  private reactor: THREE.Mesh;
  private reactorLight: THREE.PointLight;
  private wallTex: THREE.CanvasTexture;
  private elapsed = 0;

  private sectors: { group: THREE.Group; c: THREE.Vector3; r2: number }[] = [];
  private lightPool: THREE.PointLight[] = [];
  private lightSrc: {
    p: THREE.Vector3;
    color: number;
    intensity: number;
    range: number;
  }[] = [];

  constructor(world: RAPIER.World, def: LevelDef) {
    this.doorDefs = def.doors;
    this.fogDensity = def.fog;
    this.fogColor = def.fogColor;
    const core = new THREE.Vector3(def.core[0], def.core[1], def.core[2]);
    this.corePosition = core.clone();
    this.exitZone = new THREE.Vector3(def.exit[0], def.exit[1], def.exit[2]);

    const boxes: Box[] = def.boxes.map((b) =>
      box(b[0], b[1], b[2], b[3], b[4], b[5], b[6], b[7] ?? false),
    );

    const merged: number[] = [];
    this.wallTex = makeWallTexture(def.tex);
    const sharedMat = new THREE.MeshStandardMaterial({
      color: def.wall,
      metalness: 0.55,
      roughness: 0.65,
      side: THREE.DoubleSide,
      emissive: def.wallEmissive,
      map: this.wallTex,
    });
    const lineMat = new THREE.LineBasicMaterial({
      color: def.line,
      transparent: true,
      opacity: 0.3,
    });

    for (let bi = 0; bi < boxes.length; bi++) {
      const b = boxes[bi];
      const v: number[] = [];
      const vu: number[] = [];
      const push = (
        a: number,
        ua: number,
        va: number,
        coord: number,
        u: number,
        w: number,
      ) => {
        const p = [0, 0, 0];
        p[a] = coord;
        p[ua] = u;
        p[va] = w;
        v.push(p[0], p[1], p[2]);
        vu.push(u * 0.07, w * 0.07);
      };

      for (let a = 0; a < 3; a++) {
        const ua = (a + 1) % 3;
        const va = (a + 2) % 3;
        for (const hi of [false, true]) {
          const coord = hi ? b.max[a] : b.min[a];
          let rects: Rect[] = [
            { x0: b.min[ua], x1: b.max[ua], y0: b.min[va], y1: b.max[va] },
          ];
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

      for (const n of v) merged.push(n);

      const sgeo = new THREE.BufferGeometry();
      sgeo.setAttribute(
        "position",
        new THREE.BufferAttribute(new Float32Array(v), 3),
      );
      sgeo.setAttribute(
        "uv",
        new THREE.BufferAttribute(new Float32Array(vu), 2),
      );
      sgeo.computeVertexNormals();
      const sectorGroup = new THREE.Group();
      sectorGroup.add(new THREE.Mesh(sgeo, sharedMat));
      sectorGroup.add(
        new THREE.LineSegments(new THREE.EdgesGeometry(sgeo, 25), lineMat),
      );
      this.group.add(sectorGroup);

      const cx = (b.min[0] + b.max[0]) / 2;
      const cy = (b.min[1] + b.max[1]) / 2;
      const cz = (b.min[2] + b.max[2]) / 2;
      const half = Math.max(
        b.max[0] - b.min[0],
        b.max[1] - b.min[1],
        b.max[2] - b.min[2],
      );
      this.sectors.push({
        group: sectorGroup,
        c: new THREE.Vector3(cx, cy, cz),
        r2: (half + 60) ** 2,
      });
      this.mapBoxes.push({
        x0: b.min[0],
        z0: b.min[2],
        x1: b.max[0],
        z1: b.max[2],
      });

      if (b.light > 0) {
        const span = Math.max(
          b.max[0] - b.min[0],
          b.max[1] - b.min[1],
          b.max[2] - b.min[2],
        );
        this.lightSrc.push({
          p: new THREE.Vector3(cx, cy, cz),
          color: b.warm ? def.lampWarm : def.lampCool,
          intensity: b.light * 2.4,
          range: span * 1.9,
        });
      }
      if (bi !== 0) {
        this.enemySpawns.push(new THREE.Vector3(cx, cy, cz));
      }
    }

    for (let i = 0; i < 5; i++) {
      const l = new THREE.PointLight(def.lampCool, 0, 60, 1.7);
      this.group.add(l);
      this.lightPool.push(l);
    }

    const center = (i: number) =>
      new THREE.Vector3(
        (boxes[i].min[0] + boxes[i].max[0]) / 2,
        (boxes[i].min[1] + boxes[i].max[1]) / 2,
        (boxes[i].min[2] + boxes[i].max[2]) / 2,
      );
    for (const i of def.factoryIdx) this.factorySpawns.push(center(i));
    for (const i of def.pickupIdx) {
      this.pickupSpawns.push(center(i).add(new THREE.Vector3(0, 2, 0)));
    }
    for (const k of def.keys) {
      this.keySpawns.push({
        pos: center(k.idx).add(new THREE.Vector3(0, 3, 0)),
        kind: k.kind,
      });
    }

    const positions = new Float32Array(merged);
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
    this.reactor.position.copy(core);
    this.group.add(this.reactor);

    const reactorBody = world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(core.x, core.y, core.z),
    );
    world.createCollider(RAPIER.ColliderDesc.ball(6.5), reactorBody);

    this.reactorLight = new THREE.PointLight(0xff8a2a, 150, 110, 2);
    this.reactorLight.position.copy(core);
    this.group.add(this.reactorLight);

    this.group.add(new THREE.AmbientLight(def.ambient, def.ambientI));
    this.group.add(
      new THREE.HemisphereLight(def.lampCool, 0x202830, 1.2),
    );

    // Extra hostiles guarding the reactor.
    this.enemySpawns.push(
      core.clone().add(new THREE.Vector3(14, 8, 10)),
      core.clone().add(new THREE.Vector3(-13, -7, -9)),
    );

    this.spawnPosition = new THREE.Vector3(
      def.spawn[0],
      def.spawn[1],
      def.spawn[2],
    );
    const m = new THREE.Matrix4().lookAt(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, -1),
      new THREE.Vector3(0, 1, 0),
    );
    this.spawnQuaternion = new THREE.Quaternion().setFromRotationMatrix(m);
  }

  update(dt: number, playerPos: THREE.Vector3) {
    this.elapsed += dt;
    if (this.reactor.visible) {
      this.reactor.rotation.y += dt * 0.6;
      this.reactor.rotation.x += dt * 0.25;
      const pulse = 1 + Math.sin(this.elapsed * 3) * 0.25;
      this.reactorLight.intensity = 150 * pulse;
      (this.reactor.material as THREE.MeshStandardMaterial).emissiveIntensity =
        1.2 + pulse * 0.4;
    }

    for (const s of this.sectors) {
      s.group.visible = playerPos.distanceToSquared(s.c) < s.r2;
    }

    const src = this.lightSrc;
    const nearest = src
      .map((s, i) => ({ i, d: playerPos.distanceToSquared(s.p) }))
      .sort((a, b) => a.d - b.d);
    for (let k = 0; k < this.lightPool.length; k++) {
      const l = this.lightPool[k];
      const pick = nearest[k];
      if (pick) {
        const s = src[pick.i];
        l.position.copy(s.p);
        l.color.setHex(s.color);
        l.intensity = s.intensity;
        l.distance = s.range;
      } else {
        l.intensity = 0;
      }
    }
  }

  destroyReactor() {
    this.reactor.visible = false;
    this.reactorLight.intensity = 0;
    this.reactorLight.visible = false;
  }

  dispose() {
    this.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      mesh.geometry?.dispose?.();
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat?.dispose?.();
    });
    this.wallTex.dispose();
  }
}
