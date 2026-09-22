/**
 * Worker principal del sitio.
 * - Sirve el sitio estático desde ASSETS.
 * - Intercepta /admin/* y /api/* con Basic Auth.
 * - Expone la API de pedidos eBay sobre KV.
 */

interface Env {
  ASSETS: Fetcher;
  PEDIDOS_KV: KVNamespace;
  SESSION?: KVNamespace;
  IMAGES?: unknown;
  EBAY_USER_CARLOS?: string;
  EBAY_PASS_CARLOS?: string;
  EBAY_USER_SOBRINO?: string;
  EBAY_PASS_SOBRINO?: string;
}

const REALM = 'Panel Geek By Carlos';

function unauthorized(): Response {
  return new Response('Autenticación requerida.', {
    status: 401,
    headers: {
      'WWW-Authenticate': `Basic realm="${REALM}", charset="UTF-8"`,
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}

function decodeBasic(header: string | null): { user: string; pass: string } | null {
  if (!header || !header.toLowerCase().startsWith('basic ')) return null;
  try {
    const raw = atob(header.slice(6).trim());
    const idx = raw.indexOf(':');
    if (idx === -1) return null;
    return { user: raw.slice(0, idx), pass: raw.slice(idx + 1) };
  } catch {
    return null;
  }
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function authenticate(request: Request, env: Env): { userName: string } | null {
  const creds = decodeBasic(request.headers.get('Authorization'));
  if (!creds) return null;
  const pairs: Array<[string | undefined, string | undefined]> = [
    [env.EBAY_USER_CARLOS, env.EBAY_PASS_CARLOS],
    [env.EBAY_USER_SOBRINO, env.EBAY_PASS_SOBRINO],
  ];
  const ok = pairs.some(
    ([u, p]) => u && p && safeEqual(creds.user, u) && safeEqual(creds.pass, p),
  );
  return ok ? { userName: creds.user } : null;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function toNum(v: unknown, def = 0): number {
  if (v === null || v === undefined || v === '') return def;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : def;
}
function toInt(v: unknown, def = 1): number {
  const n = toNum(v, def);
  return Math.max(1, Math.floor(n));
}
function toStr(v: unknown): string {
  return typeof v === 'string' ? v.trim() : v == null ? '' : String(v);
}

const INDEX_KEY = 'index';

async function loadIndex(kv: KVNamespace): Promise<string[]> {
  const raw = await kv.get(INDEX_KEY);
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}
async function saveIndex(kv: KVNamespace, ids: string[]): Promise<void> {
  await kv.put(INDEX_KEY, JSON.stringify(ids));
}

async function apiPedidosGet(env: Env): Promise<Response> {
  const ids = await loadIndex(env.PEDIDOS_KV);
  const pedidos: unknown[] = [];
  for (const id of ids) {
    const raw = await env.PEDIDOS_KV.get(`pedido:${id}`);
    if (raw) {
      try {
        pedidos.push(JSON.parse(raw));
      } catch {
        /* skip */
      }
    }
  }
  return json({ pedidos, total: pedidos.length });
}

async function apiPedidosPost(request: Request, env: Env, userName: string): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Body no es JSON válido' }, 400);
  }

  const orderId = toStr(body.order_id);
  if (!orderId) return json({ error: 'order_id es obligatorio' }, 400);

  const key = `pedido:${orderId}`;
  const existing = await env.PEDIDOS_KV.get(key);
  if (existing) return json({ error: `Ya existe un pedido con Order ID ${orderId}` }, 400);

  const precio = toNum(body.item_precio);
  const cantidad = toInt(body.item_cantidad, 1);
  const subtotal = precio * cantidad;
  const envio = toNum(body.envio);
  const total = toNum(body.total) || subtotal + envio;

  const item = {
    item_id: toStr(body.item_id),
    titulo: toStr(body.item_titulo),
    url: toStr(body.item_url),
    vendedor: toStr(body.vendedor),
    precio,
    cantidad,
    subtotal,
  };

  const trackings: Array<{ numero: string; carrier: string }> = [];
  const trackingNum = toStr(body.tracking);
  if (trackingNum) trackings.push({ numero: trackingNum, carrier: toStr(body.carrier) });

  const pedido = {
    order_id: orderId,
    items: [item],
    num_items: cantidad,
    total,
    subtotal,
    envio,
    moneda: 'USD',
    fecha_compra: toStr(body.fecha_compra),
    vendedor: toStr(body.vendedor),
    trackings,
    ship_address: {
      name: toStr(body.ship_name),
      city: toStr(body.ship_city),
      state: toStr(body.ship_state),
      postal: toStr(body.ship_postal),
      country: 'United States',
    },
    notas: toStr(body.notas),
    _creado: new Date().toISOString(),
    _creado_por: userName,
  };

  await env.PEDIDOS_KV.put(key, JSON.stringify(pedido));
  const ids = await loadIndex(env.PEDIDOS_KV);
  ids.unshift(orderId);
  await saveIndex(env.PEDIDOS_KV, ids);

  return json({ ok: true, order_id: orderId, total_pedidos: ids.length });
}

async function apiPedidoEdit(request: Request, env: Env): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Body no es JSON válido' }, 400);
  }
  const orderId = toStr(body.order_id);
  if (!orderId) return json({ error: 'order_id requerido' }, 400);
  const key = `pedido:${orderId}`;
  const raw = await env.PEDIDOS_KV.get(key);
  if (!raw) return json({ error: 'no encontrado' }, 404);
  const pedido = JSON.parse(raw);

  // Tracking (crea/actualiza el primer tracking del array)
  const trackingNum = toStr(body.tracking);
  if ('tracking' in body || 'carrier' in body) {
    const carrier = toStr(body.carrier);
    if (trackingNum) {
      pedido.trackings = [{ numero: trackingNum, carrier, carrier_raw: carrier }];
    } else if ('tracking' in body) {
      pedido.trackings = [];
    }
  }

  // Imagen del primer item
  if ('imagen' in body) {
    if (!pedido.items) pedido.items = [{}];
    if (!pedido.items[0]) pedido.items[0] = {};
    pedido.items[0].imagen = toStr(body.imagen);
  }

  // URL del item
  if ('item_url' in body) {
    if (!pedido.items) pedido.items = [{}];
    if (!pedido.items[0]) pedido.items[0] = {};
    pedido.items[0].url = toStr(body.item_url);
  }

  // Notas
  if ('notas' in body) pedido.notas = toStr(body.notas);

  await env.PEDIDOS_KV.put(key, JSON.stringify(pedido));
  return json({ ok: true, order_id: orderId });
}

async function apiMetaSave(request: Request, env: Env): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Body no es JSON válido' }, 400);
  }
  const orderId = toStr(body.order_id);
  if (!orderId) return json({ error: 'order_id requerido' }, 400);
  const key = `pedido:${orderId}`;
  const raw = await env.PEDIDOS_KV.get(key);
  if (!raw) return json({ error: 'no encontrado' }, 404);
  const pedido = JSON.parse(raw);
  for (const campo of ['notas', 'estado_personal', 'fecha_envio_colombia', 'fecha_recibido']) {
    if (campo in body) pedido[campo] = toStr(body[campo]);
  }
  await env.PEDIDOS_KV.put(key, JSON.stringify(pedido));
  return json({ ok: true });
}

async function apiMetaBulkSave(request: Request, env: Env): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Body no es JSON válido' }, 400);
  }
  const items = body.items;
  if (!Array.isArray(items)) return json({ error: 'items debe ser array' }, 400);
  let actualizados = 0;
  for (const it of items as Array<Record<string, unknown>>) {
    const oid = toStr(it.order_id);
    if (!oid) continue;
    const key = `pedido:${oid}`;
    const raw = await env.PEDIDOS_KV.get(key);
    if (!raw) continue;
    const pedido = JSON.parse(raw);
    for (const campo of ['notas', 'estado_personal', 'fecha_envio_colombia', 'fecha_recibido']) {
      if (campo in it) pedido[campo] = toStr(it[campo]);
    }
    await env.PEDIDOS_KV.put(key, JSON.stringify(pedido));
    actualizados++;
  }
  return json({ ok: true, actualizados });
}

async function apiPedidosEstado(request: Request, env: Env): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Body no es JSON válido' }, 400);
  }
  const orderId = toStr(body.order_id);
  if (!orderId) return json({ error: 'order_id requerido' }, 400);
  const estado = toStr(body.estado_personal);
  const ESTADOS_VALIDOS = ['', 'en-usa', 'en-camino', 'recibido', 'archivado'];
  if (!ESTADOS_VALIDOS.includes(estado)) return json({ error: 'estado_personal inválido' }, 400);

  const key = `pedido:${orderId}`;
  const raw = await env.PEDIDOS_KV.get(key);
  if (!raw) return json({ error: 'no encontrado' }, 404);

  const pedido = JSON.parse(raw);
  pedido.estado_personal = estado;
  if (estado === 'recibido' && !pedido.fecha_recibido) {
    pedido.fecha_recibido = new Date().toISOString();
  }
  await env.PEDIDOS_KV.put(key, JSON.stringify(pedido));
  return json({ ok: true, order_id: orderId, estado_personal: estado });
}

async function apiPedidosDelete(url: URL, env: Env): Promise<Response> {
  const orderId = url.searchParams.get('order_id')?.trim();
  if (!orderId) return json({ error: 'order_id requerido' }, 400);
  const key = `pedido:${orderId}`;
  const existing = await env.PEDIDOS_KV.get(key);
  if (!existing) return json({ error: 'no encontrado' }, 404);
  await env.PEDIDOS_KV.delete(key);
  const ids = (await loadIndex(env.PEDIDOS_KV)).filter((id) => id !== orderId);
  await saveIndex(env.PEDIDOS_KV, ids);
  return json({ ok: true, total_pedidos: ids.length });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // Rutas protegidas: /admin/* y /api/*
    if (path.startsWith('/admin') || path.startsWith('/api')) {
      const auth = authenticate(request, env);
      if (!auth) return unauthorized();

      // API de pedidos eBay
      if (path === '/api/ebay/pedidos') {
        const method = request.method.toUpperCase();
        if (method === 'GET') return apiPedidosGet(env);
        if (method === 'POST') return apiPedidosPost(request, env, auth.userName);
        if (method === 'DELETE') return apiPedidosDelete(url, env);
        return json({ error: 'Método no soportado' }, 405);
      }

      // Cambiar estado personal de un pedido
      if (path === '/api/ebay/pedidos/estado' && request.method === 'POST') {
        return apiPedidosEstado(request, env);
      }

      // Editar cualquier campo de un pedido (tracking, imagen, etc.)
      if (path === '/api/ebay/pedidos/edit' && request.method === 'POST') {
        return apiPedidoEdit(request, env);
      }

      // Compatibilidad con la UI local del dashboard
      if (path === '/api/ebay/meta/save' && request.method === 'POST') {
        return apiMetaSave(request, env);
      }
      if (path === '/api/ebay/meta/bulk-save' && request.method === 'POST') {
        return apiMetaBulkSave(request, env);
      }
      if (path === '/api/ebay/status' && request.method === 'GET') {
        return json({ ok: true, mode: 'manual', logged_in: true });
      }
      // Los siguientes son sync/scrape/tracking: en la nube no aplican, se responde OK vacío
      if (path === '/api/ebay/sync' && request.method === 'POST') {
        return json({ ok: true, mensaje: 'Sincronización no disponible en modo manual' });
      }
      if (path === '/api/ebay/refresh-now' && request.method === 'POST') {
        return json({ ok: true });
      }
      if (path === '/api/ebay/fresh-status' && request.method === 'GET') {
        return json({ ok: true, actualizado: new Date().toISOString() });
      }
      if ((path === '/api/ebay/check-tracking' || path === '/api/ebay/check-tracking-api')) {
        return json({ ok: true, mensaje: 'Verificación de tracking no disponible en modo manual' });
      }
      if (path === '/api/ebay/scrape-mye') {
        return json({ ok: true, mensaje: 'Scrape MyE no disponible en modo manual' });
      }

      // Otros /api/* → 404
      if (path.startsWith('/api/')) {
        return json({ error: 'endpoint no encontrado' }, 404);
      }

      // /admin/* → servir el HTML estático correspondiente
      return env.ASSETS.fetch(request);
    }

    // Todo lo demás → sitio público estático (blog, etc.)
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
