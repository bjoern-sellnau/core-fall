import type { Game } from "../engine/Game";
import type { GameState } from "./GameState";
import { PlayState } from "./PlayState";
import { MenuState } from "./MenuState";
import { LEVELS, ROBOT_LABEL } from "../world/levels";
import { makeShell, type Shell } from "../ui/titleShell";

/** Per-level briefing: planet, owning company, robots you'll face. */
export class BriefingState implements GameState {
  private game!: Game;
  private shell!: Shell;

  enter(game: Game) {
    this.game = game;
    this.game.music.start();
    this.game.sfx.start();
    this.game.music.setScene("menu");
    const def = LEVELS[game.levelIndex];
    this.shell = makeShell(game.container);

    const robots = [...new Set(def.kinds)]
      .map(
        (k) =>
          `<div class="robot"><span class="ic"></span>${ROBOT_LABEL[k]}</div>`,
      )
      .join("");

    this.shell.panel.innerHTML = `
      <div class="step">MISSION ${game.levelIndex + 1} / ${LEVELS.length}</div>
      <h2>${def.name}</h2>
      <div class="meta">
        <div><div class="k">Planet</div><div class="v">${def.planet}</div></div>
        <div><div class="k">Operator</div><div class="v">${def.company}</div></div>
        <div><div class="k">Threat</div><div class="v">TIER ${def.tier}</div></div>
      </div>
      <div class="field">Briefing</div>
      <div class="brief-txt">${def.brief}</div>
      <div class="field">Hostile Rigs Detected</div>
      <div class="robots">${robots}</div>
      <div class="actions">
        <div class="act sel" id="t-go">LAUNCH</div>
        <div class="act" id="t-menu">ABORT</div>
      </div>
    `;
    this.shell.panel
      .querySelector<HTMLElement>("#t-go")!
      .addEventListener("click", () => this.launch());
    this.shell.panel
      .querySelector<HTMLElement>("#t-menu")!
      .addEventListener("click", () => this.game.setState(new MenuState()));
    window.addEventListener("keydown", this.onKey);
  }

  private launch() {
    this.game.sfx.pickup();
    this.game.clearRestart();
    this.game.music.setScene("game");
    this.game.setState(new PlayState());
  }

  private onKey = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") this.launch();
    else if (e.key === "Escape") this.game.setState(new MenuState());
  };

  update() {}

  exit() {
    window.removeEventListener("keydown", this.onKey);
    this.shell.dispose();
  }
}
