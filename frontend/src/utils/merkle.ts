import { keccak256, encodePacked } from "viem";
import type { Hex } from "viem";

export function hashLeaf(chainId: bigint, contractAddress: `0x${string}`, uniqueCode: string, account: `0x${string}`): Hex {
  return keccak256(
    encodePacked(
      ["uint256", "address", "string", "address"],
      [chainId, contractAddress, uniqueCode, account]
    )
  );
}

function sortPair(a: Hex, b: Hex): [Hex, Hex] {
  return a.toLowerCase() <= b.toLowerCase() ? [a, b] : [b, a];
}

export function buildMerkleLevels(leaves: Hex[]): Hex[][] {
  if (leaves.length === 0) return [["0x" as Hex]];
  let level = leaves.slice();
  const layers: Hex[][] = [level];
  while (level.length > 1) {
    const next: Hex[] = [];
    for (let i = 0; i < level.length; i += 2) {
      if (i + 1 === level.length) {
        next.push(level[i]);
      } else {
        const [a, b] = sortPair(level[i], level[i + 1]);
        next.push(keccak256(encodePacked(["bytes32", "bytes32"], [a, b])));
      }
    }
    level = next;
    layers.push(level);
  }
  return layers;
}

export function getRoot(leaves: Hex[]): Hex {
  const layers = buildMerkleLevels(leaves);
  return layers[layers.length - 1][0];
}

export function getProof(leaves: Hex[], targetIndex: number): Hex[] {
  const layers = buildMerkleLevels(leaves);
  const proof: Hex[] = [];
  let idx = targetIndex;
  for (let level = 0; level < layers.length - 1; level++) {
    const layer = layers[level];
    const pairIndex = idx ^ 1; // sibling
    if (pairIndex < layer.length) {
      proof.push(layer[pairIndex]);
    }
    idx = Math.floor(idx / 2);
  }
  return proof;
}
