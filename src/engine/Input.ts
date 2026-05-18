/**
 * Keyboard + pointer-lock mouse input.
 * Mouse deltas accumulate between frames and are drained by consumeMouse().
 */
import type { Keymap, Action } from "./Keymap";

export class Input {
  private keys = new Set<string>();
  private mouseButtons = new Set<number>();
  private mouseDX = 0;
  private mouseDY = 0;
  private locked = false;

  constructor(
    private readonly element: HTMLElement,
    public keymap?: Keymap,
  ) {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    document.addEventListener("mousemove", this.onMouseMove);
    document.addEventListener("mousedown", this.onMouseDown);
    document.addEventListener("mouseup", this.onMouseUp);
    document.addEventListener("contextmenu", this.onContextMenu);
    document.addEventListener("pointerlockchange", this.onPointerLockChange);
  }

  private onContextMenu = (e: MouseEvent) => {
    e.preventDefault();
  };

  private onKeyDown = (e: KeyboardEvent) => {
    this.keys.add(e.code);
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  private onMouseDown = (e: MouseEvent) => {
    this.mouseButtons.add(e.button);
  };

  private onMouseUp = (e: MouseEvent) => {
    this.mouseButtons.delete(e.button);
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

  /** True while the key bound to `action` is held. */
  isAction(action: Action): boolean {
    const code = this.keymap?.code(action);
    return !!code && this.keys.has(code);
  }

  /** True while the given mouse button is held (0 = left). */
  isMouseDown(button = 0): boolean {
    return this.mouseButtons.has(button);
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
    document.removeEventListener("mousedown", this.onMouseDown);
    document.removeEventListener("mouseup", this.onMouseUp);
    document.removeEventListener("contextmenu", this.onContextMenu);
    document.removeEventListener("pointerlockchange", this.onPointerLockChange);
  }
}
