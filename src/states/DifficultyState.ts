import type { Game } from "../engine/Game";
import type { GameState } from "./GameState";
import { MenuState } from "./MenuState";
import { PlayState } from "./PlayState";
import { BriefingState } from "./BriefingState";
import { makeShell, type Shell } from "../ui/titleShell";

const DIFF = [
  ["ROOKIE", "Light resistance. Learn the ropes."],
  ["PILOT", "Standard mining hazard."],
  ["ACE", "Aggressive rigs, faster factories."],
  ["VETERAN", "Heavy swarms. No mercy."],
  ["INSANE", "Everything, all at once."],
];

/** Difficulty select — used by Story (step 2) and before each Mission. */
export class DifficultyState implements GameState {
  private game!: Game;
  private shell!: Shell;
  private rows: HTMLElement[] = [];
  private sel = 0;

  enter(game: Game) {
    this.game = game;
    this.game.music.start();
    this.game.sfx.start();
    this.game.music.setScene("menu");
    this.sel = game.difficulty - 1;
    this.shell = makeShell(game.container);

    const story = game.mode === "story";
    this.shell.panel.innerHTML = `
      <div class="step">${story ? "STORY · STEP 2 / 2" : "MISSION SETUP"}</div>
      <h2>Threat Level</h2>
      <ul class="opts">
        ${DIFF.map(
          ([n, d], i) =>
            `<li data-i="${i}"><span class="label">${i + 1} ${n}</span><span class="hint">${d}</span></li>`,
        ).join("")}
      </ul>
      <div class="actions">
        <div class="act sel" id="t-next">WEITER</div>
        <div class="act" id="t-back">MENU</div>
      </div>
    `;
    this.rows = [...this.shell.panel.querySelectorAll<HTMLElement>(".opts li")];
    this.rows.forEach((r, i) => {
      r.addEventListener("mouseenter", () => this.set(i));
      r.addEventListener("click", () => {
        this.set(i);
        this.next();
      });
    });
    this.set(this.sel);
    this.shell.panel
      .querySelector<HTMLElement>("#t-next")!
      .addEventListener("click", () => this.next());
    this.shell.panel
      .querySelector<HTMLElement>("#t-back")!
      .addEventListener("click", () => this.back());
    window.addEventListener("keydown", this.onKey);
  }

  private set(i: number) {
    this.sel = (i + this.rows.length) % this.rows.length;
    this.game.difficulty = this.sel + 1;
    this.rows.forEach((r, idx) => r.classList.toggle("sel", idx === this.sel));
    this.game.sfx.weaponSelect();
  }

  private next() {
    this.game.sfx.pickup();
    if (this.game.mode === "story") {
      this.game.setState(new BriefingState());
    } else {
      this.game.clearRestart();
      this.game.music.setScene("game");
      this.game.setState(new PlayState());
    }
  }

  private back() {
    if (this.game.mode === "story") {
      this.game.setState(new MenuState());
    } else {
      this.game.setState(new MenuState());
    }
  }

  private onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown") this.set(this.sel + 1);
    else if (e.key === "ArrowUp") this.set(this.sel - 1);
    else if (e.key === "Enter") this.next();
    else if (e.key === "Escape") this.back();
  };

  update() {}

  exit() {
    window.removeEventListener("keydown", this.onKey);
    this.shell.dispose();
  }
}
