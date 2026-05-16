import * as THREE from "three";
import { RAPIER } from "../physics/Physics";
import type { Input } from "../engine/Input";

const MAX_SPEED = 40;
const BOOST_SPEED = 78;
const ACCEL = 90;
const DAMPING_RATE = 1.8; // higher = stops gliding sooner
const MOUSE_SENSITIVITY = 0.0022; // rad per pixel
const ROLL_SPEED = 1.7; // rad / s

/**
 * The player ship. True 6DOF: orientation is a free quaternion (no world-up
 * lock) and all rotations are applied in ship-local space, Descent style.
 * Movement is collide-and-slide via a Rapier kinematic character controller.
 */
export class Ship {
  readonly position = new THREE.Vector3();
  readonly quaternion = new THREE.Quaternion();

  private velocity = new THREE.Vector3();
  private body: RAPIER.RigidBody;
  private collider: RAPIER.Collider;
  private controller: RAPIER.KinematicCharacterController;

  private readonly fwd = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly up = new THREE.Vector3();
  private readonly tmpQuat = new THREE.Quaternion();
  private readonly accel = new THREE.Vector3();

  constructor(
    world: RAPIER.World,
    spawnPos: THREE.Vector3,
    spawnQuat: THREE.Quaternion,
  ) {
    this.position.copy(spawnPos);
    this.quaternion.copy(spawnQuat);

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
  }

  get speed(): number {
    return this.velocity.length();
  }

  update(dt: number, input: Input) {
    // --- Orientation: local-space pitch / yaw / roll ---
    const { dx, dy } = input.consumeMouse();

    if (dx !== 0) this.rotateLocal(0, 1, 0, -dx * MOUSE_SENSITIVITY);
    if (dy !== 0) this.rotateLocal(1, 0, 0, -dy * MOUSE_SENSITIVITY);

    let roll = 0;
    if (input.isDown("KeyQ")) roll += 1;
    if (input.isDown("KeyE")) roll -= 1;
    if (roll !== 0) this.rotateLocal(0, 0, 1, roll * ROLL_SPEED * dt);

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
