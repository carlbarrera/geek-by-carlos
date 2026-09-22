# Panel eBay — configuración en Cloudflare

Ruta pública: `https://geekbycarlos.com/admin/ebay/`
El middleware Basic Auth protege TODO `/admin/*` y TODO `/api/*`.

Antes de que funcione, hay que hacer **3 cosas en el panel de Cloudflare Pages**.

---

## 1. Crear el KV namespace

Guarda los pedidos.

1. Cloudflare Dashboard → **Workers & Pages** → **KV** (menú izquierdo).
2. **Create a namespace** → nombre: `ebay-pedidos` → **Add**.
3. Copia el **ID** que sale (lo vas a ver en la tabla).

---

## 2. Enlazar el KV al proyecto Pages

1. **Workers & Pages** → tu proyecto **geek-by-carlos** → **Settings** → **Functions**.
2. Bajar hasta **KV namespace bindings** → **Add binding**.
3. Variable name: `PEDIDOS_KV` (respetar mayúsculas).
4. KV namespace: `ebay-pedidos`.
5. **Save**.

Repite lo mismo en la sección **Preview** (para deploys de rama).

---

## 3. Variables de entorno (usuarios y contraseñas)

En el mismo panel → **Settings** → **Environment variables** → **Production**.

Agrega estas 4 variables (elige claves fuertes):

| Variable name           | Valor sugerido                |
|-------------------------|-------------------------------|
| `EBAY_USER_CARLOS`      | `carlos`                      |
| `EBAY_PASS_CARLOS`      | **clave tuya, mín. 16 chars** |
| `EBAY_USER_SOBRINO`     | `sobrino` (o el nombre real)  |
| `EBAY_PASS_SOBRINO`     | **clave del sobrino**         |

Marcarlas todas como **Encrypted** (icono candado).

Repite en el ambiente **Preview** si quieres poder probar desde ramas.

---

## 4. Deploy

Cuando hagas push a `main`, Cloudflare Pages construye y publica.
La primera vez tras configurar KV/vars, forzar un redeploy en:
**Deployments → View latest → Retry deployment**.

---

## 5. Probar

1. Abrir `https://geekbycarlos.com/admin/ebay/`.
2. Debe pedir usuario/clave (popup del navegador).
3. Ingresar con `EBAY_USER_CARLOS` / `EBAY_PASS_CARLOS`.
4. Aparece el panel con dos botones: Cargar / Ver.
5. Cargar un pedido de prueba y luego ir a Ver — debe aparecer.

---

## Cómo cambiar la contraseña del sobrino

En Cloudflare → Settings → Environment variables → editar `EBAY_PASS_SOBRINO` → Save → Redeploy.
Efecto en ~1 min.

---

## Cómo bajar los pedidos como archivo

Los pedidos viven en Cloudflare KV.
Para descargarlos como JSON: `GET https://geekbycarlos.com/api/ebay/pedidos` (autenticado).
Ejemplo con curl:
```bash
curl -u 'carlos:tu-clave' https://geekbycarlos.com/api/ebay/pedidos > pedidos.json
```

---

## Archivos que componen esto

- `functions/admin/_middleware.ts` — auth para `/admin/*`
- `functions/api/_middleware.ts` — auth para `/api/*`
- `functions/api/ebay/pedidos.ts` — CRUD sobre KV
- `public/admin/ebay/index.html` — landing con Cargar / Ver
- `public/admin/ebay/cargar.html` — formulario
- `public/admin/ebay/ver.html` — lista + borrar
