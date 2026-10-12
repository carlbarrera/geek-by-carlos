-- Descuento temporal por catálogo (%). No toca los precios guardados de las cartas:
-- la tabla, el PDF y las ventas calculan el precio con descuento al vuelo. 0 = sin descuento.
ALTER TABLE catalogos ADD COLUMN discount_pct REAL NOT NULL DEFAULT 0;
