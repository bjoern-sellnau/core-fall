import * as THREE from "three";

interface Debris {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
}

interface Boom {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  delay: number;
  life: number;
  max: number;
}

export interface Inventory {
  laser: number;
  rockets: number;
}

/**
 * Third-person death spectacle: a staggered fireball plus slowly
 * drifting wreckage and the power-ups the player was carrying.
 */
export class DeathFx {
  readonly group = new THREE.Group();

  private debris: Debris[] = [];
  private booms: Boom[] = [];
  private light = new THREE.PointLight(0xff8a3a, 0, 90, 2);

  private readonly shardGeo = new THREE.TetrahedronGeometry(0.7);
  private readonly itemGeo = new THREE.OctahedronGeometry(0.7, 0);
  private readonly boomGeo = new THREE.SphereGeometry(1, 14, 14);

  constructor() {
    this.group.add(this.light);
  }

  trigger(pos: THREE.Vector3, inv: Inventory) {
    this.light.position.copy(pos);
    this.light.intensity = 140;

    for (let i = 0; i < 5; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: i % 2 ? 0xffd27a : 0xff7a3a,
        transparent: true,
        opacity: 1,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(this.boomGeo, mat);
      mesh.position
        .copy(pos)
        .add(
          new THREE.Vector3(
            (Math.random() - 0.5) * 4,
            (Math.random() - 0.5) * 4,
            (Math.random() - 0.5) * 4,
          ),
        );
      this.group.add(mesh);
      this.booms.push({ mesh, mat, delay: i * 0.08, life: 0.6, max: 0.6 });
    }

    // Ship wreckage.
    for (let i = 0; i < 9; i++) {
      this.addDebris(
        pos,
        new THREE.MeshStandardMaterial({
          color: 0x6b7c8c,
          metalness: 0.7,
          roughness: 0.5,
          emissive: 0x223040,
        }),
        this.shardGeo,
      );
    }

    // The power-ups you were carrying, drifting away.
    const items: number[] = [];
    for (let i = 0; i < Math.max(1, inv.laser); i++) items.push(0x46d8ff);
    for (let i = 0; i < Math.min(4, inv.rockets); i++) items.push(0xff9a3a);
    items.push(0x44ff88, 0x46d8ff, 0xff5ce0);
    for (const c of items) {
      this.addDebris(
        pos,
        new THREE.MeshBasicMaterial({ color: c }),
        this.itemGeo,
      );
    }
  }

  private addDebris(
    pos: THREE.Vector3,
    mat: THREE.Material,
    geo: THREE.BufferGeometry,
  ) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(pos);
    this.group.add(mesh);
    this.debris.push({
      mesh,
      vel: new THREE.Vector3(
        (Math.random() - 0.5) * 9,
        (Math.random() - 0.5) * 9,
        (Math.random() - 0.5) * 9,
      ),
      spin: new THREE.Vector3(
        (Math.random() - 0.5) * 3,
        (Math.random() - 0.5) * 3,
        (Math.random() - 0.5) * 3,
      ),
    });
  }

  update(dt: number) {
    this.light.intensity *= 1 - Math.min(1, dt * 2.4);

    for (const d of this.debris) {
      d.mesh.position.addScaledVector(d.vel, dt);
      d.vel.multiplyScalar(1 - Math.min(1, dt * 0.5)); // drag → slow float
      d.mesh.rotation.x += d.spin.x * dt;
      d.mesh.rotation.y += d.spin.y * dt;
      d.mesh.rotation.z += d.spin.z * dt;
    }

    for (let i = this.booms.length - 1; i >= 0; i--) {
      const b = this.booms[i];
      if (b.delay > 0) {
        b.delay -= dt;
        b.mesh.scale.setScalar(0.01);
        continue;
      }
      b.life -= dt;
      const k = Math.max(0, b.life / b.max);
      b.mesh.scale.setScalar(1 + (1 - k) * 9);
      b.mat.opacity = k;
      if (b.life <= 0) {
        this.group.remove(b.mesh);
        b.mat.dispose();
        this.booms.splice(i, 1);
      }
    }
  }

  /** Clear all wreckage (called on respawn / leaving the state). */
  reset() {
    for (const d of this.debris) {
      this.group.remove(d.mesh);
      (d.mesh.material as THREE.Material).dispose();
    }
    for (const b of this.booms) {
      this.group.remove(b.mesh);
      b.mat.dispose();
    }
    this.debris = [];
    this.booms = [];
    this.light.intensity = 0;
  }

  dispose() {
    this.reset();
    this.shardGeo.dispose();
    this.itemGeo.dispose();
    this.boomGeo.dispose();
  }
}
