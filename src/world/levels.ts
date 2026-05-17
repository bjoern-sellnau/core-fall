import type { DoorDef } from "./Doors";

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
  boxes: BoxTuple[];
  doors: DoorDef[];
  factoryIdx: number[];
  pickupIdx: number[];
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

// --- Level 1: the original mine ---
const L1: LevelDef = {
  name: "THE MINE",
  brief:
    "Infiltrate the abandoned mine. Find the access keys, destroy the\nreactor core, then reach the emergency exit before it blows.",
  tier: 1,
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

// --- Level 2: tight icy tunnels ---
const L2: LevelDef = {
  name: "GLACIER WORKS",
  brief:
    "The frozen pumping station. Cramped iced-up tunnels, fast\ninterceptor drones. Blow the core and run.",
  tier: 2,
  boxes: [
    [0, 0, -8, 18, 12, 22, 12], // 0 start
    [0, 0, -28, 7, 7, 22, 6], // 1
    [10, 0, -48, 24, 7, 7, 6], // 2 bend +X
    [22, 0, -64, 7, 7, 28, 6], // 3
    [22, 6, -86, 7, 16, 9, 7], // 4 up
    [22, 12, -104, 7, 7, 26, 6], // 5
    [10, 12, -124, 24, 7, 7, 6], // 6 bend -X
    [0, 12, -146, 16, 14, 22, 10], // 7 room
    [0, 12, -170, 7, 7, 26, 6], // 8
    [0, 4, -192, 7, 16, 9, 6], // 9 down
    [0, -2, -214, 7, 7, 28, 6], // 10
    [0, -2, -244, 30, 22, 34, 0, true], // 11 reactor room
    [0, -2, -278, 16, 14, 26, 10], // 12 exit chamber
    [-12, 0, -48, 22, 7, 7, 6], // 13 dead-end branch (off 1/2)
  ],
  doors: [
    { pos: [0, 0, -20], size: [9, 9, 1.6], color: "normal" },
    { pos: [0, 12, -160], size: [9, 9, 1.6], color: "blue" },
    { pos: [0, -2, -262], size: [16, 14, 1.8], color: "exit" },
  ],
  factoryIdx: [7, 11],
  pickupIdx: [2, 5, 7, 9, 13],
  keys: [{ idx: 7, kind: "keyblue" }],
  core: [0, -2, -244],
  exit: [0, -2, -278],
  spawn: [0, 0, 2],
  wall: 0x2f4a5e,
  wallEmissive: 0x12303a,
  line: 0x7fdfff,
  lampCool: 0xbfeaff,
  lampWarm: 0x9fd0ff,
  ambient: 0x6f9ab0,
  ambientI: 2.3,
  fog: 0.013,
  fogColor: 0x0c2630,
};

// --- Level 3: the foundry, big vertical caverns ---
const L3: LevelDef = {
  name: "THE FOUNDRY",
  brief:
    "Molten core foundry. Vast vertical chambers crawling with heavy\ntank drones. Heavy resistance — gear up.",
  tier: 3,
  boxes: [
    [0, 0, -10, 30, 20, 30, 14, true], // 0 start hall
    [0, 0, -40, 10, 10, 26, 7], // 1
    [0, -14, -66, 12, 30, 12, 7], // 2 big drop shaft
    [0, -28, -92, 10, 10, 26, 7], // 3
    [0, -28, -126, 44, 26, 44, 10, true], // 4 huge cavern
    [0, -16, -160, 10, 30, 12, 7], // 5 up shaft
    [0, -4, -188, 10, 10, 26, 6], // 6
    [22, -4, -208, 26, 10, 10, 6], // 7 +X branch
    [40, -4, -208, 20, 16, 20, 12, true], // 8 branch room
    [0, -4, -224, 38, 28, 40, 0, true], // 9 reactor cavern (dark/glow)
    [0, -4, -258, 12, 12, 26, 8], // 10 exit chamber
  ],
  doors: [
    { pos: [0, 0, -30], size: [12, 12, 1.6], color: "normal" },
    { pos: [0, -28, -110], size: [12, 12, 1.8], color: "yellow" },
    { pos: [0, -4, -242], size: [12, 12, 1.8], color: "exit" },
  ],
  factoryIdx: [0, 4, 8],
  pickupIdx: [1, 3, 5, 7, 8],
  keys: [{ idx: 4, kind: "keyyellow" }],
  core: [0, -4, -224],
  exit: [0, -4, -258],
  spawn: [0, 0, 4],
  wall: 0x52382a,
  wallEmissive: 0x361608,
  line: 0xff9a4a,
  lampCool: 0xffc070,
  lampWarm: 0xff7a2a,
  ambient: 0x8a6048,
  ambientI: 2.0,
  fog: 0.006,
  fogColor: 0x140804,
};

// --- Level 4: the labyrinth, dark and deadly ---
const L4: LevelDef = {
  name: "THE LABYRINTH",
  brief:
    "The core's last redoubt: a pitch-black maze swarming with every\nhostile they have. No mistakes. Get in, kill it, get out.",
  tier: 4,
  boxes: [
    [0, 0, -10, 20, 14, 24, 9], // 0 start
    [0, 0, -34, 8, 8, 26, 4], // 1
    [0, 0, -58, 26, 14, 26, 0], // 2 dark room
    [14, 0, -58, 26, 8, 8, 4], // 3 +X corr
    [34, 0, -58, 20, 14, 20, 7], // 4 room
    [34, 0, -82, 8, 8, 26, 4], // 5
    [34, 0, -108, 24, 14, 24, 0], // 6 dark room
    [0, 0, -82, 8, 8, 30, 4], // 7 -from 2 deeper
    [0, 0, -110, 24, 16, 24, 6], // 8 room
    [0, 0, -136, 8, 8, 26, 4], // 9
    [0, 0, -162, 30, 18, 30, 0, true], // 10 reactor room (dark)
    [0, 0, -190, 12, 12, 24, 8], // 11 exit chamber
    [-14, 0, -110, 26, 8, 8, 4], // 12 -X corr (off 8)
    [-34, 0, -110, 20, 14, 20, 0], // 13 dark dead-end
  ],
  doors: [
    { pos: [0, 0, -26], size: [10, 10, 1.6], color: "normal" },
    { pos: [0, 0, -73], size: [10, 10, 1.6], color: "blue" },
    { pos: [0, 0, -150], size: [10, 10, 1.8], color: "red" },
    { pos: [0, 0, -178], size: [12, 12, 1.8], color: "exit" },
  ],
  factoryIdx: [2, 6, 8, 13],
  pickupIdx: [1, 4, 5, 7, 9, 12],
  keys: [
    { idx: 4, kind: "keyblue" },
    { idx: 8, kind: "keyred" },
  ],
  core: [0, 0, -162],
  exit: [0, 0, -190],
  spawn: [0, 0, 0],
  wall: 0x2c3a30,
  wallEmissive: 0x0c1a10,
  line: 0x5cff9a,
  lampCool: 0x6effa6,
  lampWarm: 0xc8ff7a,
  ambient: 0x3a5040,
  ambientI: 1.5,
  fog: 0.011,
  fogColor: 0x06120a,
};

export const LEVELS: LevelDef[] = [L1, L2, L3, L4];
