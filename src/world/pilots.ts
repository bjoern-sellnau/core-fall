export interface Pilot {
  name: string;
  sex: "M" | "F";
}

// 9 male, 9 female mining-corps pilots.
export const PILOTS: Pilot[] = [
  { name: "VEX CALDER", sex: "M" },
  { name: "BO RENNER", sex: "M" },
  { name: "DAX HOLLOWAY", sex: "M" },
  { name: "SOL VANCE", sex: "M" },
  { name: "KANO REYES", sex: "M" },
  { name: "TYR BRANDT", sex: "M" },
  { name: "ROOK SALAH", sex: "M" },
  { name: "CYRUS PIKE", sex: "M" },
  { name: "GUS MARLOW", sex: "M" },
  { name: "NOVA FREY", sex: "F" },
  { name: "ESCA DORAL", sex: "F" },
  { name: "RIA VANCE", sex: "F" },
  { name: "MIRA KESSLER", sex: "F" },
  { name: "JUNO VASK", sex: "F" },
  { name: "LENA CRUZ", sex: "F" },
  { name: "SABLE ORIN", sex: "F" },
  { name: "WREN TAO", sex: "F" },
  { name: "FAYE BISHOP", sex: "F" },
];
