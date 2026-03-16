-- Enforce globally unique trader names (case-insensitive)
CREATE UNIQUE INDEX idx_traders_name_unique ON traders (LOWER(name));
