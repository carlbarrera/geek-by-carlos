-- Catálogos de cartas (cada fila = un catálogo completo, cartas en JSON).
-- `version` permite escrituras optimistas: dos ventas simultáneas no se pisan.
CREATE TABLE IF NOT EXISTS catalogos (
  name TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  cards TEXT NOT NULL DEFAULT '[]',
  version INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT
);

-- Historial de movimientos (altas, ediciones, ventas, eliminaciones) por catálogo.
CREATE TABLE IF NOT EXISTS catalogo_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  catalog TEXT NOT NULL,
  entry TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_catalogo_log_catalog ON catalogo_log (catalog, id);
