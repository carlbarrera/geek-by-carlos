/**
 * API del catálogo de cartas (antes geek-catalogador/server.py, ahora en D1).
 * Todas las rutas viven bajo /api/catalogo/* y ya pasaron por Basic Auth en worker.ts.
 */

export interface CatalogoEnv {
  CATALOGO_DB: D1Database;
  POKEMONTCG_API_KEY?: string;
}

interface Card {
  id: string;
  name: string;
  number: string;
  set_name: string;
  set_id: string;
  rarity: string;
  image: string;
  variant: string;
  market_price_usd: number;
  cop: number;
  language: string;
  quantity: number;
  added_date: string;
  last_price_update: string;
}

const API_BASE = 'https://api.pokemontcg.io/v2';
const RATE = 3300;
// Workers limita subrequests por invocación (50 en plan gratis); dejamos margen.
const SUBREQUEST_BUDGET = 45;
const VARIANT_MAP: Record<string, string> = {
  Normal: 'normal',
  Foil: 'holofoil',
  'Reverse Holofoil': 'reverseHolofoil',
  '1st Edition': '1stEdition',
  '1st Edition Holofoil': '1stEditionHolofoil',
};
const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; GeekByCarlos/1.0)' };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

// Hora de Bogotá (UTC-5, sin horario de verano), mismo formato que el catalogador local.
function bogota(): Date {
  return new Date(Date.now() - 5 * 3600 * 1000);
}
const nowStamp = () => bogota().toISOString().slice(0, 19).replace('T', ' ');
const nowMinute = () => nowStamp().slice(0, 16);
const today = () => nowStamp().slice(0, 10);

function safeName(name: string): string {
  return name.toLowerCase().replace(/ /g, '_').replace(/[^a-z0-9_-]/g, '');
}

function usdToCop(usd: number): number {
  if (!usd || usd <= 0) return 0;
  return Math.ceil((usd * RATE) / 1000) * 1000;
}

function matches(c: Card, id: string, variant: string, lang?: string | null): boolean {
  return c.id === id && c.variant === variant && (!lang || (c.language || 'EN') === lang);
}

// ---------- D1 ----------

async function loadCatalog(env: CatalogoEnv, name: string) {
  const row = await env.CATALOGO_DB.prepare('SELECT label, cards, version FROM catalogos WHERE name = ?')
    .bind(name)
    .first<{ label: string; cards: string; version: number }>();
  if (!row) return null;
  return { label: row.label, cards: JSON.parse(row.cards) as Card[], version: row.version };
}

async function logAction(env: CatalogoEnv, catalog: string, entry: Record<string, unknown>) {
  entry.timestamp = nowStamp();
  await env.CATALOGO_DB.prepare('INSERT INTO catalogo_log (catalog, entry, created_at) VALUES (?, ?, ?)')
    .bind(catalog, JSON.stringify(entry), entry.timestamp as string)
    .run();
}

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Lee-modifica-escribe con control de versión: si otro cambio entró en medio, reintenta. */
async function mutate<T>(env: CatalogoEnv, name: string, fn: (cards: Card[]) => T): Promise<T> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const cat = await loadCatalog(env, name);
    if (!cat) throw new HttpError(404, 'catálogo no existe');
    const result = fn(cat.cards);
    const res = await env.CATALOGO_DB.prepare(
      'UPDATE catalogos SET cards = ?, version = version + 1, updated_at = ? WHERE name = ? AND version = ?',
    )
      .bind(JSON.stringify(cat.cards), nowStamp(), name, cat.version)
      .run();
    if (res.meta.changes === 1) return result;
  }
  throw new HttpError(409, 'el catálogo cambió mientras se guardaba, intenta de nuevo');
}

// ---------- Búsqueda (pokemontcg.io + TCGPlayer) ----------

class Budget {
  used = 0;
  diag: string[] = [];
  constructor(public apiKey?: string) {}
  ptcgHeaders(): Record<string, string> {
    return this.apiKey ? { ...UA, 'X-Api-Key': this.apiKey } : UA;
  }
  take(): boolean {
    if (this.used >= SUBREQUEST_BUDGET) return false;
    this.used++;
    return true;
  }
}

async function pricepoints(pid: number, budget: Budget) {
  const prices: Record<string, { market: number; low: number | null }> = {};
  if (!budget.take()) return prices;
  try {
    const r = await fetch(`https://mpapi.tcgplayer.com/v2/product/${pid}/pricepoints`, { headers: UA });
    if (r.status !== 200) return prices;
    for (const pp of (await r.json()) as Array<Record<string, unknown>>) {
      const pt = String(pp.printingType ?? '');
      const variant = VARIANT_MAP[pt] ?? pt.toLowerCase();
      const market = pp.marketPrice as number | null;
      if (market != null) prices[variant] = { market, low: (pp.listedMedianPrice as number) ?? null };
    }
  } catch {
    /* sin precio */
  }
  return prices;
}

async function tcgplayerPriceFromUrl(url: string, budget: Budget) {
  if (!budget.take()) return null;
  try {
    const r = await fetch(url, { method: 'HEAD', redirect: 'follow', headers: UA });
    const m = r.url.match(/\/product\/(\d+)/);
    if (!m) return null;
    const prices = await pricepoints(Number(m[1]), budget);
    return Object.keys(prices).length ? prices : null;
  } catch {
    return null;
  }
}

async function tcgplayerSearch(query: string, budget: Budget, termFilters?: Record<string, string[]>) {
  if (!budget.take()) return [];
  try {
    const terms: Record<string, string[]> = { productLineName: ['Pokemon Japanese'], ...(termFilters || {}) };
    const body = {
      algorithm: '',
      from: 0,
      size: 20,
      filters: { term: terms, range: {}, exclude: { channelExclusion: 0 } },
      listingSearch: { filters: { term: {}, range: {}, exclude: { channelExclusion: 0 } } },
      context: { cart: {}, shippingCountry: 'US' },
      settings: { useFuzzySearch: true },
      sort: {},
      query,
    };
    const r = await fetch(
      `https://mp-search-api.tcgplayer.com/v1/search/request?q=${encodeURIComponent(query)}&isList=false`,
      { method: 'POST', headers: { ...UA, 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    );
    budget.diag.push(`tcgsearch:${r.status}`);
    if (r.status !== 200) return [];
    const data = (await r.json()) as { results?: Array<{ results?: Array<Record<string, unknown>> }> };
    return data.results?.[0]?.results ?? [];
  } catch {
    return [];
  }
}

async function tcgplayerItemsToCards(items: Array<Record<string, unknown>>, fallbackName: string, number: string | null, budget: Budget) {
  return Promise.all(
    items.map(async (item) => {
      const pid = Number(item.productId || 0);
      const productName = String(item.productName || '');
      const setName = String(item.setName || '');
      const baseName = (productName.includes(' - ') ? productName.split(' - ')[0].trim() : productName) || fallbackName;
      const attrs = (item.customAttributes as Record<string, string>) || {};
      return {
        id: `tcgp-${pid}`,
        name: baseName,
        number: number ?? attrs.number ?? '',
        supertype: 'Pokémon',
        set: { name: setName, id: `tcgp-${pid}` },
        rarity: productName.replace(baseName, '').replace(/^[\s-]+|[\s-]+$/g, ''),
        images: {
          small: `https://tcgplayer-cdn.tcgplayer.com/product/${pid}_200w.jpg`,
          large: `https://product-images.tcgplayer.com/fit-in/437x437/${pid}.jpg`,
        },
        tcgplayer: { prices: await pricepoints(pid, budget), url: `https://www.tcgplayer.com/product/${pid}` },
      };
    }),
  );
}

async function searchTcgplayer(cardName: string, number: string, budget: Budget) {
  const seen = new Set<number>();
  const all: Array<Record<string, unknown>> = [];
  const add = (items: Array<Record<string, unknown>>) => {
    for (const it of items) {
      const pid = Number(it.productId || 0);
      if (pid && !seen.has(pid)) {
        seen.add(pid);
        all.push(it);
      }
    }
  };
  add(await tcgplayerSearch(`${cardName} ${number}`.trim(), budget));
  if (number.includes('/')) add(await tcgplayerSearch('', budget, { number: [number] }));
  return tcgplayerItemsToCards(all, cardName, number, budget);
}

// La API oficial falla seguido desde Cloudflare (429/5xx sin API key). Carlos trabaja con
// TCGPlayer, así que se intenta una sola vez con timeout corto y no se bloquea la búsqueda.
async function apiSearch(query: string, budget: Budget) {
  const url = `${API_BASE}/cards?q=${encodeURIComponent(query)}&orderBy=-set.releaseDate&pageSize=50`;
  if (!budget.take()) return null;
  try {
    const r = await fetch(url, { headers: budget.ptcgHeaders(), signal: AbortSignal.timeout(4000) });
    budget.diag.push(`pokemontcg:${r.status}`);
    if (r.status === 200) return (await r.json()) as { data: Array<Record<string, any>> };
  } catch (e) {
    budget.diag.push(`pokemontcg:err:${(e as Error).name}`);
  }
  return null;
}

async function enrichCards(cards: Array<Record<string, any>>, budget: Budget) {
  await Promise.all(
    cards.map(async (c) => {
      const s = c.set || {};
      const pt = s.printedTotal;
      if (pt && c.number && !String(c.number).includes('/')) {
        const total = s.total ?? pt;
        const digits = Math.max(String(total).length, String(pt).length, String(c.number).length);
        c.number = `${String(c.number).padStart(digits, '0')}/${String(pt).padStart(digits, '0')}`;
      }
      const tcg = c.tcgplayer || {};
      if ((!tcg.prices || !Object.keys(tcg.prices).length) && tcg.url) {
        const fb = await tcgplayerPriceFromUrl(tcg.url, budget);
        if (fb) {
          tcg.prices = fb;
          c.tcgplayer = tcg;
        }
      }
    }),
  );
}

async function handleSearch(q: string, apiKey?: string) {
  q = q.trim();
  if (!q) return json({ data: [] });
  const budget = new Budget(apiKey);
  const isDigit = /^\d+$/.test(q);
  const isPromo = !q.includes(' ') && !q.includes('/') && /\d/.test(q) && !isDigit;
  let query: string;
  if (q.includes('/')) {
    const [numPart, total] = q.split('/').map((s) => s.trim());
    query = `number:${numPart.replace(/^0+/, '') || '0'}`;
    if (total) query += ` set.printedTotal:${total.replace(/^0+/, '') || '0'}`;
  } else if (isDigit) {
    query = `number:${q.replace(/^0+/, '') || '0'}`;
  } else if (isPromo) {
    query = `number:${q}`;
  } else {
    query = `name:${q}*`;
  }

  const data = await apiSearch(query, budget);
  const cards: Array<Record<string, any>> = data?.data ?? [];
  const seen = new Set(cards.map((c) => c.id));
  const pushNew = (list: Array<Record<string, any>>, filter?: (c: Record<string, any>) => boolean) => {
    for (const c of list) {
      if (!seen.has(c.id) && (!filter || filter(c))) {
        cards.push(c);
        seen.add(c.id);
      }
    }
  };

  if (q.includes('/') || isPromo) {
    let cardName = cards[0]?.name ?? '';
    const setName = cards[0]?.set?.name ?? '';
    let extras: Array<Record<string, any>>;
    if (!cardName) {
      extras = await searchTcgplayer('', q, budget);
      if (extras.length) cardName = extras[0].name;
    } else {
      extras = await searchTcgplayer(cardName, q, budget);
    }
    pushNew(extras);
    if (cardName && setName) {
      const extras2 = await searchTcgplayer(cardName, setName, budget);
      pushNew(extras2, (c) => !String(c.set?.name ?? '').toLowerCase().includes(setName.toLowerCase()));
    }
  } else {
    const items = (await tcgplayerSearch(q, budget)).filter((it) => {
      const pid = Number(it.productId || 0);
      return pid && !seen.has(`tcgp-${pid}`);
    });
    pushNew(await tcgplayerItemsToCards(items, q, null, budget));
  }
  await enrichCards(cards, budget);
  return json({ data: cards, subrequests: budget.used, diag: budget.diag });
}

async function fetchCardPrices(cardId: string, budget: Budget) {
  if (!budget.take()) return null;
  const r = await fetch(`${API_BASE}/cards/${cardId}`, { headers: budget.ptcgHeaders() });
  if (r.status !== 200) return null;
  const data = ((await r.json()) as { data?: Record<string, any> }).data ?? {};
  const tcg = data.tcgplayer ?? {};
  if ((!tcg.prices || !Object.keys(tcg.prices).length) && tcg.url) {
    const fb = await tcgplayerPriceFromUrl(tcg.url, budget);
    if (fb) tcg.prices = fb;
  }
  return tcg as { prices?: Record<string, { market?: number }> };
}

// ---------- Handlers de escritura ----------

async function handleCreate(env: CatalogoEnv, body: Record<string, any>) {
  const name = String(body.name || '').trim();
  const label = String(body.label || name).trim();
  if (!name) return json({ error: 'nombre requerido' }, 400);
  const safe = safeName(name);
  if (!safe) return json({ error: 'nombre invalido' }, 400);
  const exists = await env.CATALOGO_DB.prepare('SELECT 1 FROM catalogos WHERE name = ?').bind(safe).first();
  if (exists) return json({ error: 'ya existe' }, 409);
  await env.CATALOGO_DB.prepare('INSERT INTO catalogos (name, label, cards, version, updated_at) VALUES (?, ?, ?, 0, ?)')
    .bind(safe, label, '[]', nowStamp())
    .run();
  return json({ ok: true, name: safe });
}

async function handleAdd(env: CatalogoEnv, cat: string, body: Record<string, any>) {
  if (!body.id) return json({ error: 'missing id' }, 400);
  const marketUsd = Number(body.market_price_usd || 0);
  const customCop = Number(body.cop || 0);
  const entry: Card = {
    id: String(body.id),
    name: String(body.name || ''),
    number: String(body.number || ''),
    set_name: String(body.set_name || ''),
    set_id: String(body.set_id || ''),
    rarity: String(body.rarity || ''),
    image: String(body.image || ''),
    variant: String(body.variant || 'normal'),
    market_price_usd: marketUsd,
    cop: customCop > 0 ? customCop : usdToCop(marketUsd),
    language: String(body.language || 'EN'),
    quantity: Number(body.quantity ?? 1),
    added_date: today(),
    last_price_update: nowMinute(),
  };
  await mutate(env, cat, (cards) => {
    if (cards.some((c) => c.id === entry.id && c.variant === entry.variant && (c.language || 'EN') === entry.language)) {
      throw new HttpError(409, 'ya existe en el catalogo');
    }
    cards.push(entry);
  });
  await logAction(env, cat, {
    type: 'addition',
    card_id: entry.id,
    card_name: entry.name,
    number: entry.number,
    set_name: entry.set_name,
    variant: entry.variant,
    quantity: entry.quantity,
    cop: entry.cop,
    source: 'web',
  });
  return json({ ok: true, card: entry });
}

async function handleRemove(env: CatalogoEnv, cat: string, body: Record<string, any>) {
  const id = String(body.id || '');
  const variant = String(body.variant || 'normal');
  const lang = body.lang as string | undefined;
  const removed = await mutate(env, cat, (cards) => {
    const idx = cards.findIndex((c) => matches(c, id, variant, lang));
    if (idx === -1) return null;
    return cards.splice(idx, 1)[0];
  });
  if (removed) {
    await logAction(env, cat, {
      type: 'removal',
      card_id: id,
      card_name: removed.name,
      number: removed.number,
      set_name: removed.set_name,
      variant,
      quantity_removed: removed.quantity ?? 1,
      cop: removed.cop ?? 0,
      reason: body.reason || 'web_removal',
      customer: body.customer || '',
      source: 'web',
    });
  }
  return json({ ok: true });
}

async function handleUpdate(env: CatalogoEnv, cat: string, body: Record<string, any>) {
  const id = String(body.id || '');
  const variant = String(body.variant || '');
  const lang = body.lang as string | undefined;
  const result = await mutate(env, cat, (cards) => {
    const c = cards.find((x) => matches(x, id, variant, lang));
    if (!c) return null;
    const changes: Record<string, { old: unknown; new: unknown }> = {};
    if ('language' in body) {
      changes.language = { old: c.language, new: body.language };
      c.language = String(body.language);
    }
    if ('quantity' in body) {
      changes.quantity = { old: c.quantity ?? 1, new: Number(body.quantity) };
      c.quantity = Number(body.quantity);
    }
    if ('cop' in body) {
      changes.cop = { old: c.cop ?? 0, new: Number(body.cop) };
      c.cop = Number(body.cop);
    }
    return { card: c, changes };
  });
  if (result && Object.keys(result.changes).length) {
    await logAction(env, cat, {
      type: 'update',
      card_id: id,
      card_name: result.card.name,
      number: result.card.number,
      variant,
      changes: result.changes,
      source: 'web',
    });
  }
  return json({ ok: true });
}

async function handleRefreshOne(env: CatalogoEnv, cat: string, body: Record<string, any>) {
  const id = String(body.id || '');
  const variant = String(body.variant || 'normal');
  const tcg = await fetchCardPrices(id, new Budget(env.POKEMONTCG_API_KEY));
  const market = tcg?.prices?.[variant]?.market;
  if (!market) return json({ ok: true, updated: false });
  await mutate(env, cat, (cards) => {
    const c = cards.find((x) => matches(x, id, variant, body.lang));
    if (c) {
      c.market_price_usd = market;
      c.last_price_update = nowMinute();
    }
  });
  return json({ ok: true, updated: true, market });
}

/**
 * Venta: descuenta stock de varias cartas en un solo cambio atómico y deja el registro.
 * Si alguna carta no tiene stock suficiente, no se descuenta nada.
 */
async function handleSale(env: CatalogoEnv, cat: string, body: Record<string, any>, userName: string) {
  const customer = String(body.customer || '').trim();
  const items = (body.items || []) as Array<{ id: string; variant: string; language: string; qty: number }>;
  if (!customer) return json({ error: 'nombre del cliente requerido' }, 400);
  if (!items.length) return json({ error: 'no hay cartas en la venta' }, 400);

  const sold = await mutate(env, cat, (cards) => {
    const lines: Array<Record<string, unknown>> = [];
    for (const it of items) {
      const qty = Math.floor(Number(it.qty || 0));
      if (qty <= 0) throw new HttpError(400, 'cantidad inválida');
      const c = cards.find((x) => matches(x, it.id, it.variant, it.language));
      if (!c) throw new HttpError(404, `carta no encontrada: ${it.id}`);
      if ((c.quantity || 0) < qty) {
        throw new HttpError(409, `${c.name} ${c.number}: solo hay ${c.quantity || 0} en stock`);
      }
      c.quantity = (c.quantity || 0) - qty;
      lines.push({
        card_id: c.id,
        card_name: c.name,
        number: c.number,
        set_name: c.set_name,
        variant: c.variant,
        language: c.language,
        qty,
        cop: c.cop,
        qty_left: c.quantity,
      });
    }
    return lines;
  });

  const suggested = sold.reduce((s, l) => s + Number(l.cop) * Number(l.qty), 0);
  const total = Number(body.total_cop || 0) > 0 ? Number(body.total_cop) : suggested;
  await logAction(env, cat, {
    type: 'sale',
    date: today(),
    customer,
    cards: sold.map((l) => `${l.card_name} ${l.number} x${l.qty}`),
    items: sold,
    total_cop: total,
    suggested_total_cop: suggested,
    payment_method: body.payment_method || '',
    notes: body.notes || '',
    registered_by: userName,
    source: 'web',
  });
  return json({ ok: true, items: sold, total_cop: total });
}

// ---------- Fotos propias ----------

const MAX_IMG_BYTES = 1_500_000;
const IMG_MIMES = ['image/jpeg', 'image/png', 'image/webp'];

/** Cambia la foto de una carta: por foto subida (data_url) o por enlace (url). */
async function handleImage(env: CatalogoEnv, cat: string, body: Record<string, any>) {
  const id = String(body.id || '');
  const variant = String(body.variant || '');
  const lang = body.lang as string | undefined;
  let image: string;

  if (body.data_url) {
    const m = String(body.data_url).match(/^data:(image\/[a-z]+);base64,(.+)$/);
    if (!m || !IMG_MIMES.includes(m[1])) return json({ error: 'formato de imagen no soportado (usa JPG, PNG o WEBP)' }, 400);
    const bytes = Uint8Array.from(atob(m[2]), (ch) => ch.charCodeAt(0));
    if (bytes.byteLength > MAX_IMG_BYTES) return json({ error: 'la imagen pesa demasiado' }, 400);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const key = [...new Uint8Array(digest)].slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join('');
    await env.CATALOGO_DB.prepare(
      'INSERT OR IGNORE INTO catalogo_imagenes (key, mime, data, created_at) VALUES (?, ?, ?, ?)',
    )
      .bind(key, m[1], bytes, nowStamp())
      .run();
    image = `/api/catalogo/img/${key}`;
  } else if (body.url) {
    const url = String(body.url).trim();
    if (!/^https:\/\/\S+$/i.test(url)) return json({ error: 'el enlace debe empezar por https://' }, 400);
    image = url;
  } else {
    return json({ error: 'falta la foto o el enlace' }, 400);
  }

  const result = await mutate(env, cat, (cards) => {
    const c = cards.find((x) => matches(x, id, variant, lang));
    if (!c) throw new HttpError(404, 'carta no encontrada');
    const old = c.image;
    c.image = image;
    return { card: c, old };
  });
  await logAction(env, cat, {
    type: 'update',
    card_id: id,
    card_name: result.card.name,
    number: result.card.number,
    variant,
    changes: { image: { old: result.old, new: image } },
    source: 'web',
  });
  return json({ ok: true, image });
}

async function serveImage(env: CatalogoEnv, key: string) {
  if (!/^[0-9a-f]{32}$/.test(key)) return json({ error: 'not found' }, 404);
  const row = await env.CATALOGO_DB.prepare('SELECT mime, data FROM catalogo_imagenes WHERE key = ?')
    .bind(key)
    .first<{ mime: string; data: ArrayBuffer | number[] }>();
  if (!row) return json({ error: 'not found' }, 404);
  const data = row.data instanceof ArrayBuffer ? new Uint8Array(row.data) : new Uint8Array(row.data);
  return new Response(data, {
    headers: { 'Content-Type': row.mime, 'Cache-Control': 'private, max-age=31536000, immutable' },
  });
}

// ---------- Router ----------

export async function handleCatalogoApi(request: Request, url: URL, env: CatalogoEnv, userName: string): Promise<Response> {
  const route = url.pathname.replace(/^\/api\/catalogo/, '');
  const method = request.method.toUpperCase();
  try {
    if (method === 'GET') {
      if (route === '/catalogs') {
        const { results } = await env.CATALOGO_DB.prepare('SELECT name, label, cards FROM catalogos ORDER BY name').all<{
          name: string;
          label: string;
          cards: string;
        }>();
        return json(
          results.map((r) => ({
            name: r.name,
            label: r.label,
            count: (JSON.parse(r.cards) as Card[]).filter((c) => (c.quantity || 0) > 0).length,
          })),
        );
      }
      if (route === '/catalog') {
        const cat = await loadCatalog(env, url.searchParams.get('catalog') || 'fullart');
        return json(cat ? { label: cat.label, cards: cat.cards } : { label: '', cards: [] });
      }
      if (route === '/log') {
        const limit = Math.min(Number(url.searchParams.get('limit') || 300), 2000);
        const { results } = await env.CATALOGO_DB.prepare(
          'SELECT entry FROM catalogo_log WHERE catalog = ? ORDER BY id DESC LIMIT ?',
        )
          .bind(url.searchParams.get('catalog') || 'fullart', limit)
          .all<{ entry: string }>();
        return json(results.map((r) => JSON.parse(r.entry)));
      }
      if (route.startsWith('/img/')) return await serveImage(env, route.slice('/img/'.length));
      if (route === '/search') return await handleSearch(url.searchParams.get('q') || '', env.POKEMONTCG_API_KEY);
      return json({ error: 'not found' }, 404);
    }

    if (method === 'POST') {
      let body: Record<string, any> = {};
      try {
        body = await request.json();
      } catch {
        return json({ error: 'Body no es JSON válido' }, 400);
      }
      const cat = String(body.catalog || 'fullart');
      switch (route) {
        case '/catalogs/create':
          return await handleCreate(env, body);
        case '/add':
          return await handleAdd(env, cat, body);
        case '/remove':
          return await handleRemove(env, cat, body);
        case '/update':
          return await handleUpdate(env, cat, body);
        case '/refresh-one':
          return await handleRefreshOne(env, cat, body);
        case '/image':
          return await handleImage(env, cat, body);
        case '/sale':
          return await handleSale(env, cat, body, userName);
      }
      return json({ error: 'not found' }, 404);
    }
    return json({ error: 'Método no soportado' }, 405);
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    return json({ error: (e as Error).message || 'error interno' }, 500);
  }
}
