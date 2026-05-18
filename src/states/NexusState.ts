import type { Game } from "../engine/Game";
import type { GameState } from "./GameState";
import { MenuState } from "./MenuState";
import { makeShell, type Shell } from "../ui/titleShell";
import { LEVELS } from "../world/levels";
import { ROBOTS } from "../world/robotInfo";
import { WEAPONS } from "../world/weaponInfo";
import { PRIMARY, SECONDARY, type Weapon } from "../world/Weapons";

type Tab = "weapons" | "hostiles" | "story";

/**
 * NEXUS DATABASE — an in-fiction codex of every weapon, hostile rig and
 * the full mission dossier. Gated behind a spoiler acknowledgement.
 */
export class NexusState implements GameState {
  private game!: Game;
  private shell!: Shell;
  private accepted = false;
  private tab: Tab = "weapons";

  enter(game: Game) {
    this.game = game;
    this.game.music.start();
    this.game.sfx.start();
    this.game.music.setScene("menu");
    this.shell = makeShell(game.container);
    this.renderGate();
    window.addEventListener("keydown", this.onKey);
  }

  private renderGate() {
    this.shell.panel.innerHTML = `
      <div class="step">CLASSIFIED ARCHIVE</div>
      <h2>NEXUS DATABASE</h2>
      <div class="brief-txt">⚠  SPOILER WARNING

This archive contains the full intel dossier: every weapon system,
every hostile rig, and the complete mission briefings for all
${LEVELS.length} operations — including locations you have not yet reached.

Proceed only if you do not mind seeing it ahead of time.</div>
      <div class="actions">
        <div class="act sel" id="n-ok">ACCEPT &amp; OPEN</div>
        <div class="act" id="n-back">ABORT</div>
      </div>
    `;
    this.shell.panel.querySelector<HTMLElement>("#n-ok")!.onclick = () => {
      this.accepted = true;
      this.game.sfx.pickup();
      this.renderDb();
    };
    this.shell.panel.querySelector<HTMLElement>("#n-back")!.onclick = () =>
      this.toMenu();
  }

  private weaponType(w: Weapon): string {
    if (w === "chrono") return "GADGET";
    if (w === "vulcan") return "BALLISTIC AMMO";
    if (SECONDARY.includes(w)) return "MISSILE AMMO";
    return "ENERGY";
  }

  private renderDb() {
    const tabBtn = (id: Tab, label: string) =>
      `<div class="codex-tab${this.tab === id ? " sel" : ""}" data-tab="${id}">${label}</div>`;

    let body = "";
    if (this.tab === "weapons") {
      const order: Weapon[] = [...PRIMARY, ...SECONDARY, "chrono"];
      body = order
        .map((w) => {
          const s = WEAPONS[w];
          return `<div class="nx-item">
            <div class="nx-head"><span class="nx-name">${s.label}</span><span class="nx-tag">${this.weaponType(w)}</span></div>
            <div class="nx-desc">${s.desc}</div>
          </div>`;
        })
        .join("");
    } else if (this.tab === "hostiles") {
      body = (Object.keys(ROBOTS) as (keyof typeof ROBOTS)[])
        .map((k) => {
          const r = ROBOTS[k];
          const bar =
            "■".repeat(r.threat) + "·".repeat(Math.max(0, 5 - r.threat));
          return `<div class="nx-item">
            <div class="nx-head"><span class="nx-name">${r.label}</span><span class="nx-tag">THREAT <b>${bar}</b></span></div>
            <div class="nx-desc">${r.role}</div>
          </div>`;
        })
        .join("");
    } else {
      body = LEVELS.map(
        (lv, i) =>
          `<div class="nx-item">
            <div class="nx-head"><span class="nx-name">MISSION ${i + 1} — ${lv.name}</span><span class="nx-tag">TIER ${lv.tier}</span></div>
            <div class="nx-sub">${lv.planet} · ${lv.company}</div>
            <div class="nx-brief">${lv.brief}</div>
          </div>`,
      ).join("");
    }

    this.shell.panel.innerHTML = `
      <div class="step">NEXUS DATA LINK</div>
      <h2>DATABASE</h2>
      <div class="codex-tabs" id="n-tabs" style="margin:18px 0 6px">
        ${tabBtn("weapons", "WEAPONS")}
        ${tabBtn("hostiles", "HOSTILE RIGS")}
        ${tabBtn("story", "MISSION DOSSIER")}
      </div>
      <div class="nx-list">${body}</div>
      <div class="actions">
        <div class="act sel" id="n-back">BACK TO MENU</div>
      </div>
    `;
    this.shell.panel
      .querySelectorAll<HTMLElement>(".codex-tab")
      .forEach((el) =>
        el.addEventListener("click", () => {
          this.tab = el.dataset.tab as Tab;
          this.game.sfx.weaponSelect();
          this.renderDb();
        }),
      );
    this.shell.panel.querySelector<HTMLElement>("#n-back")!.onclick = () =>
      this.toMenu();
  }

  private toMenu() {
    this.game.sfx.weaponSelect();
    this.game.setState(new MenuState());
  }

  private onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      this.toMenu();
      return;
    }
    if (!this.accepted) {
      if (e.key === "Enter" || e.key === " ") {
        this.accepted = true;
        this.game.sfx.pickup();
        this.renderDb();
      }
      return;
    }
    const tabs: Tab[] = ["weapons", "hostiles", "story"];
    const i = tabs.indexOf(this.tab);
    if (e.key === "ArrowRight") {
      this.tab = tabs[(i + 1) % tabs.length];
      this.game.sfx.weaponSelect();
      this.renderDb();
    } else if (e.key === "ArrowLeft") {
      this.tab = tabs[(i - 1 + tabs.length) % tabs.length];
      this.game.sfx.weaponSelect();
      this.renderDb();
    }
  };

  update() {}

  exit() {
    window.removeEventListener("keydown", this.onKey);
    this.shell.dispose();
  }
}
