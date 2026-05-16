import type { Game } from "../engine/Game";

/** A screen / mode of the game (menu, playing, ...). */
export interface GameState {
  enter(game: Game): void;
  /** dt is the frame delta in seconds. */
  update(dt: number): void;
  exit(): void;
}
