import type { DoorDef } from "./Doors";
import type { Kind } from "./Enemies";
import type { Weapon } from "./Weapons";

export type BoxTuple = [
  number, // cx
  number, // cy
  number, // cz
  number, // sx
  number, // sy
  number, // sz
  number, // light intensity (0 = dark)
  boolean?, // warm tint
];

export interface LevelDef {
  name: string;
  brief: string;
  tier: number; // enemy strength/variety tier (1..4)
  kinds: Kind[]; // roster of robot types present in this level
  tex: string; // wall texture style
  planet: string;
  company: string;
  weapon: Weapon; // weapon this level grants
  boxes: BoxTuple[];
  doors: DoorDef[];
  factoryIdx: number[];
  pickupIdx: number[];
  energyIdx: number[]; // room boxes that recharge weapon energy
  keys: { idx: number; kind: string }[];
  core: [number, number, number];
  exit: [number, number, number];
  spawn: [number, number, number];
  wall: number;
  wallEmissive: number;
  line: number;
  lampCool: number;
  lampWarm: number;
  ambient: number;
  ambientI: number;
  fog: number;
  fogColor: number;
}

// --- Level 1: the original hand-built mine ---
const L1: LevelDef = {
  name: "THE MINE",
  brief:
    "Infiltrate the abandoned mine. Find the access keys, destroy the\nreactor core, then reach the emergency exit before it blows.",
  tier: 1,
  kinds: ["dasher", "shooter"],
  tex: "panel",
  planet: "KORATH IV",
  company: "NEXUS MINING CO.",
  weapon: "vulcan",
  boxes: [
    [0, 0, -8, 26, 16, 28, 14],
    [0, 0, -32, 9, 8, 26, 7],
    [0, 0, -58, 30, 18, 30, 16],
    [0, 0, -88, 9, 9, 32, 7],
    [0, 0, -118, 34, 18, 32, 18],
    [24, 0, -118, 30, 8, 9, 7],
    [46, 0, -118, 22, 16, 24, 14, true],
    [0, -6, -153, 9, 9, 42, 7],
    [0, -6, -188, 34, 18, 32, 0],
    [0, -6, -216, 9, 9, 28, 5],
    [0, -10, -244, 32, 16, 30, 14],
    [0, -18, -274, 10, 9, 34, 6],
    [0, -22, -310, 40, 16, 40, 0],
    [0, -22, -342, 10, 10, 28, 6],
    [0, -18, -370, 30, 18, 30, 15],
    [0, -12, -400, 10, 10, 36, 6],
    [-24, 0, -118, 30, 8, 9, 7],
    [-46, 0, -118, 22, 16, 24, 14, true],
    [0, -10, -430, 30, 18, 30, 14],
    [0, -8, -450, 10, 12, 24, 6],
    [0, -6, -470, 48, 32, 48, 0, true],
    [0, 18, -118, 14, 22, 14, 9],
    [-26, -10, -244, 24, 16, 20, 12],
    [28, -22, -310, 22, 16, 20, 0],
    [0, -6, -508, 22, 18, 40, 12],
    [-28, -22, -310, 22, 16, 9, 7],
    [-48, -22, -310, 24, 16, 22, 12],
    [0, 16, -370, 14, 24, 14, 9],
    [20, -10, -430, 26, 16, 22, 13],
    [24, 0, -58, 28, 9, 9, 7],
    [46, 0, -58, 22, 16, 22, 12],
    [0, 12, -188, 14, 20, 14, 8],
  ],
  doors: [
    { pos: [0, 0, -26], size: [11, 10, 1.6], color: "normal" },
    { pos: [0, 0, -80], size: [11, 11, 1.6], color: "blue" },
    { pos: [0, -6, -210], size: [11, 11, 1.6], color: "yellow" },
    { pos: [0, -22, -330], size: [12, 12, 1.8], color: "red" },
    { pos: [0, -8, -450], size: [12, 14, 1.6], color: "normal" },
    { pos: [0, -6, -494], size: [22, 18, 1.8], color: "exit" },
  ],
  factoryIdx: [2, 6, 10, 14, 17],
  pickupIdx: [1, 3, 5, 11, 13, 15, 18, 21, 22, 23, 26, 27, 28, 30, 31],
  energyIdx: [2, 4, 8, 10, 14, 18],
  keys: [
    { idx: 2, kind: "keyblue" },
    { idx: 8, kind: "keyyellow" },
    { idx: 12, kind: "keyred" },
  ],
  core: [0, -6, -470],
  exit: [0, -6, -508],
  spawn: [0, 0, 2],
  wall: 0x36475a,
  wallEmissive: 0x16242f,
  line: 0x3a7f9c,
  lampCool: 0x8fe8ff,
  lampWarm: 0xffb060,
  ambient: 0x6f86a0,
  ambientI: 2.1,
  fog: 0.0075,
  fogColor: 0x0a141e,
};

// --- Procedural generator: a turning/branching chain where every box
// provably overlaps the previous one, so doorways always form and the
// path spawn -> ... -> reactor -> exit is guaranteed connected. ---
type Dir = "F" | "B" | "L" | "R" | "U" | "D";
const DV: Record<Dir, [number, number, number]> = {
  F: [0, 0, -1],
  B: [0, 0, 1],
  L: [-1, 0, 0],
  R: [1, 0, 0],
  U: [0, 1, 0],
  D: [0, -1, 0],
};

interface GenOpts {
  name: string;
  brief: string;
  tier: number;
  kinds: Kind[];
  tex: string;
  planet: string;
  company: string;
  weapon: Weapon;
  script: string; // sequence of F/B/L/R/U/D moves
  corrLen: number;
  corrCross: number;
  roomLen: number;
  roomCross: number;
  darkStart?: boolean;
  wall: number;
  wallEmissive: number;
  line: number;
  lampCool: number;
  lampWarm: number;
  ambient: number;
  ambientI: number;
  fog: number;
  fogColor: number;
}

function gen(o: GenOpts): LevelDef {
  const O = 4;
  const boxes: BoxTuple[] = [];
  const c: [number, number, number] = [0, 0, 6 - o.roomLen / 2];
  const s: [number, number, number] = [o.roomCross, o.roomCross, o.roomLen];
  boxes.push([c[0], c[1], c[2], s[0], s[1], s[2], o.darkStart ? 0 : 12]);

  const place = (
    dir: Dir,
    along: number,
    cross: number,
    light: number,
    warm = false,
  ): number => {
    const [dx, dy, dz] = DV[dir];
    const ax = dx ? 0 : dy ? 1 : 2;
    const sign = dx || dy || dz;
    const ns: [number, number, number] = [cross, cross, cross];
    ns[ax] = along;
    const nc: [number, number, number] = [c[0], c[1], c[2]];
    nc[ax] = c[ax] + sign * (s[ax] / 2 + ns[ax] / 2 - O);
    boxes.push([nc[0], nc[1], nc[2], ns[0], ns[1], ns[2], light, warm]);
    c[0] = nc[0];
    c[1] = nc[1];
    c[2] = nc[2];
    s[0] = ns[0];
    s[1] = ns[1];
    s[2] = ns[2];
    return boxes.length - 1;
  };

  const rooms: number[] = [];
  let n = 0;
  for (const ch of o.script) {
    const dir = ch as Dir;
    place(dir, o.corrLen, o.corrCross, 6);
    rooms.push(place(dir, o.roomLen, o.roomCross, n % 3 === 2 ? 0 : 11));
    n++;
  }
  // Finale always runs forward into the reactor + exit chamber.
  place("F", o.corrLen, o.corrCross, 6);
  const rCross = Math.max(o.roomCross + 10, 30);
  const reactorIdx = place("F", 40, rCross, 0, true);
  const exitIdx = place("F", 30, 18, 10);

  const rb = boxes[reactorIdx];
  const eb = boxes[exitIdx];
  const door1 = boxes[1];

  return {
    name: o.name,
    brief: o.brief,
    tier: o.tier,
    kinds: o.kinds,
    tex: o.tex,
    planet: o.planet,
    company: o.company,
    weapon: o.weapon,
    boxes,
    doors: [
      {
        pos: [door1[0], door1[1], door1[2]],
        size: [o.corrCross + 2, o.corrCross, 1.6],
        color: "normal",
      },
      {
        pos: [rb[0], rb[1], rb[2] - rb[5] / 2],
        size: [16, 14, 1.8],
        color: "exit",
      },
    ],
    factoryIdx: rooms.filter((_, k) => k % 2 === 0),
    pickupIdx: rooms,
    energyIdx: rooms.filter((_, k) => k % 2 === 1),
    keys: [],
    core: [rb[0], rb[1], rb[2]],
    exit: [eb[0], eb[1], eb[2]],
    spawn: [0, 0, 3],
    wall: o.wall,
    wallEmissive: o.wallEmissive,
    line: o.line,
    lampCool: o.lampCool,
    lampWarm: o.lampWarm,
    ambient: o.ambient,
    ambientI: o.ambientI,
    fog: o.fog,
    fogColor: o.fogColor,
  };
}

const L2 = gen({
  name: "GLACIER WORKS",
  planet: "HOTH-9",
  weapon: "superlaser",
  company: "CRYOCORP INDUSTRIES",
  brief:
    "The frozen pumping station: cramped iced-up tunnels that zig-zag\nthrough the rock. Fast interceptor drones. Blow the core and run.",
  tier: 2,
  kinds: ["dasher", "shooter", "interceptor"],
  tex: "tile",
  script: "FRFLFRFLF",
  corrLen: 24,
  corrCross: 9,
  roomLen: 22,
  roomCross: 22,
  wall: 0x2f4a5e,
  wallEmissive: 0x12303a,
  line: 0x7fdfff,
  lampCool: 0xbfeaff,
  lampWarm: 0x9fd0ff,
  ambient: 0x6f9ab0,
  ambientI: 2.3,
  fog: 0.012,
  fogColor: 0x0c2630,
});

const L3 = gen({
  name: "THE FOUNDRY",
  planet: "VULCAN'S ANVIL",
  weapon: "plasma",
  company: "MOLTEN DYNAMICS",
  brief:
    "Molten-core foundry. Cavernous blazing halls, few turns, heavy\ntank drones holding every chamber. Bring firepower.",
  tier: 3,
  kinds: ["dasher", "shooter", "tank"],
  tex: "rock",
  script: "FFRFFLFF",
  corrLen: 30,
  corrCross: 13,
  roomLen: 38,
  roomCross: 40,
  wall: 0x52382a,
  wallEmissive: 0x361608,
  line: 0xff9a4a,
  lampCool: 0xffc070,
  lampWarm: 0xff7a2a,
  ambient: 0x8a6048,
  ambientI: 2.0,
  fog: 0.006,
  fogColor: 0x140804,
});

const L4 = gen({
  name: "THE LABYRINTH",
  planet: "EREBUS",
  weapon: "rockets",
  company: "BLACKVEIN GUILD",
  brief:
    "A pitch-black maze of switchbacks. Every hostile they have, in\nthe dark. Watch your corners.",
  tier: 4,
  kinds: ["dasher", "interceptor", "spinner", "shooter"],
  tex: "circuit",
  script: "FRFRFLFLFRF",
  corrLen: 24,
  corrCross: 9,
  roomLen: 22,
  roomCross: 24,
  darkStart: true,
  wall: 0x2c3a30,
  wallEmissive: 0x0c1a10,
  line: 0x5cff9a,
  lampCool: 0x6effa6,
  lampWarm: 0xc8ff7a,
  ambient: 0x3a5040,
  ambientI: 1.5,
  fog: 0.011,
  fogColor: 0x06120a,
});

const L5 = gen({
  name: "THE SPIRE",
  planet: "ASCENSION",
  weapon: "fusion",
  company: "ORBITAL LIFT INC.",
  brief:
    "A vertical ascent through a collapsed elevator core. Climb shaft\nafter shaft to the reactor at the summit.",
  tier: 2,
  kinds: ["dasher", "shooter", "sniper"],
  tex: "hex",
  script: "FUFUFUFU",
  corrLen: 26,
  corrCross: 10,
  roomLen: 22,
  roomCross: 24,
  wall: 0x3a3550,
  wallEmissive: 0x161030,
  line: 0xb78cff,
  lampCool: 0xc8b0ff,
  lampWarm: 0xff9ad0,
  ambient: 0x6a5e8a,
  ambientI: 2.1,
  fog: 0.008,
  fogColor: 0x100a1e,
});

const L6 = gen({
  name: "DEEP SHAFT",
  planet: "MARROW",
  weapon: "laser",
  company: "DEEPCORE LTD.",
  brief:
    "Plunge into the drowned lower works — a descending spiral of\ndripping conduits. It only goes down.",
  tier: 3,
  kinds: ["shooter", "tank", "bomber"],
  tex: "rock",
  script: "FDFDRFDFD",
  corrLen: 26,
  corrCross: 10,
  roomLen: 22,
  roomCross: 26,
  wall: 0x24424a,
  wallEmissive: 0x0a2228,
  line: 0x48d8d0,
  lampCool: 0x7ff0e6,
  lampWarm: 0x9fe0c0,
  ambient: 0x4f8088,
  ambientI: 1.9,
  fog: 0.012,
  fogColor: 0x06181c,
});

const L7 = gen({
  name: "THE SPRAWL",
  planet: "TANTALUS",
  weapon: "laser",
  company: "GRID INDUSTRIES",
  brief:
    "A sprawling industrial grid that staircases sideways forever.\nLong sight-lines, relentless turret fire.",
  tier: 3,
  kinds: ["shooter", "sniper", "interceptor", "tank"],
  tex: "panel",
  script: "FRFRFRFRFRF",
  corrLen: 30,
  corrCross: 11,
  roomLen: 24,
  roomCross: 26,
  wall: 0x47402c,
  wallEmissive: 0x1c1808,
  line: 0xe8d24a,
  lampCool: 0xfff0a0,
  lampWarm: 0xffcf60,
  ambient: 0x7a7048,
  ambientI: 2.0,
  fog: 0.0075,
  fogColor: 0x121006,
});

const L8 = gen({
  name: "CRYO VAULT",
  planet: "NIVEN",
  weapon: "laser",
  company: "CRYOCORP INDUSTRIES",
  brief:
    "A heaving cryo vault that pitches up and down between freezer\nbays. Stay level, stay alive.",
  tier: 4,
  kinds: ["dasher", "spinner", "sniper", "tank"],
  tex: "tile",
  script: "FUFDFUFDFU",
  corrLen: 24,
  corrCross: 10,
  roomLen: 22,
  roomCross: 24,
  wall: 0x33506a,
  wallEmissive: 0x10283a,
  line: 0x9fd8ff,
  lampCool: 0xd0ecff,
  lampWarm: 0xbfe0ff,
  ambient: 0x6f96b4,
  ambientI: 2.0,
  fog: 0.011,
  fogColor: 0x0a1c2a,
});

const L9 = gen({
  name: "THE GAUNTLET",
  planet: "STYX",
  weapon: "laser",
  company: "IRONCLAD PMC",
  brief:
    "No cover, no rest — a brutally long straight run packed end to\nend with the worst they can throw at you.",
  tier: 4,
  kinds: ["interceptor", "spinner", "tank", "bomber", "shooter"],
  tex: "circuit",
  script: "FFFFFFFFFFFF",
  corrLen: 30,
  corrCross: 10,
  roomLen: 20,
  roomCross: 22,
  darkStart: true,
  wall: 0x42282c,
  wallEmissive: 0x200a0e,
  line: 0xff6a7a,
  lampCool: 0xffb0bc,
  lampWarm: 0xff8a6a,
  ambient: 0x7a4a52,
  ambientI: 1.7,
  fog: 0.0085,
  fogColor: 0x140609,
});

const L10 = gen({
  name: "CORE NEXUS",
  planet: "THE CORE",
  weapon: "laser",
  company: "NEXUS MINING CO.",
  brief:
    "The final descent: a twisting three-dimensional nexus folding\nthrough every axis to the heart of the station.",
  tier: 4,
  kinds: [
    "dasher",
    "shooter",
    "interceptor",
    "tank",
    "spinner",
    "sniper",
    "bomber",
  ],
  tex: "hex",
  script: "FRFUFLFDFRFUF",
  corrLen: 26,
  corrCross: 11,
  roomLen: 24,
  roomCross: 28,
  darkStart: true,
  wall: 0x3a2c4a,
  wallEmissive: 0x140a22,
  line: 0xc070ff,
  lampCool: 0xd8a0ff,
  lampWarm: 0xff7ad0,
  ambient: 0x5a4a78,
  ambientI: 1.8,
  fog: 0.009,
  fogColor: 0x0c0618,
});

export const ROBOT_LABEL: Record<Kind, string> = {
  dasher: "RIPPER",
  shooter: "GUNRIG",
  interceptor: "WASP",
  tank: "BULWARK",
  spinner: "WHIRL",
  sniper: "LANCE",
  bomber: "DETONATOR",
};

export const LEVELS: LevelDef[] = [
  L1,
  L2,
  L3,
  L4,
  L5,
  L6,
  L7,
  L8,
  L9,
  L10,
];
