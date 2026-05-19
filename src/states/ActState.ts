import type { Game } from "../engine/Game";
import type { GameState } from "./GameState";
import { BriefingState } from "./BriefingState";
import { MenuState } from "./MenuState";
import { makeShell, type Shell } from "../ui/titleShell";

/** Interstitial between the mine act and the Earth act (after L10). */
export class ActState implements GameState {
  private game!: Game;
  private shell!: Shell;

  enter(game: Game) {
    this.game = game;
    this.game.music.start();
    this.game.sfx.start();
    this.game.music.setScene("victory");
    this.shell = makeShell(game.container);
    this.shell.panel.innerHTML = `
      <div class="step">AKT II</div>
      <h2>ZURÜCK ZUR ERDE</h2>
      <div class="brief-txt">The mine is slag behind you — but the signal already
went out. The rogue swarm has reached home.

Ten more shafts stand between you and the heart of it, and this
time the ground you're fighting over is Earth itself.

Re-enter atmosphere. Finish what they started.</div>
      <div class="actions">
        <div class="act sel" id="a-go">DESCEND TO EARTH</div>
        <div class="act" id="a-menu">ABORT</div>
      </div>
    `;
    this.shell.panel.querySelector<HTMLElement>("#a-go")!.onclick = () =>
      this.go();
    this.shell.panel.querySelector<HTMLElement>("#a-menu")!.onclick = () => {
      this.game.loadout = null;
      this.game.music.setScene("menu");
      this.game.setState(new MenuState());
    };
    window.addEventListener("keydown", this.onKey);
  }

  private go() {
    this.game.sfx.pickup();
    this.game.setState(new BriefingState());
  }

  private onKey = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") this.go();
    else if (e.key === "Escape") {
      this.game.loadout = null;
      this.game.music.setScene("menu");
      this.game.setState(new MenuState());
    }
  };

  update() {}

  exit() {
    window.removeEventListener("keydown", this.onKey);
    this.shell.dispose();
  }
}
