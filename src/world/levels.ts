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

// --- Generated, guaranteed-connected levels (L2-L4) -----------------
//
// A straight chain along -Z where every box overlaps the next by a
// fixed amount, so doorways always form: spawn -> rooms -> reactor ->
// exit. This avoids the hand-tuned-geometry connectivity bugs.
interface ChainOpts {
  name: string;
  brief: string;
  tier: number;
  segs: number; // corridor+room pairs
  corrW: number;
  corrH: number;
  corrL: number;
  roomW: number;
  roomH: number;
  roomL: number;
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

function chain(o: ChainOpts): LevelDef {
  const O = 4; // overlap between consecutive boxes
  const boxes: BoxTuple[] = [];
  let prevCz = 0;
  let prevLz = 0;
  let first = true;
  const add = (
    w: number,
    h: number,
    lz: number,
    light: number,
    warm = false,
  ): number => {
    const cz = first ? 6 - lz / 2 : prevCz - (prevLz / 2 + lz / 2 - O);
    first = false;
    prevCz = cz;
    prevLz = lz;
    boxes.push([0, 0, cz, w, h, lz, light, warm]);
    return boxes.length - 1;
  };

  add(o.roomW, o.roomH, o.roomL, Math.round(o.tier > 3 ? 0 : 12)); // 0 start
  const rooms: number[] = [];
  for (let i = 0; i < o.segs; i++) {
    add(o.corrW, o.corrH, o.corrL, 6);
    // Every third room is left dark for variety.
    rooms.push(add(o.roomW, o.roomH, o.roomL, i % 3 === 2 ? 0 : 11));
  }
  add(o.corrW, o.corrH, o.corrL, 6); // approach corridor
  const reactorIdx = add(o.roomW + 8, o.roomH + 8, 38, 0, true);
  const exitIdx = add(16, 14, 30, 10);

  const rZ = boxes[reactorIdx][2];
  const rLz = boxes[reactorIdx][5];
  const eZ = boxes[exitIdx][2];

  return {
    name: o.name,
    brief: o.brief,
    tier: o.tier,
    boxes,
    doors: [
      { pos: [0, 0, boxes[1][2]], size: [o.corrW + 2, o.corrH, 1.6], color: "normal" },
      { pos: [0, 0, rZ - rLz / 2], size: [16, 14, 1.8], color: "exit" },
    ],
    factoryIdx: rooms.filter((_, k) => k % 2 === 0),
    pickupIdx: rooms,
    keys: [],
    core: [0, 0, rZ],
    exit: [0, 0, eZ],
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

const L2 = chain({
  name: "GLACIER WORKS",
  brief:
    "The frozen pumping station. Cramped iced-up tunnels, fast\ninterceptor drones. Blow the core and run.",
  tier: 2,
  segs: 5,
  corrW: 9,
  corrH: 8,
  corrL: 24,
  roomW: 24,
  roomH: 16,
  roomL: 26,
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

const L3 = chain({
  name: "THE FOUNDRY",
  brief:
    "Molten core foundry. Long blazing halls crawling with heavy tank\ndrones. Heavy resistance — gear up.",
  tier: 3,
  segs: 7,
  corrW: 11,
  corrH: 11,
  corrL: 28,
  roomW: 34,
  roomH: 22,
  roomL: 32,
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

const L4 = chain({
  name: "THE LABYRINTH",
  brief:
    "The core's last redoubt: a long pitch-black gauntlet swarming\nwith every hostile they have. No mistakes.",
  tier: 4,
  segs: 9,
  corrW: 9,
  corrH: 9,
  corrL: 26,
  roomW: 26,
  roomH: 16,
  roomL: 26,
  wall: 0x2c3a30,
  wallEmissive: 0x0c1a10,
  line: 0x5cff9a,
  lampCool: 0x6effa6,
  lampWarm: 0xc8ff7a,
  ambient: 0x3a5040,
  ambientI: 1.5,
  fog: 0.01,
  fogColor: 0x06120a,
});

export const LEVELS: LevelDef[] = [L1, L2, L3, L4];
