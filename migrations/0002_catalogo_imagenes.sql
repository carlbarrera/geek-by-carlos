-- Fotos propias de cartas (subidas desde el panel). La clave es el hash del contenido.
CREATE TABLE IF NOT EXISTS catalogo_imagenes (
  key TEXT PRIMARY KEY,
  mime TEXT NOT NULL,
  data BLOB NOT NULL,
  created_at TEXT NOT NULL
);
