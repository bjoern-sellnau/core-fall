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
};
