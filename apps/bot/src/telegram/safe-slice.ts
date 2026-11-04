export function sliceWithoutSplittingPairs(text: string, maxUnits: number): string {
  if (text.length <= maxUnits) {
    return text;
  }

  const last = text.charCodeAt(maxUnits - 1);
  const end = last >= 0xd800 && last <= 0xdbff ? maxUnits - 1 : maxUnits;

  return text.slice(0, end);
}
