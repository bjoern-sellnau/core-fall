import RAPIER from "@dimforge/rapier3d-compat";

let ready: Promise<typeof RAPIER> | null = null;

/** Loads and initializes the Rapier WASM module exactly once. */
export function initRapier(): Promise<typeof RAPIER> {
  if (!ready) {
    ready = RAPIER.init().then(() => RAPIER);
  }
  return ready;
}

export { RAPIER };

/** Thin wrapper around a Rapier physics world with a fixed timestep accumulator. */
export class PhysicsWorld {
  readonly world: RAPIER.World;
  private accumulator = 0;
  private readonly fixedStep = 1 / 60;

  constructor() {
    // Zero gravity: COREFALL is a 6DOF space/mine flyer.
    this.world = new RAPIER.World({ x: 0, y: 0, z: 0 });
    this.world.timestep = this.fixedStep;
  }

  /** Steps the world with a fixed timestep; returns how many steps ran. */
  step(dt: number): number {
    this.accumulator += dt;
    let steps = 0;
    // Cap iterations to avoid a spiral of death after a long stall.
    while (this.accumulator >= this.fixedStep && steps < 5) {
      this.world.step();
      this.accumulator -= this.fixedStep;
      steps++;
    }
    return steps;
  }

  dispose() {
    this.world.free();
  }
}
