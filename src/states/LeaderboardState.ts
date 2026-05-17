import type { Game } from "../engine/Game";
import type { GameState } from "./GameState";
import { MenuState } from "./MenuState";
import { PILOTS } from "../world/pilots";
import { makeShell, type Shell } from "../ui/titleShell";

const KEY = "corefall.scores";
const DIFF = ["ROOKIE", "PILOT", "ACE", "VETERAN", "INSANE"];

interface Score {
  name: string;
  diff: number;
  date: string;
}

function load(): Score[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/** Hall of fame. `record` adds the current run (used after story end). */
export class LeaderboardState implements GameState {
  private game!: Game;
  private shell!: Shell;

  constructor(private readonly record = false) {}

  enter(game: Game) {
    this.game = game;
    this.game.music.start();
    this.game.sfx.start();
    this.game.music.setScene("menu");
    this.shell = makeShell(game.container);

    let scores = load();
    let mineDate = "";
    if (this.record) {
      const name =
        this.game.pilotName.trim() || PILOTS[this.game.pilotIdx].name;
      mineDate = new Date().toISOString();
      scores.push({ name, diff: this.game.difficulty, date: mineDate });
      try {
        localStorage.setItem(KEY, JSON.stringify(scores.slice(-50)));
      } catch {
        /* storage may be unavailable */
      }
      this.game.sfx.pickup();
    }
    scores = scores
      .sort((a, b) => b.diff - a.diff || (a.date < b.date ? 1 : -1))
      .slice(0, 15);

    const rows = scores
      .map((s, i) => {
        const me = this.record && s.date === mineDate ? " class='me'" : "";
        return `<tr${me}><td>${String(i + 1).padStart(2, "0")}</td><td>${s.name}</td><td>${DIFF[s.diff - 1] || "?"}</td><td>${s.date.slice(0, 10)}</td></tr>`;
      })
      .join("");

    this.shell.panel.innerHTML = `
      <div class="step">${this.record ? "STORY COMPLETE — ALL SHAFTS CLEARED" : "HALL OF FAME"}</div>
      <h2>Leaderboard</h2>
      <table class="lb">
        <thead><tr><th>#</th><th>Pilot</th><th>Threat</th><th>Date</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="4">— NO RECORDS YET —</td></tr>`}</tbody>
      </table>
      <div class="actions">
        <div class="act sel" id="t-back">${this.record ? "CONTINUE" : "MENU"}</div>
      </div>
    `;
    this.shell.panel
      .querySelector<HTMLElement>("#t-back")!
      .addEventListener("click", () => this.leave());
    window.addEventListener("keydown", this.onKey);
  }

  private leave() {
    this.game.sfx.weaponSelect();
    this.game.setState(new MenuState());
  }

  private onKey = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === "Escape") this.leave();
  };

  update() {}

  exit() {
    window.removeEventListener("keydown", this.onKey);
    this.shell.dispose();
  }
}
