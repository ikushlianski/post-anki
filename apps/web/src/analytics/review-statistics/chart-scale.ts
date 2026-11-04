export interface ChartPoint {
  x: number
  y: number | null
}

export function scaleLinear(domainMax: number, size: number): (value: number) => number {
  return (value) => (domainMax <= 0 ? 0 : (value / domainMax) * size)
}

export function bandX(index: number, count: number, width: number): number {
  return count <= 1 ? width / 2 : (index / (count - 1)) * width
}

export function linePath(points: readonly ChartPoint[]): string {
  let path = ''
  let drawing = false

  for (const point of points) {
    if (point.y === null) {
      drawing = false
      continue
    }

    path += `${drawing ? 'L' : 'M'}${round(point.x)} ${round(point.y)} `
    drawing = true
  }

  return path.trim()
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}

export function formatPercent(rate: number | null): string {
  return rate === null ? 'n/a' : `${Math.round(rate * 100)}%`
}
