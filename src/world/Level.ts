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
 * The COREFALL test level: a long winding mine that opens into two
 * intermediate caverns and ends in a large reactor chamber with a
 * glowing core at its centre.
 */
export class Level {
  readonly group = new THREE.Group();
  readonly spawnPosition: THREE.Vector3;
  readonly spawnQuaternion: THREE.Quaternion;
  readonly corePosition: THREE.Vector3;
  readonly enemySpawns: THREE.Vector3[] = [];

  private reactor: THREE.Mesh;
  private reactorLight: THREE.PointLight;
  private elapsed = 0;

  private static readonly CORE = new THREE.Vector3(0, 0, -485);
  private static readonly CHAMBER_A = new THREE.Vector3(0, 0, -160);
  private static readonly CHAMBER_B = new THREE.Vector3(0, -2, -300);

  constructor(world: RAPIER.World) {
    const path = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 4, -42),
      new THREE.Vector3(16, -6, -84),
      new THREE.Vector3(-12, 7, -126),
      Level.CHAMBER_A.clone(),
      new THREE.Vector3(10, 9, -198),
      new THREE.Vector3(-14, -7, -236),
      new THREE.Vector3(6, 5, -272),
      Level.CHAMBER_B.clone(),
      new THREE.Vector3(-16, 6, -338),
      new THREE.Vector3(12, -8, -380),
      new THREE.Vector3(0, 4, -420),
      new THREE.Vector3(0, 0, -452),
      Level.CORE.clone(),
    ]);

    // --- Tunnel ---
    const tubeGeo = new THREE.TubeGeometry(path, 540, 6.2, 18, false);
    const tubeMat = new THREE.MeshStandardMaterial({
      color: 0x1b2733,
      metalness: 0.7,
      roughness: 0.55,
      side: THREE.BackSide,
      emissive: 0x07121c,
    });
    this.group.add(new THREE.Mesh(tubeGeo, tubeMat));
    addTrimesh(world, tubeGeo);

    // Wireframe overlay for the classic Descent grid look.
    this.group.add(
      new THREE.LineSegments(
        new THREE.WireframeGeometry(
          new THREE.TubeGeometry(path, 270, 6.2, 9, false),
        ),
        new THREE.LineBasicMaterial({
          color: 0x2f6f8f,
          transparent: true,
          opacity: 0.22,
        }),
      ),
    );

    // Light strip running down the tunnel.
    for (let i = 0; i <= 16; i++) {
      const lamp = new THREE.PointLight(0x57e0ff, 16, 34, 2);
      lamp.position.copy(path.getPointAt(i / 16));
      this.group.add(lamp);
    }

    // --- Intermediate caverns ---
    this.addChamber(world, Level.CHAMBER_A, 22, 0x2a3340, 0x6fd0ff);
    this.addChamber(world, Level.CHAMBER_B, 24, 0x33281a, 0xffb24a);

    // --- Reactor chamber ---
    this.addChamber(world, Level.CORE, 36, 0x241a12, 0xff8a2a, 0.0);

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

    this.reactorLight = new THREE.PointLight(0xff8a2a, 150, 120, 2);
    this.reactorLight.position.copy(Level.CORE);
    this.group.add(this.reactorLight);

    this.group.add(new THREE.AmbientLight(0x1a2a3a, 1.1));

    this.corePosition = Level.CORE.clone();

    // --- Enemy spawn points: spread through tunnel + caverns ---
    for (const t of [0.14, 0.26, 0.4, 0.52, 0.64, 0.76, 0.86]) {
      this.enemySpawns.push(path.getPointAt(t));
    }
    for (const c of [Level.CHAMBER_A, Level.CHAMBER_B]) {
      this.enemySpawns.push(c.clone().add(new THREE.Vector3(8, 4, 0)));
      this.enemySpawns.push(c.clone().add(new THREE.Vector3(-7, -5, 6)));
    }
    this.enemySpawns.push(Level.CORE.clone().add(new THREE.Vector3(16, 8, 10)));
    this.enemySpawns.push(
      Level.CORE.clone().add(new THREE.Vector3(-15, -9, -8)),
    );

    // --- Spawn at the tunnel mouth, facing inward ---
    this.spawnPosition = path.getPointAt(0.008);
    const tangent = path.getTangentAt(0.008);
    const m = new THREE.Matrix4().lookAt(
      new THREE.Vector3(),
      tangent.clone().negate(),
      new THREE.Vector3(0, 1, 0),
    );
    this.spawnQuaternion = new THREE.Quaternion().setFromRotationMatrix(m);
  }

  private addChamber(
    world: RAPIER.World,
    center: THREE.Vector3,
    radius: number,
    color: number,
    lightColor: number,
    lightIntensity = 70,
  ) {
    const geo = new THREE.IcosahedronGeometry(radius, 3);
    const mat = new THREE.MeshStandardMaterial({
      color,
      metalness: 0.6,
      roughness: 0.7,
      side: THREE.BackSide,
      emissive: 0x0a0a0a,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(center);
    this.group.add(mesh);
    addTrimesh(world, geo, center);

    if (lightIntensity > 0) {
      const light = new THREE.PointLight(lightColor, lightIntensity, radius * 3, 2);
      light.position.copy(center);
      this.group.add(light);
    }
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
