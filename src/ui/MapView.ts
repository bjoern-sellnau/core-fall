import type { DoorDef } from "../world/Doors";

interface Rect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}
interface Keys {
  blue: boolean;
  red: boolean;
  yellow: boolean;
}

const DOOR_CSS: Record<string, string> = {
  normal: "#9fb0bd",
  blue: "#3a7bff",
  red: "#ff3a3a",
  yellow: "#ffd23a",
};

/** Top-down automap overlay (toggled with M). World XZ → canvas. */
export class MapView {
  private el: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private shown = false;

  constructor(container: HTMLElement) {
    this.el = document.createElement("div");
    this.el.className = "hud__map hidden";
    this.canvas = document.createElement("canvas");
    this.el.appendChild(this.canvas);
    container.appendChild(this.el);
    this.ctx = this.canvas.getContext("2d")!;
  }

  get visible() {
    return this.shown;
  }

  toggle() {
    this.shown = !this.shown;
    this.el.classList.toggle("hidden", !this.shown);
  }

  remove() {
    this.el.remove();
  }

  render(
    boxes: Rect[],
    doors: DoorDef[],
    core: { x: number; z: number },
    player: { x: number; z: number },
    headingXZ: { x: number; z: number },
    keys: Keys,
  ) {
    if (!this.shown) return;
    const w = (this.canvas.width = window.innerWidth);
    const h = (this.canvas.height = window.innerHeight);
    const g = this.ctx;
    g.clearRect(0, 0, w, h);

    // World bounds.
    let minX = Infinity,
      maxX = -Infinity,
      minZ = Infinity,
      maxZ = -Infinity;
    for (const b of boxes) {
      minX = Math.min(minX, b.x0);
      maxX = Math.max(maxX, b.x1);
      minZ = Math.min(minZ, b.z0);
      maxZ = Math.max(maxZ, b.z1);
    }
    const pad = 70;
    const sx = (w - pad * 2) / (maxX - minX || 1);
    const sz = (h - pad * 2) / (maxZ - minZ || 1);
    const s = Math.min(sx, sz);
    const ox = (w - (maxX - minX) * s) / 2;
    const oz = (h - (maxZ - minZ) * s) / 2;
    const px = (x: number) => ox + (x - minX) * s;
    const pz = (z: number) => oz + (z - minZ) * s;

    g.fillStyle = "rgba(4,8,12,0.92)";
    g.fillRect(0, 0, w, h);

    g.font = "700 22px Courier New, monospace";
    g.fillStyle = "#38f0e6";
    g.fillText("COREFALL // MAP", pad, pad - 24);

    // Sectors.
    g.lineWidth = 2;
    for (const b of boxes) {
      const x = px(b.x0),
        y = pz(b.z0),
        bw = (b.x1 - b.x0) * s,
        bh = (b.z1 - b.z0) * s;
      g.fillStyle = "rgba(56,240,230,0.06)";
      g.strokeStyle = "rgba(90,170,200,0.7)";
      g.fillRect(x, y, bw, bh);
      g.strokeRect(x, y, bw, bh);
    }

    // Doors.
    for (const d of doors) {
      g.fillStyle = DOOR_CSS[d.color] ?? "#fff";
      const dx = px(d.pos[0]);
      const dy = pz(d.pos[2]);
      g.fillRect(dx - 5, dy - 5, 10, 10);
    }

    // Core.
    g.fillStyle = "#ff8a2a";
    g.beginPath();
    const cx = px(core.x),
      cy = pz(core.z);
    g.moveTo(cx, cy - 8);
    g.lineTo(cx + 8, cy);
    g.lineTo(cx, cy + 8);
    g.lineTo(cx - 8, cy);
    g.closePath();
    g.fill();

    // Player arrow.
    const pxp = px(player.x),
      pyp = pz(player.z);
    const a = Math.atan2(headingXZ.z, headingXZ.x);
    g.save();
    g.translate(pxp, pyp);
    g.rotate(a);
    g.fillStyle = "#7cff6a";
    g.beginPath();
    g.moveTo(11, 0);
    g.lineTo(-7, 7);
    g.lineTo(-7, -7);
    g.closePath();
    g.fill();
    g.restore();

    // Legend.
    g.font = "600 15px Courier New, monospace";
    const legend = (lbl: string, on: boolean, c: string, i: number) => {
      g.fillStyle = on ? c : "#3a4650";
      g.fillText(lbl, pad + i * 130, h - pad + 30);
    };
    legend("BLUE KEY", keys.blue, "#3a7bff", 0);
    legend("RED KEY", keys.red, "#ff3a3a", 1);
    legend("YELLOW KEY", keys.yellow, "#ffd23a", 2);
    g.fillStyle = "#7fa8c4";
    g.fillText("M: CLOSE", w - pad - 110, h - pad + 30);
  }
}
