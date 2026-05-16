import * as THREE from "three";
import { RAPIER } from "../physics/Physics";
import type { Input } from "../engine/Input";

const MAX_SPEED = 40;
const BOOST_SPEED = 78;
const ACCEL = 90;
const DAMPING_RATE = 1.8; // higher = stops gliding sooner
const MOUSE_SENSITIVITY = 0.0022; // rad per pixel
const ROLL_SPEED = 1.7; // rad / s
const LEVEL_RATE = 6; // how fast "auto-level" rights the ship

/**
 * The player ship. True 6DOF: orientation is a free quaternion (no world-up
 * lock) and all rotations are applied in ship-local space, Descent style.
 * Movement is collide-and-slide via a Rapier kinematic character controller.
 */
export class Ship {
  readonly position = new THREE.Vector3();
  readonly quaternion = new THREE.Quaternion();
  readonly model = new THREE.Group();

  private velocity = new THREE.Vector3();
  private body: RAPIER.RigidBody;
  private collider: RAPIER.Collider;
  private controller: RAPIER.KinematicCharacterController;

  private readonly fwd = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly up = new THREE.Vector3();
  private readonly tmpQuat = new THREE.Quaternion();
  private readonly resetQuat = new THREE.Quaternion();
  private readonly accel = new THREE.Vector3();

  constructor(
    world: RAPIER.World,
    spawnPos: THREE.Vector3,
    spawnQuat: THREE.Quaternion,
  ) {
    this.position.copy(spawnPos);
    this.quaternion.copy(spawnQuat);
    this.resetQuat.copy(spawnQuat);

    this.body = world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(
        spawnPos.x,
        spawnPos.y,
        spawnPos.z,
      ),
    );
    this.collider = world.createCollider(
      RAPIER.ColliderDesc.ball(1.4),
      this.body,
    );

    this.controller = world.createCharacterController(0.05);
    this.controller.setSlideEnabled(true);
    this.controller.enableAutostep(0.3, 0.1, true);

    this.buildModel();
  }

  private buildModel() {
    const hull = new THREE.MeshStandardMaterial({
      color: 0x9fb6c8,
      metalness: 0.8,
      roughness: 0.35,
      emissive: 0x0c1a26,
    });
    const accent = new THREE.MeshStandardMaterial({
      color: 0x2a3a48,
      metalness: 0.7,
      roughness: 0.5,
    });

    // Fuselage: cone pointing along -Z (ship forward).
    const body = new THREE.Mesh(new THREE.ConeGeometry(0.9, 3.4, 12), hull);
    body.rotation.x = -Math.PI / 2;
    this.model.add(body);

    const cockpit = new THREE.Mesh(
      new THREE.SphereGeometry(0.55, 12, 10),
      new THREE.MeshStandardMaterial({
        color: 0x38f0e6,
        emissive: 0x1f8f88,
        emissiveIntensity: 0.8,
        metalness: 0.4,
        roughness: 0.25,
      }),
    );
    cockpit.position.set(0, 0.25, -0.2);
    this.model.add(cockpit);

    for (const s of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.18, 1.3), accent);
      wing.position.set(s * 1.5, -0.1, 0.7);
      wing.rotation.z = s * 0.18;
      this.model.add(wing);
    }

    const glow = new THREE.Mesh(
      new THREE.CylinderGeometry(0.4, 0.55, 0.5, 12),
      new THREE.MeshBasicMaterial({ color: 0x66f0ff }),
    );
    glow.rotation.x = Math.PI / 2;
    glow.position.set(0, 0, 1.7);
    this.model.add(glow);
  }

  get speed(): number {
    return this.velocity.length();
  }

  /** Exposed so weapons can exclude the ship from their raycasts. */
  get rigidBody(): RAPIER.RigidBody {
    return this.body;
  }

  /** Reset to a spawn pose with zero velocity (used on death). */
  respawn(pos: THREE.Vector3, quat: THREE.Quaternion) {
    this.position.copy(pos);
    this.quaternion.copy(quat);
    this.velocity.set(0, 0, 0);
    this.body.setNextKinematicTranslation(this.position);
    this.body.setNextKinematicRotation(this.quaternion);
  }

  update(dt: number, input: Input) {
    // --- Orientation: local-space pitch / yaw / roll ---
    const { dx, dy } = input.consumeMouse();

    if (dx !== 0) this.rotateLocal(0, 1, 0, -dx * MOUSE_SENSITIVITY);
    if (dy !== 0) this.rotateLocal(1, 0, 0, -dy * MOUSE_SENSITIVITY);

    let roll = 0;
    if (input.isDown("KeyQ")) roll += 1; // roll left
    if (input.isDown("KeyE")) roll -= 1; // roll right
    if (roll !== 0) this.rotateLocal(0, 0, 1, roll * ROLL_SPEED * dt);

    // Reset: ease the orientation back to the default rotation only.
    if (input.isDown("KeyR")) {
      this.quaternion.slerp(this.resetQuat, 1 - Math.exp(-LEVEL_RATE * dt));
    }

    this.quaternion.normalize();

    // --- Local thrust axes ---
    this.fwd.set(0, 0, -1).applyQuaternion(this.quaternion);
    this.right.set(1, 0, 0).applyQuaternion(this.quaternion);
    this.up.set(0, 1, 0).applyQuaternion(this.quaternion);

    this.accel.set(0, 0, 0);
    if (input.isDown("KeyW")) this.accel.addScaledVector(this.fwd, 1);
    if (input.isDown("KeyS")) this.accel.addScaledVector(this.fwd, -1);
    if (input.isDown("KeyD")) this.accel.addScaledVector(this.right, 1);
    if (input.isDown("KeyA")) this.accel.addScaledVector(this.right, -1);
    if (input.isDown("Space")) this.accel.addScaledVector(this.up, 1);
    if (input.isDown("KeyC")) this.accel.addScaledVector(this.up, -1);

    if (this.accel.lengthSq() > 0) {
      this.accel.normalize().multiplyScalar(ACCEL * dt);
      this.velocity.add(this.accel);
    }

    // Glide damping + speed clamp.
    this.velocity.multiplyScalar(Math.exp(-DAMPING_RATE * dt));
    const boosting = input.isDown("ShiftLeft") || input.isDown("ShiftRight");
    const max = boosting ? BOOST_SPEED : MAX_SPEED;
    if (this.velocity.length() > max) this.velocity.setLength(max);

    // --- Collide & slide ---
    const desired = this.velocity.clone().multiplyScalar(dt);
    this.controller.computeColliderMovement(this.collider, {
      x: desired.x,
      y: desired.y,
      z: desired.z,
    });
    const corrected = this.controller.computedMovement();

    this.position.x += corrected.x;
    this.position.y += corrected.y;
    this.position.z += corrected.z;

    // Re-derive velocity from the corrected move so we slide along walls
    // instead of grinding into them.
    if (dt > 0) {
      this.velocity.set(
        corrected.x / dt,
        corrected.y / dt,
        corrected.z / dt,
      );
    }

    this.body.setNextKinematicTranslation(this.position);
    this.body.setNextKinematicRotation(this.quaternion);
  }

  /** Rotate around a ship-local axis by `angle` radians. */
  private rotateLocal(x: number, y: number, z: number, angle: number) {
    this.tmpQuat.setFromAxisAngle(new THREE.Vector3(x, y, z), angle);
    this.quaternion.multiply(this.tmpQuat);
  }

  syncCamera(camera: THREE.PerspectiveCamera) {
    camera.position.copy(this.position);
    camera.quaternion.copy(this.quaternion);
  }
}
