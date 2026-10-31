/**
 * mapConfig.js  -  where the era nodes sit on the 1920x1080 world map.
 *
 * Edit NODE_POSITIONS to move a node (index 0 = the first era in the database order).
 * The path between the start point and the nodes is the walkable corridor: the avatar can
 * only walk on it (lane radius) and around each node (node radius).
 *
 * Optional pictures (the map still works without them - it is painted in code):
 *   ../assets/gameAsset/map/world_map.jpg   1920x1080 map picture
 *   ../assets/gameAsset/map/world_mask.png  white/opaque = walkable (replaces the corridor)
 */
export const WORLD = { w: 1920, h: 1080 };
export const START = { x: 281, y: 795 };         // the "MULA" sign
export const LANE_RADIUS = 46;                   // how far from the path line the avatar may walk
export const NODE_RADIUS = 62;                   // how far around a node circle
export const TALK_RADIUS = 72;                   // how close to a node to open it

/** the 10 circles on the map picture, in order along the path (1920 x 1080 pixels) */
export const NODE_POSITIONS = [
  { x: 525,  y: 633 },
  { x: 966,  y: 824 },
  { x: 1272, y: 809 },
  { x: 1528, y: 651 },
  { x: 1663, y: 468 },
  { x: 1376, y: 305 },
  { x: 1025, y: 205 },
  { x: 691,  y: 302 },
  { x: 405,  y: 405 },
  { x: 322,  y: 211 }
];

export const WORLD_IMAGE = '../assets/gameAsset/map/world_map.jpg';
export const WORLD_MASK = '../assets/gameAsset/map/world_mask.png';

/** position for era index i (extra eras continue on a ring so nothing is ever missing) */
export const nodeFor = (i) => {
  if (NODE_POSITIONS[i]) return NODE_POSITIONS[i];
  const a = (i - NODE_POSITIONS.length) * 0.7;
  return { x: 960 + Math.cos(a) * 520, y: 540 + Math.sin(a) * 300 };
};
