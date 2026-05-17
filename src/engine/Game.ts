import * as THREE from "three";
import { Input } from "./Input";
import { MusicEngine } from "../audio/Music";
import { Sfx } from "../audio/Sfx";
import type { GameState } from "../states/GameState";

/**
 * Top-level engine: owns the renderer, the main loop and the active state.
 * States (menu, play) are swapped via setState().
 */
export class Game {
  readonly renderer: THREE.WebGLRenderer;
  readonly container: HTMLElement;
  readonly input: Input;
  readonly music = new MusicEngine();
  readonly sfx = new Sfx();

  /** Selected difficulty 1..5 (persists across menu/play). */
  difficulty = 2;
  /** Story plays levels in sequence; mission is a one-off pick. */
  mode: "story" | "mission" = "story";
  levelIndex = 0;
  pilotName = "";
  pilotIdx = 0;

  /** Carried across a death so the level can restart with lost gear. */
  restartLives = -1;
  restartDrops: { x: number; y: number; z: number; kind: string }[] = [];
  restartKeys: { blue: boolean; red: boolean; yellow: boolean } | null = null;
  clearRestart() {
    this.restartLives = -1;
    this.restartDrops = [];
    this.restartKeys = null;
  }

  private current: GameState | null = null;
  private clock = new THREE.Clock();
  private running = false;

  constructor(container: HTMLElement) {
    this.container = container;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.domElement.tabIndex = 0;
    container.appendChild(this.renderer.domElement);

    this.input = new Input(this.renderer.domElement);

    window.addEventListener("resize", this.onResize);
  }

  get size() {
    return { width: window.innerWidth, height: window.innerHeight };
  }

  private onResize = () => {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  };

  setState(next: GameState) {
    this.current?.exit();
    this.current = next;
    next.enter(this);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.clock.start();
    this.renderer.setAnimationLoop(this.loop);
  }

  private loop = () => {
    // Clamp dt so a tab-switch / breakpoint can't teleport the player.
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.current?.update(dt);
  };
}
