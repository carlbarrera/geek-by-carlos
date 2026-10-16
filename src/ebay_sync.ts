/**
 * Sincronización de pedidos eBay (cuenta compradora) → KV, desde el botón del panel.
 * Port de ~/.pokemon_monitor/ebay_sync_kv.py: GetMyeBayBuying (imágenes/vendedor) + GetOrders,
 * mismo mapeo y mismo merge (se conserva lo cargado a mano: estado, notas, fechas, y
 * tracking/imagen cuando eBay no los trae). Solo escribe en KV los pedidos que cambiaron.
 */

export interface EbaySyncEnv {
  PEDIDOS_KV: KVNamespace;
  EBAY_APP_ID?: string;
  EBAY_DEV_ID?: string;
  EBAY_CERT_ID?: string;
  EBAY_USER_TOKEN?: string;
}

// ---------- XML mínimo (las respuestas de la Trading API son XML simple, sin prefijos) ----------

interface XNode {
  tag: string;
  children: XNode[];
  text: string;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
function decode(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return ENTITIES[e] ?? m;
  });
}

function parseXml(xml: string): XNode {
  const root: XNode = { tag: '#root', children: [], text: '' };
  const stack: XNode[] = [root];
  const re = /<!\[CDATA\[([\s\S]*?)\]\]>|<(\/?)([\w:.-]+)([^>]*?)(\/?)>|([^<]+)|<[?!][^>]*>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const top = stack[stack.length - 1];
    if (m[1] !== undefined) top.text += m[1];
    else if (m[3]) {
      const tag = m[3].includes(':') ? m[3].split(':').pop()! : m[3];
      if (m[2]) stack.pop();
      else {
        const node: XNode = { tag, children: [], text: '' };
        top.children.push(node);
        if (!m[5]) stack.push(node);
      }
    } else if (m[6] !== undefined) top.text += decode(m[6]);
  }
  return root;
}

/** Hijo directo por ruta "A/B/C". */
function child(n: XNode | undefined, path: string): XNode | undefined {
  let cur = n;
  for (const part of path.split('/')) cur = cur?.children.find((c) => c.tag === part);
  return cur;
}
function txt(n: XNode | undefined, path: string, def = ''): string {
  const c = child(n, path);
  return c ? c.text.trim() : def;
}
/** Todos los descendientes con ese tag (equivale a .//Tag). */
function all(n: XNode | undefined, tag: string, out: XNode[] = []): XNode[] {
  for (const c of n?.children ?? []) {
    if (c.tag === tag) out.push(c);
    all(c, tag, out);
  }
  return out;
}
function firstDeep(n: XNode | undefined, tag: string): XNode | undefined {
  return all(n, tag)[0];
}

// ---------- Trading API ----------

const CARRIERS: Record<string, string> = {
  USPS: 'USPS', UPS: 'UPS', FedEx: 'FedEx', DHL: 'DHL', Cainiao: 'Cainiao (China Post)',
  'eBay Standard Delivery': 'eBay Standard (USPS)', Other: 'Otro', ShippingMethodStandard: 'Standard',
  USPSPriority: 'USPS Priority', USPSFirstClass: 'USPS First Class', USPSGround: 'USPS Ground',
  UPSGround: 'UPS Ground', FedExHomeDelivery: 'FedEx Home Delivery',
};
const MANUAL_FIELDS = ['estado_personal', 'notas', 'fecha_envio_colombia', 'fecha_recibido'];

async function trading(env: EbaySyncEnv, call: string, inner: string): Promise<XNode> {
  const body =
    `<?xml version="1.0" encoding="utf-8"?><${call}Request xmlns="urn:ebay:apis:eBLBaseComponents">` +
    `<ErrorLanguage>en_US</ErrorLanguage><WarningLevel>High</WarningLevel>${inner}</${call}Request>`;
  const r = await fetch('https://api.ebay.com/ws/api.dll', {
    method: 'POST',
    headers: {
      'X-EBAY-API-COMPATIBILITY-LEVEL': '1193',
      'X-EBAY-API-DEV-NAME': env.EBAY_DEV_ID!,
      'X-EBAY-API-APP-NAME': env.EBAY_APP_ID!,
      'X-EBAY-API-CERT-NAME': env.EBAY_CERT_ID!,
      'X-EBAY-API-CALL-NAME': call,
      'X-EBAY-API-SITEID': '0',
      'X-EBAY-API-IAF-TOKEN': env.EBAY_USER_TOKEN!,
      'Content-Type': 'text/xml',
    },
    body,
  });
  const resp = child(parseXml(await r.text()), `${call}Response`);
  const ack = txt(resp, 'Ack');
  if (ack !== 'Success' && ack !== 'Warning') {
    const errs = all(resp, 'Errors').map((e) => txt(e, 'LongMessage')).join(' | ');
    throw new Error(`${call} falló (HTTP ${r.status}): ${errs || 'sin detalle'}`);
  }
  return resp!;
}

type Pedido = Record<string, any>;

function mapOrder(order: XNode, itemMeta: Map<string, Record<string, string>>): Pedido {
  const f = (p: string) => txt(order, p);
  const shippingService = f('ShippingServiceSelected/ShippingService');
  const sc = child(order, 'ShippingServiceSelected/ShippingServiceCost');

  const trackings: Array<Record<string, string>> = [];
  const seen = new Set<string>();
  for (const td of all(order, 'ShipmentTrackingDetails')) {
    const num = txt(td, 'ShipmentTrackingNumber');
    const raw = txt(td, 'ShippingCarrierUsed');
    if (num && !seen.has(num)) {
      seen.add(num);
      trackings.push({ numero: num, carrier_raw: raw, carrier: CARRIERS[raw] ?? (raw || 'Sin carrier') });
    }
  }
  if (!trackings.length && shippingService) {
    for (const [k, v] of Object.entries(CARRIERS)) {
      if (shippingService.toLowerCase().includes(k.toLowerCase())) {
        trackings.push({ numero: '', carrier_raw: shippingService, carrier: v });
        break;
      }
    }
  }

  const ship = child(order, 'ShippingAddress');
  const shipAddress = ship
    ? {
        name: txt(ship, 'Name'), city: txt(ship, 'CityName'), state: txt(ship, 'StateOrProvince'),
        country: txt(ship, 'CountryName'), postal: txt(ship, 'PostalCode'),
      }
    : {};

  const items = (child(order, 'TransactionArray')?.children ?? [])
    .filter((t) => t.tag === 'Transaction' && child(t, 'Item'))
    .map((t) => {
      const item = child(t, 'Item');
      const price = Number(txt(t, 'TransactionPrice', '0')) || 0;
      const qty = parseInt(txt(t, 'QuantityPurchased', '1'), 10) || 1;
      const iid = txt(item, 'ItemID');
      const extra = itemMeta.get(iid) ?? {};
      return {
        item_id: iid,
        titulo: txt(item, 'Title'),
        url: txt(item, 'ListingDetails/ViewItemURL') || extra.url || `https://www.ebay.com/itm/${iid}`,
        imagen: txt(item, 'PictureDetails/GalleryURL') || extra.imagen || '',
        vendedor: txt(item, 'Seller/UserID') || extra.vendedor || '',
        precio: price,
        cantidad: qty,
        subtotal: price * qty,
      };
    });

  const ext = firstDeep(order, 'ExternalTransaction');
  const deep = (tag: string) => firstDeep(order, tag)?.text.trim() ?? '';
  return {
    order_id: f('OrderID'), items, num_items: items.length,
    total: Number(f('Total')) || 0, subtotal: Number(f('Subtotal')) || 0,
    envio: sc ? Number(sc.text) || 0 : 0, moneda: 'USD',
    fecha_compra: f('CreatedTime'), fecha_pago: f('PaidTime'), fecha_envio: f('ShippedTime'),
    order_status: f('OrderStatus'), checkout_status: f('CheckoutStatus/Status'),
    cancel_status: f('CancelStatus'), cancel_reason: f('CancelReason'),
    trackings, shipping_service: shippingService, ship_address: shipAddress,
    payment_methods: order.children.filter((c) => c.tag === 'PaymentMethods' && c.text.trim()).map((c) => c.text.trim()),
    payment_external_id: ext ? txt(ext, 'ExternalTransactionID') : '',
    payment_status: txt(firstDeep(order, 'MonetaryDetails'), 'Payments/Payment/PaymentStatus'),
    eta_min: deep('EstimatedDeliveryTimeMin'), eta_max: deep('EstimatedDeliveryTimeMax'),
    eta_native_min: deep('MinNativeEstimatedDeliveryTime'), eta_native_max: deep('MaxNativeEstimatedDeliveryTime'),
  };
}

async function fetchOrders(env: EbaySyncEnv, dias: number): Promise<Pedido[]> {
  const itemMeta = new Map<string, Record<string, string>>();
  const buy = await trading(
    env,
    'GetMyeBayBuying',
    '<WonList><Include>true</Include><Pagination><EntriesPerPage>200</EntriesPerPage>' +
      '<PageNumber>1</PageNumber></Pagination><DurationInDays>60</DurationInDays></WonList>',
  );
  for (const it of all(child(buy, 'WonList'), 'Item')) {
    const iid = txt(it, 'ItemID');
    if (iid && !itemMeta.has(iid)) {
      itemMeta.set(iid, {
        imagen: txt(it, 'PictureDetails/GalleryURL') || txt(it, 'GalleryURL'),
        url: txt(it, 'ListingDetails/ViewItemURL'),
        vendedor: txt(it, 'Seller/UserID'),
      });
    }
  }

  const iso = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, '.000Z');
  const now = new Date();
  const frm = iso(new Date(now.getTime() - dias * 86400000));
  const to = iso(now);
  const pedidos: Pedido[] = [];
  for (let page = 1; page <= 10; page++) {
    const root = await trading(
      env,
      'GetOrders',
      `<CreateTimeFrom>${frm}</CreateTimeFrom><CreateTimeTo>${to}</CreateTimeTo>` +
        '<OrderRole>Buyer</OrderRole><OrderStatus>All</OrderStatus>' +
        `<Pagination><EntriesPerPage>100</EntriesPerPage><PageNumber>${page}</PageNumber></Pagination>` +
        '<DetailLevel>ReturnAll</DetailLevel>',
    );
    for (const o of child(root, 'OrderArray')?.children ?? []) if (o.tag === 'Order') pedidos.push(mapOrder(o, itemMeta));
    if (txt(root, 'HasMoreOrders', 'false') !== 'true') break;
  }
  return pedidos.filter((p) => p.items.length);
}

function merge(nuevo: Pedido, viejo: Pedido | null): Pedido {
  if (!viejo) {
    for (const k of MANUAL_FIELDS) nuevo[k] = '';
    return nuevo;
  }
  for (const k of MANUAL_FIELDS) nuevo[k] = viejo[k] ?? '';
  if (!nuevo.trackings.some((t: Record<string, string>) => t.numero) && viejo.trackings?.length) nuevo.trackings = viejo.trackings;
  const oldItems: Pedido[] = viejo.items ?? [];
  nuevo.items.forEach((it: Pedido, i: number) => {
    if (!it.imagen && oldItems[i]?.imagen) it.imagen = oldItems[i].imagen;
  });
  return nuevo;
}

export async function ebaySync(env: EbaySyncEnv, dias = 90): Promise<Record<string, unknown>> {
  if (!env.EBAY_APP_ID || !env.EBAY_DEV_ID || !env.EBAY_CERT_ID || !env.EBAY_USER_TOKEN) {
    throw new Error('faltan las credenciales de eBay en Cloudflare (EBAY_APP_ID/DEV_ID/CERT_ID/USER_TOKEN)');
  }
  const pedidos = await fetchOrders(env, dias);
  const rawIndex = await env.PEDIDOS_KV.get('index');
  const index: string[] = rawIndex ? JSON.parse(rawIndex) : [];
  const inIndex = new Set(index);

  const nuevos: Pedido[] = [];
  let actualizados = 0;
  let sinCambios = 0;
  for (const p of pedidos) {
    const key = `pedido:${p.order_id}`;
    const oldRaw = inIndex.has(p.order_id) ? await env.PEDIDOS_KV.get(key) : null;
    const value = JSON.stringify(merge(p, oldRaw ? JSON.parse(oldRaw) : null));
    // Se compara el contenido normalizado: el script de Python escribe con otro formato.
    if (oldRaw && JSON.stringify(JSON.parse(oldRaw)) === value) {
      sinCambios++;
      continue;
    }
    await env.PEDIDOS_KV.put(key, value);
    if (inIndex.has(p.order_id)) actualizados++;
    else nuevos.push(p);
  }
  if (nuevos.length) {
    nuevos.sort((a, b) => String(b.fecha_compra).localeCompare(String(a.fecha_compra)));
    await env.PEDIDOS_KV.put('index', JSON.stringify([...nuevos.map((p) => p.order_id), ...index]));
  }
  return {
    ok: true,
    ebay: pedidos.length,
    nuevos: nuevos.length,
    actualizados,
    sin_cambios: sinCambios,
    total_panel: index.length + nuevos.length,
    dias,
  };
}
