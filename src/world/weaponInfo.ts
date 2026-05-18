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
  rockets: {
    label: "ROCKETS",
    desc: "Concussion rockets — slow, but big splash damage.",
    body: 0x3a2810,
    emissive: 0xffae50,
    make: () => new THREE.CapsuleGeometry(0.55, 1.8, 6, 10),
  },
};
