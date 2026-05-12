/**
 * @file src/features/search/search-fuzzy-matcher.ts
 * @description Fuzzy search matching utilities.
 * @author JUNGHO
 * @since 2026-05-02
 */

import {distance} from "fastest-levenshtein";

// 1. Recursive fuzzy matcher ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
// @param text The text to search within
// @param query The query string to find
// @param start Start index in the text (default: 0)
// @param end End index in the text (default: text.length)
// @param parentDistance Best distance found so far (default: Infinity)
// @returns Object with start and end indices, matched value, and Levenshtein distance

// 1. Recursive fuzzy index of ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export function recursiveFuzzyIndexOf(
  text: string,
  query: string,
  start: number=0,
  end: number | null=null,
  parentDistance: number=Number.POSITIVE_INFINITY,
  depth: number=0,
): {
  start: number;
  end: number;
  value: string;
  distance: number;
} {
  if (depth === 0) {
    return recursiveFuzzyIndexOf(text, query, start, end, parentDistance, depth + 1);
  }
  if (end === null) {
    end = text.length;
  }
  // For small text segments, use iterative approach
  if (end - start <= 2 * query.length) {
    return iterativeReduction(text, query, start, end, parentDistance);
  }
  const midPoint = start + Math.floor((end - start) / 2);
  const leftEnd = Math.min(end, midPoint + query.length); // Include query length to cover overlaps
  const rightStart = Math.max(start, midPoint - query.length); // Include query length to cover overlaps

  // Calculate distance for current segments
  const leftDistance = distance(text.slice(start, leftEnd), query);
  const rightDistance = distance(text.slice(rightStart, end), query);
  const bestDistance = Math.min(leftDistance, parentDistance, rightDistance);

  // If parent distance is already the best, use iterative approach
  if (parentDistance === bestDistance) {
    return iterativeReduction(text, query, start, end, parentDistance);
  }
  // Recursively search the better half
  if (leftDistance < rightDistance) {
    return recursiveFuzzyIndexOf(text, query, start, leftEnd, bestDistance, depth + 1);
  }
  else {
    return recursiveFuzzyIndexOf(text, query, rightStart, end, bestDistance, depth + 1);
  }
}

// 2. Iteratively refines the best match by reducing the search area ―――――――――――――――――――――――――――――――
// @param text The text to search within
// @param query The query string to find
// @param start Start index in the text
// @param end End index in the text
// @param parentDistance Best distance found so far
// @returns Object with start and end indices, matched value, and Levenshtein distance

// 2. Iterative reduction ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function iterativeReduction(
  text: string,
  query: string,
  start: number,
  end: number,
  parentDistance: number,
): {
  start: number;
  end: number;
  value: string;
  distance: number;
} {
  let bestDistance = parentDistance;
  let bestStart = start;
  let bestEnd = end;

  // Improve start position
  let nextDistance = distance(text.slice(bestStart + 1, bestEnd), query);

  while (nextDistance < bestDistance) {
    bestDistance = nextDistance;
    bestStart++;
    const smallerString = text.slice(bestStart + 1, bestEnd);
    nextDistance = distance(smallerString, query);
  }
  // Improve end position
  nextDistance = distance(text.slice(bestStart, bestEnd - 1), query);

  while (nextDistance < bestDistance) {
    bestDistance = nextDistance;
    bestEnd--;
    const smallerString = text.slice(bestStart, bestEnd - 1);
    nextDistance = distance(smallerString, query);
  }

  return {
    distance: bestDistance,
    end: bestEnd,
    start: bestStart,
    value: text.slice(bestStart, bestEnd),
  };
}

// 3. Calculates the similarity ratio between two strings ――――――――――――――――――――――――――――――――――――――――――
// @param a First string
// @param b Second string
// @returns Similarity ratio (0-1)

// 3. Get similarity ratio ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export function getSimilarityRatio(a: string, b: string): number {
  const maxLength = Math.max(a.length, b.length);
  if (maxLength === 0) {
    return 1; // Both strings are empty
  }
  const levenshteinDistance = distance(a, b);
  return 1 - levenshteinDistance / maxLength;
}
