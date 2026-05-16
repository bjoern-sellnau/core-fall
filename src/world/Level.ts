import * as THREE from "three";
import { RAPIER } from "../physics/Physics";

/** Builds a static collider (fixed body) from a THREE geometry. */
function addTrimesh(
  world: RAPIER.World,
  geo: THREE.BufferGeometry,
  offset = new THREE.Vector3(),
) {
  const pos = geo.getAttribute("position");
  const verts = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    verts[i * 3 + 0] = pos.getX(i) + offset.x;
    verts[i * 3 + 1] = pos.getY(i) + offset.y;
    verts[i * 3 + 2] = pos.getZ(i) + offset.z;
  }

  let indices: Uint32Array;
  if (geo.index) {
    indices = Uint32Array.from(geo.index.array);
  } else {
    indices = new Uint32Array(pos.count);
    for (let i = 0; i < pos.count; i++) indices[i] = i;
  }

  const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  world.createCollider(RAPIER.ColliderDesc.trimesh(verts, indices), body);
}

/**
 * The COREFALL test level: a winding mine tunnel that ends in a large
 * reactor chamber with a glowing core at its centre.
 */
export class Level {
  readonly group = new THREE.Group();
  readonly spawnPosition: THREE.Vector3;
  readonly spawnQuaternion: THREE.Quaternion;

  private reactor: THREE.Mesh;
  private reactorLight: THREE.PointLight;
  private elapsed = 0;

  private static readonly CHAMBER_CENTER = new THREE.Vector3(0, 0, -240);
  private static readonly CHAMBER_RADIUS = 30;

  constructor(world: RAPIER.World) {
    const path = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 3, -32),
      new THREE.Vector3(10, -4, -64),
      new THREE.Vector3(-8, 5, -100),
      new THREE.Vector3(6, 0, -138),
      new THREE.Vector3(0, -6, -176),
      new THREE.Vector3(0, 0, -210),
    ]);

    // --- Tunnel ---
    const tubeGeo = new THREE.TubeGeometry(path, 260, 6, 18, false);
    const tubeMat = new THREE.MeshStandardMaterial({
      color: 0x1b2733,
      metalness: 0.7,
      roughness: 0.55,
      side: THREE.BackSide,
      emissive: 0x07121c,
    });
    const tube = new THREE.Mesh(tubeGeo, tubeMat);
    this.group.add(tube);
    addTrimesh(world, tubeGeo);

    // Wireframe overlay for the classic Descent grid look.
    const wire = new THREE.LineSegments(
      new THREE.WireframeGeometry(new THREE.TubeGeometry(path, 130, 6, 9, false)),
      new THREE.LineBasicMaterial({ color: 0x2f6f8f, transparent: true, opacity: 0.25 }),
    );
    this.group.add(wire);

    // Light strip running down the tunnel.
    for (let i = 0; i <= 14; i++) {
      const p = path.getPointAt(i / 14);
      const lamp = new THREE.PointLight(0x57e0ff, 18, 30, 2);
      lamp.position.copy(p);
      this.group.add(lamp);
    }

    // --- Reactor chamber ---
    const chamberGeo = new THREE.IcosahedronGeometry(Level.CHAMBER_RADIUS, 3);
    const chamberMat = new THREE.MeshStandardMaterial({
      color: 0x241a12,
      metalness: 0.6,
      roughness: 0.7,
      side: THREE.BackSide,
      emissive: 0x140a04,
    });
    const chamber = new THREE.Mesh(chamberGeo, chamberMat);
    chamber.position.copy(Level.CHAMBER_CENTER);
    this.group.add(chamber);
    addTrimesh(world, chamberGeo, Level.CHAMBER_CENTER);

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
    this.reactor.position.copy(Level.CHAMBER_CENTER);
    this.group.add(this.reactor);

    const reactorBody = world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(
        Level.CHAMBER_CENTER.x,
        Level.CHAMBER_CENTER.y,
        Level.CHAMBER_CENTER.z,
      ),
    );
    world.createCollider(RAPIER.ColliderDesc.ball(6.5), reactorBody);

    this.reactorLight = new THREE.PointLight(0xff8a2a, 120, 90, 2);
    this.reactorLight.position.copy(Level.CHAMBER_CENTER);
    this.group.add(this.reactorLight);

    // Ambient + key fill so surfaces are never pure black.
    this.group.add(new THREE.AmbientLight(0x1a2a3a, 1.1));

    // --- Spawn at the tunnel mouth, facing inward ---
    this.spawnPosition = path.getPointAt(0.01);
    const tangent = path.getTangentAt(0.01);
    const m = new THREE.Matrix4().lookAt(
      new THREE.Vector3(),
      tangent.clone().negate(),
      new THREE.Vector3(0, 1, 0),
    );
    this.spawnQuaternion = new THREE.Quaternion().setFromRotationMatrix(m);
  }

  update(dt: number) {
    this.elapsed += dt;
    this.reactor.rotation.y += dt * 0.6;
    this.reactor.rotation.x += dt * 0.25;
    const pulse = 1 + Math.sin(this.elapsed * 3) * 0.25;
    this.reactorLight.intensity = 120 * pulse;
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
