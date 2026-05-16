/**
 * Keyboard + pointer-lock mouse input.
 * Mouse deltas accumulate between frames and are drained by consumeMouse().
 */
export class Input {
  private keys = new Set<string>();
  private mouseDX = 0;
  private mouseDY = 0;
  private locked = false;

  constructor(private readonly element: HTMLElement) {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    document.addEventListener("mousemove", this.onMouseMove);
    document.addEventListener("pointerlockchange", this.onPointerLockChange);
  }

  private onKeyDown = (e: KeyboardEvent) => {
    this.keys.add(e.code);
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  private onMouseMove = (e: MouseEvent) => {
    if (!this.locked) return;
    this.mouseDX += e.movementX;
    this.mouseDY += e.movementY;
  };

  private onPointerLockChange = () => {
    this.locked = document.pointerLockElement === this.element;
  };

  requestPointerLock() {
    this.element.requestPointerLock();
  }

  exitPointerLock() {
    if (document.pointerLockElement === this.element) {
      document.exitPointerLock();
    }
  }

  get isLocked() {
    return this.locked;
  }

  isDown(code: string): boolean {
    return this.keys.has(code);
  }

  /** Returns accumulated mouse movement since last call and resets it. */
  consumeMouse(): { dx: number; dy: number } {
    const dx = this.mouseDX;
    const dy = this.mouseDY;
    this.mouseDX = 0;
    this.mouseDY = 0;
    return { dx, dy };
  }

  dispose() {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    document.removeEventListener("mousemove", this.onMouseMove);
    document.removeEventListener("pointerlockchange", this.onPointerLockChange);
  }
}
