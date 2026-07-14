export interface ReindexedOptions {
  options: string[];
  correctIndexes: number[];
}

export function reindexOptions(
  options: string[],
  permutation: number[],
  correctIndexes: number[],
): ReindexedOptions {
  const newOptions = permutation.map((originalIndex) => options[originalIndex]!);
  const newCorrectIndexes = correctIndexes
    .map((originalIndex) => permutation.indexOf(originalIndex))
    .filter((index) => index !== -1)
    .sort((a, b) => a - b);

  return { options: newOptions, correctIndexes: newCorrectIndexes };
}

export function randomPermutation(length: number): number[] {
  const indexes = Array.from({ length }, (_, i) => i);

  for (let i = indexes.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [indexes[i], indexes[j]] = [indexes[j]!, indexes[i]!];
  }

  return indexes;
}
