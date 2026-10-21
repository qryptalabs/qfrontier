/** The same restrained palette is used by terrain, models and inventory exhibits. */
export const VOXEL_COLORS = {
  wood: '#81552f', woodLight: '#b98b50', woodDark: '#4b3926', endGrain: '#d5b574',
  roof: '#936034', roofLight: '#ba854b', roofDark: '#65452b',
  stone: '#908a76', stoneLight: '#b9b39a', stoneDark: '#605f50',
  stoneWarm: '#a79b7a', stoneMoss: '#80825e',
  iron: '#a8b5b2', ironDark: '#54696b', copper: '#cb8c53', gold: '#e1b963',
  leaf: '#748833', leafLight: '#9eaa45', leafDark: '#415e2e', grass: '#849b5d',
  pine: '#3d6437', pineLight: '#718e3c', pineDark: '#264c30',
  teal: '#4e9d91', tealLight: '#a4d4ba', tealDark: '#285952',
  cream: '#e8d8b4', canvas: '#bcaf82', soil: '#594638', red: '#b5644d',
  water: '#64b3c1', blue: '#629ab5', crystal: '#97d7cb', glow: '#f6be65',
  black: '#263a38', skin: '#d7a67e', skinLight: '#e7bd92', pale: '#d4dacf',
} as const;

export type VoxelColor = keyof typeof VOXEL_COLORS;

