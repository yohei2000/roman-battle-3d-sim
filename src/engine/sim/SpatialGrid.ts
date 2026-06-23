import type { Formation } from "./SimTypes";

export class SpatialGrid {
  potentialEnemyPairs(formations: Formation[]): Array<[Formation, Formation]> {
    const pairs: Array<[Formation, Formation]> = [];
    for (let aIndex = 0; aIndex < formations.length; aIndex += 1) {
      for (let bIndex = aIndex + 1; bIndex < formations.length; bIndex += 1) {
        const a = formations[aIndex];
        const b = formations[bIndex];
        if (a.side !== b.side) {
          pairs.push([a, b]);
        }
      }
    }
    return pairs;
  }
}
