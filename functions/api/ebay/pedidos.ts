/**
 * API de pedidos eBay — CRUD sobre Cloudflare KV.
 * Binding requerido en Cloudflare Pages → Settings → Functions → KV bindings:
 *   Variable name: PEDIDOS_KV
 *   KV namespace : ebay-pedidos (o el que hayan creado)
 *
 * Rutas:
 *   GET    /api/ebay/pedidos               → lista todos los pedidos ordenados por fecha_creacion desc
 *   POST   /api/ebay/pedidos               → crea un pedido (body JSON)
 *   DELETE /api/ebay/pedidos?order_id=XYZ  → borra un pedido
 */

interface Env {
  PEDIDOS_KV: KVNamespace;
}

interface Item {
  item_id?: string;
  titulo: string;
  url?: string;
  vendedor?: string;
  precio: number;
  cantidad: number;
  subtotal: number;
}

interface Pedido {
  order_id: string;
  items: Item[];
  num_items: number;
  total: number;
  subtotal: number;
  envio: number;
  moneda: string;
  fecha_compra: string;
  vendedor: string;
  trackings: Array<{ numero: string; carrier: string }>;
  ship_address: { name: string; city: string; state: string; postal: string; country: string };
  notas: string;
  _creado: string;
  _creado_por: string;
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

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const ids = await loadIndex(env.PEDIDOS_KV);
  const pedidos: Pedido[] = [];
  for (const id of ids) {
    const raw = await env.PEDIDOS_KV.get(`pedido:${id}`);
    if (raw) {
      try { pedidos.push(JSON.parse(raw)); } catch { /* skip corrupto */ }
    }
  }
  return json({ pedidos, total: pedidos.length });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env, data }) => {
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

  const item: Item = {
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
  if (trackingNum) {
    trackings.push({ numero: trackingNum, carrier: toStr(body.carrier) });
  }

  const pedido: Pedido = {
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
    _creado_por: toStr((data as Record<string, unknown>)?.userName) || 'desconocido',
  };

  await env.PEDIDOS_KV.put(key, JSON.stringify(pedido));
  const ids = await loadIndex(env.PEDIDOS_KV);
  ids.unshift(orderId);
  await saveIndex(env.PEDIDOS_KV, ids);

  return json({ ok: true, order_id: orderId, total_pedidos: ids.length });
};

export const onRequestDelete: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  const orderId = url.searchParams.get('order_id')?.trim();
  if (!orderId) return json({ error: 'order_id requerido' }, 400);

  const key = `pedido:${orderId}`;
  const existing = await env.PEDIDOS_KV.get(key);
  if (!existing) return json({ error: 'no encontrado' }, 404);

  await env.PEDIDOS_KV.delete(key);
  const ids = (await loadIndex(env.PEDIDOS_KV)).filter((id) => id !== orderId);
  await saveIndex(env.PEDIDOS_KV, ids);

  return json({ ok: true, total_pedidos: ids.length });
};
