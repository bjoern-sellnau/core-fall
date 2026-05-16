import "./style.css";
import { Game } from "./engine/Game";
import { MenuState } from "./states/MenuState";
import { initRapier } from "./physics/Physics";

const container = document.querySelector<HTMLDivElement>("#app")!;
container.innerHTML =
  '<div class="menu"><p class="menu__subtitle">LOADING CORE...</p></div>';

// Rapier is WASM and must finish loading before any physics world is created.
await initRapier();

container.innerHTML = "";
const game = new Game(container);
game.setState(new MenuState());
game.start();
