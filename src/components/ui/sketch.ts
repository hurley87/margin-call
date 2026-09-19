/**
 * Shared hand-drawn stroke settings for every Drawably primitive.
 *
 * `boil: 0` keeps the strokes still — the animated default is distracting on a
 * form. Surfaces that want a visibly different squiggle override `seed` only.
 */
export const SKETCH = { seed: 42, roughness: 0.7, boil: 0 } as const;

/**
 * Stroke settings for the paper surfaces that hold content rather than input:
 * gallery cards, notices, and the Position detail page.
 *
 * Softer than `SKETCH` and bordered in the theme's own line colour, so a wall
 * of cards reads as one sheet instead of a grid of forms. Callers override
 * `seed` to keep neighbouring shapes from stroking identically.
 */
export const SURFACE_SKETCH = {
  roughness: 0.6,
  boil: 0,
  stroke: "var(--t-border)",
} as const;
