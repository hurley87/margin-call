/**
 * Shared hand-drawn stroke settings for every Drawably primitive.
 *
 * `boil: 0` keeps the strokes still — the animated default is distracting on a
 * form. Surfaces that want a visibly different squiggle override `seed` only.
 */
export const SKETCH = { seed: 42, roughness: 0.7, boil: 0 } as const;
