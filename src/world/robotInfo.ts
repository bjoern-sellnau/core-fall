import * as THREE from "three";
import type { Kind } from "./Enemies";

interface RobotSpec {
  label: string;
  role: string;
  threat: number; // 1..5
  body: number;
  emissive: number;
  make: () => THREE.BufferGeometry;
}

// Shapes & colours mirror the in-game enemies (see Enemies.ts).
export const ROBOTS: Record<Kind, RobotSpec> = {
  dasher: {
    label: "RIPPER",
    role: "Melee charger. Closes fast and lunges at point-blank.",
    threat: 2,
    body: 0x223040,
    emissive: 0xff3344,
    make: () => new THREE.OctahedronGeometry(1.7, 0),
  },
  shooter: {
    label: "GUNRIG",
    role: "Ranged plasma turret. Holds position and fires.",
    threat: 2,
    body: 0x2a2440,
    emissive: 0xaa55ff,
    make: () => new THREE.IcosahedronGeometry(1.8, 0),
  },
  interceptor: {
    label: "WASP",
    role: "Fast and fragile. Relentless aggressive lunges.",
    threat: 3,
    body: 0x203840,
    emissive: 0x33ffd0,
    make: () => new THREE.TetrahedronGeometry(1.7),
  },
  tank: {
    label: "BULWARK",
    role: "Heavily armoured. Slow, twin-cannon bombardment.",
    threat: 4,
    body: 0x402020,
    emissive: 0xff7a22,
    make: () => new THREE.BoxGeometry(3.2, 3.2, 3.2),
  },
  spinner: {
    label: "WHIRL",
    role: "Erratic high-speed harasser. Hard to track.",
    threat: 3,
    body: 0x402a40,
    emissive: 0xff5ad0,
    make: () => new THREE.TorusGeometry(1.5, 0.5, 8, 16),
  },
  sniper: {
    label: "LANCE",
    role: "Long-range precision fire from across the room.",
    threat: 3,
    body: 0x2a3a2a,
    emissive: 0x9bff4a,
    make: () => new THREE.ConeGeometry(1.4, 3, 8),
  },
  bomber: {
    label: "DETONATOR",
    role: "Massive hull. Detonates with area damage on death.",
    threat: 5,
    body: 0x3a2a18,
    emissive: 0xffb020,
    make: () => new THREE.BoxGeometry(4, 4, 4),
  },
  spreader: {
    label: "SCATTER",
    role: "Fires a wide three-bolt spread. Hard to strafe past.",
    threat: 3,
    body: 0x402a1c,
    emissive: 0xffae3a,
    make: () => new THREE.IcosahedronGeometry(1.8, 0),
  },
  twincannon: {
    label: "TWIN MAW",
    role: "Dual spread cannons — a five-bolt wall of fire.",
    threat: 4,
    body: 0x3a2410,
    emissive: 0xff8a1a,
    make: () => new THREE.IcosahedronGeometry(2, 0),
  },
  quadcannon: {
    label: "QUAD RIG",
    role: "Four tight parallel beams. Murder at mid range.",
    threat: 4,
    body: 0x103a3a,
    emissive: 0x33ffe0,
    make: () => new THREE.BoxGeometry(3.4, 3.4, 3.4),
  },
  dualplasma: {
    label: "TWIN PLASMA",
    role: "Two heavy plasma slugs. Slow, very hard hitting.",
    threat: 4,
    body: 0x163a1c,
    emissive: 0x5cff7a,
    make: () => new THREE.BoxGeometry(3.2, 3.2, 3.2),
  },
  arcer: {
    label: "ARC LANCE",
    role: "Rakes a vertical fan of fire across the corridor.",
    threat: 3,
    body: 0x2a2440,
    emissive: 0x8a5cff,
    make: () => new THREE.ConeGeometry(1.5, 3.2, 8),
  },
  burster: {
    label: "STUTTER",
    role: "Rapid tight three-round bursts. Relentless pressure.",
    threat: 3,
    body: 0x3a1430,
    emissive: 0xff5ce0,
    make: () => new THREE.ConeGeometry(1.4, 3, 7),
  },
  railer: {
    label: "RAILGUN",
    role: "Extreme-range single slug from clear across the map.",
    threat: 4,
    body: 0x102a40,
    emissive: 0x4ad0ff,
    make: () => new THREE.ConeGeometry(1.3, 3.4, 8),
  },
  swarmer: {
    label: "SHRIKE",
    role: "Tiny, fast, fragile — lunges in relentless packs.",
    threat: 3,
    body: 0x401818,
    emissive: 0xff4040,
    make: () => new THREE.TetrahedronGeometry(1.5),
  },
  mortar: {
    label: "LOBBER",
    role: "Arcs twin wide shots to flush you out of cover.",
    threat: 4,
    body: 0x3a3414,
    emissive: 0xe8d24a,
    make: () => new THREE.BoxGeometry(3.6, 3.6, 3.6),
  },
  warden: {
    label: "WARDEN",
    role: "Heavily armoured quad-cannon bulwark. A wall that shoots.",
    threat: 5,
    body: 0x40202a,
    emissive: 0xff5a7a,
    make: () => new THREE.BoxGeometry(3.8, 3.8, 3.8),
  },
};
