/**
 * Re-bindable control map. Actions map to KeyboardEvent.code values and
 * persist to localStorage so the player's layout survives reloads.
 */
export type Action =
  | "thrustFwd"
  | "thrustBack"
  | "strafeLeft"
  | "strafeRight"
  | "up"
  | "down"
  | "boost"
  | "rollLeft"
  | "rollRight"
  | "levelRoll"
  | "recenter"
  | "view"
  | "map"
  | "muteMusic";

export const ACTIONS: Action[] = [
  "thrustFwd",
  "thrustBack",
  "strafeLeft",
  "strafeRight",
  "up",
  "down",
  "boost",
  "rollLeft",
  "rollRight",
  "levelRoll",
  "recenter",
  "view",
  "map",
  "muteMusic",
];

export const ACTION_LABEL: Record<Action, string> = {
  thrustFwd: "THRUST FORWARD",
  thrustBack: "THRUST BACK",
  strafeLeft: "STRAFE LEFT",
  strafeRight: "STRAFE RIGHT",
  up: "ASCEND",
  down: "DESCEND",
  boost: "AFTERBURNER",
  rollLeft: "ROLL LEFT",
  rollRight: "ROLL RIGHT",
  levelRoll: "LEVEL ROLL",
  recenter: "RECENTER ROOM",
  view: "CAMERA VIEW",
  map: "AUTOMAP",
  muteMusic: "MUTE MUSIC",
};

export const DEFAULT_BINDINGS: Record<Action, string> = {
  thrustFwd: "KeyW",
  thrustBack: "KeyS",
  strafeLeft: "KeyA",
  strafeRight: "KeyD",
  up: "Space",
  down: "KeyC",
  boost: "ShiftLeft",
  rollLeft: "KeyQ",
  rollRight: "KeyE",
  levelRoll: "KeyR",
  recenter: "KeyH",
  view: "KeyV",
  map: "KeyM",
  muteMusic: "KeyN",
};

const STORE_KEY = "cf-keymap-v1";

export class Keymap {
  private map: Record<Action, string>;

  constructor() {
    this.map = { ...DEFAULT_BINDINGS };
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Record<Action, string>>;
        for (const a of ACTIONS) {
          if (typeof parsed[a] === "string") this.map[a] = parsed[a]!;
        }
      }
    } catch {
      /* storage unavailable — defaults are fine */
    }
  }

  code(a: Action): string {
    return this.map[a];
  }

  set(a: Action, code: string) {
    // Keep bindings unique: clear any other action that owned this key.
    for (const other of ACTIONS) {
      if (other !== a && this.map[other] === code) {
        this.map[other] = "";
      }
    }
    this.map[a] = code;
    this.save();
  }

  reset() {
    this.map = { ...DEFAULT_BINDINGS };
    this.save();
  }

  private save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(this.map));
    } catch {
      /* ignore */
    }
  }

  /** Human-readable label for a KeyboardEvent.code. */
  static keyLabel(code: string): string {
    if (!code) return "—";
    const letter = code.match(/^Key([A-Z])$/);
    if (letter) return letter[1];
    const digit = code.match(/^Digit(\d)$/);
    if (digit) return digit[1];
    const special: Record<string, string> = {
      Space: "SPACE",
      ShiftLeft: "L-SHIFT",
      ShiftRight: "R-SHIFT",
      ControlLeft: "L-CTRL",
      ControlRight: "R-CTRL",
      AltLeft: "L-ALT",
      AltRight: "R-ALT",
      ArrowUp: "↑",
      ArrowDown: "↓",
      ArrowLeft: "←",
      ArrowRight: "→",
      Enter: "ENTER",
      Tab: "TAB",
      Backspace: "BKSP",
    };
    return special[code] ?? code.toUpperCase();
  }
}
