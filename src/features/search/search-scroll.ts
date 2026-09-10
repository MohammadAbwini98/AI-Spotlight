interface ScrollBounds {
  top: number
  bottom: number
}

/** Returns the nearest scroll position that fully reveals a selected result. */
export function getNearestResultScrollTop(
  currentScrollTop: number,
  viewport: ScrollBounds,
  result: ScrollBounds
): number | null {
  if (result.top < viewport.top) {
    return Math.max(0, currentScrollTop + result.top - viewport.top)
  }

  if (result.bottom > viewport.bottom) {
    return Math.max(0, currentScrollTop + result.bottom - viewport.bottom)
  }

  return null
}
