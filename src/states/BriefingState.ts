import type { Game } from "../engine/Game";
import type { GameState } from "./GameState";
import { PlayState } from "./PlayState";
import { LEVELS } from "../world/levels";

/** Story interstitial: shows the level name + briefing, then launches. */
export class BriefingState implements GameState {
  private game!: Game;
  private root!: HTMLElement;

  enter(game: Game) {
    this.game = game;
    const def = LEVELS[game.levelIndex];

    this.root = document.createElement("div");
    this.root.className = "menu";
    this.root.innerHTML = `
      <p class="menu__subtitle">MISSION ${game.levelIndex + 1} / ${LEVELS.length}</p>
      <h1 class="menu__title" style="font-size:clamp(2rem,8vw,5rem)">${def.name}</h1>
      <div class="menu__controls" style="max-width:42rem;font-size:0.95rem;white-space:pre-line">${def.brief}</div>
      <div class="menu__buttons">
        <button class="menu__btn" id="cf-launch">LAUNCH</button>
      </div>
    `;
    game.container.appendChild(this.root);

    const launch = () => {
      this.game.music.start();
      this.game.sfx.start();
      this.game.music.setScene("game");
      this.game.setState(new PlayState());
    };
    this.root.querySelector<HTMLButtonElement>("#cf-launch")!.onclick = launch;
    this.onKey = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code === "Enter") launch();
    };
    window.addEventListener("keydown", this.onKey);
  }

  private onKey: (e: KeyboardEvent) => void = () => {};

  update() {}

  exit() {
    window.removeEventListener("keydown", this.onKey);
    this.root.remove();
  }
}
