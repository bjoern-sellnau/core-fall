import * as THREE from "three";
import type { Weapon } from "./Weapons";

interface WeaponSpec {
  label: string;
  desc: string;
  body: number;
  emissive: number;
  make: () => THREE.BufferGeometry;
}

export const WEAPONS: Record<Weapon, WeaponSpec> = {
  laser: {
    label: "LASER CANNON",
    desc: "Standard energy laser. Upgrades up to a quad spread.",
    body: 0x123040,
    emissive: 0x66f0ff,
    make: () => new THREE.BoxGeometry(0.5, 0.5, 3.4),
  },
  superlaser: {
    label: "SUPER LASER",
    desc: "Overcharged laser — faster cadence, heavier damage.",
    body: 0x3a1414,
    emissive: 0xff4d4d,
    make: () => new THREE.BoxGeometry(0.7, 0.7, 3.6),
  },
  vulcan: {
    label: "VULCAN CANNON",
    desc: "Rapid ballistic gun. Uses ammo, never energy.",
    body: 0x3a3416,
    emissive: 0xffe06a,
    make: () => new THREE.CylinderGeometry(0.5, 0.5, 3.2, 14),
  },
  plasma: {
    label: "PLASMA CANNON",
    desc: "Green plasma bursts. High rate, drains energy fast.",
    body: 0x143a1e,
    emissive: 0x66ff88,
    make: () => new THREE.IcosahedronGeometry(1.4, 0),
  },
  fusion: {
    label: "FUSION CANNON",
    desc: "Charge it up, release a devastating energy blast.",
    body: 0x2a1840,
    emissive: 0xc8a0ff,
    make: () => new THREE.IcosahedronGeometry(1.7, 1),
  },
  spreadfire: {
    label: "SPREADFIRE CANNON",
    desc: "Energy fan blast — sprays a wide spread, ideal for tunnels.",
    body: 0x3a1438,
    emissive: 0xffa6f0,
    make: () => new THREE.ConeGeometry(1.5, 2.6, 5),
  },
  rockets: {
    label: "CONCUSSION MISSILE",
    desc: "Standard rocket — slow, but reliable splash damage.",
    body: 0x3a2810,
    emissive: 0xffae50,
    make: () => new THREE.CapsuleGeometry(0.55, 1.8, 6, 10),
  },
  homing: {
    label: "HOMING MISSILE",
    desc: "Seeking rocket — locks the nearest hostile and chases it.",
    body: 0x103a30,
    emissive: 0x66ffd0,
    make: () => new THREE.CapsuleGeometry(0.5, 1.7, 6, 10),
  },
  proximity: {
    label: "PROXIMITY BOMB",
    desc: "Deployable mine — hangs in space, detonates on approach.",
    body: 0x3a1414,
    emissive: 0xff5a5a,
    make: () => new THREE.IcosahedronGeometry(1.4, 0),
  },
  smart: {
    label: "SMART MISSILE",
    desc: "Bursts into a swarm of seeking sub-munitions on impact.",
    body: 0x3a1430,
    emissive: 0xff66cc,
    make: () => new THREE.CapsuleGeometry(0.6, 1.9, 6, 10),
  },
  mega: {
    label: "MEGA MISSILE",
    desc: "Rare boss-killer — colossal blast, huge splash radius.",
    body: 0x3a0e0e,
    emissive: 0xff3030,
    make: () => new THREE.CapsuleGeometry(0.8, 2.2, 8, 12),
  },
  chrono: {
    label: "CHRONOSPHERE",
    desc: "Time-warp gadget — slows the world so you can dodge fire.",
    body: 0x2a1840,
    emissive: 0xb060ff,
    make: () => new THREE.TorusKnotGeometry(1.1, 0.34, 64, 8),
  },
};
