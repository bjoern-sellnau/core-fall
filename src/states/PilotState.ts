import type { Game } from "../engine/Game";
import type { GameState } from "./GameState";
import { DifficultyState } from "./DifficultyState";
import { MenuState } from "./MenuState";
import { PILOTS } from "../world/pilots";
import { makeShell, type Shell } from "../ui/titleShell";

/** Story step 1: enter callsign + pick one of 18 pilots. */
export class PilotState implements GameState {
  private game!: Game;
  private shell!: Shell;
  private input!: HTMLInputElement;
  private cells: HTMLElement[] = [];

  enter(game: Game) {
    this.game = game;
    this.game.loadout = null; // fresh story run
    this.game.music.start();
    this.game.sfx.start();
    this.game.music.setScene("menu");
    this.shell = makeShell(game.container);

    this.shell.panel.innerHTML = `
      <div class="step">STORY · STEP 1 / 2</div>
      <h2>Pilot Registration</h2>
      <div class="field">Operator Callsign</div>
      <input class="cf-input" id="t-name" maxlength="16" autocomplete="off"
        placeholder="ENTER NAME" />
      <div class="field">Select Pilot</div>
      <div class="pilot-grid">
        ${PILOTS.map(
          (p, i) =>
            `<div class="pilot ${p.sex === "M" ? "male" : "female"}" data-i="${i}">
               <div class="av"></div>
               <div class="nm">${p.name}</div>
               <div class="sx">${p.sex === "M" ? "MALE" : "FEMALE"}</div>
             </div>`,
        ).join("")}
      </div>
      <div class="actions">
        <div class="act sel" id="t-next">WEITER</div>
        <div class="act" id="t-back">MENU</div>
      </div>
    `;

    this.input = this.shell.panel.querySelector<HTMLInputElement>("#t-name")!;
    this.input.value = this.game.pilotName;
    this.input.addEventListener("input", () => {
      this.game.pilotName = this.input.value;
    });

    this.cells = [
      ...this.shell.panel.querySelectorAll<HTMLElement>(".pilot"),
    ];
    this.cells.forEach((c, i) =>
      c.addEventListener("click", () => this.pick(i)),
    );
    this.pick(this.game.pilotIdx);

    this.shell.panel
      .querySelector<HTMLElement>("#t-next")!
      .addEventListener("click", () => this.next());
    this.shell.panel
      .querySelector<HTMLElement>("#t-back")!
      .addEventListener("click", () => this.game.setState(new MenuState()));

    window.addEventListener("keydown", this.onKey);
    setTimeout(() => this.input.focus(), 50);
  }

  private pick(i: number) {
    this.game.pilotIdx = i;
    this.cells.forEach((c, idx) => c.classList.toggle("sel", idx === i));
    this.game.sfx.weaponSelect();
  }

  private next() {
    if (!this.game.pilotName.trim()) {
      this.game.pilotName = PILOTS[this.game.pilotIdx].name;
    }
    this.game.sfx.pickup();
    this.game.setState(new DifficultyState());
  }

  private onKey = (e: KeyboardEvent) => {
    if (e.key === "Enter" && document.activeElement !== this.input) {
      this.next();
    } else if (e.key === "Enter") {
      this.next();
    } else if (e.key === "Escape") {
      this.game.setState(new MenuState());
    }
  };

  update() {}

  exit() {
    window.removeEventListener("keydown", this.onKey);
    this.shell.dispose();
  }
}
