/**
 * Basic Auth para todo /api/*
 * Mismos usuarios que /admin/*. También expone el nombre del usuario autenticado en
 * el request para que los endpoints puedan auditar quién carga cada pedido.
 */

interface Env {
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

export const onRequest: PagesFunction<Env> = async ({ request, env, next, data }) => {
  const creds = decodeBasic(request.headers.get('Authorization'));
  if (!creds) return unauthorized();

  const pares: Array<[string | undefined, string | undefined, string]> = [
    [env.EBAY_USER_CARLOS, env.EBAY_PASS_CARLOS, 'carlos'],
    [env.EBAY_USER_SOBRINO, env.EBAY_PASS_SOBRINO, 'sobrino'],
  ];

  const match = pares.find(([u, p]) => u && p && safeEqual(creds.user, u) && safeEqual(creds.pass, p));
  if (!match) return unauthorized();

  (data as Record<string, unknown>).userTag = match[2];
  (data as Record<string, unknown>).userName = creds.user;
  return next();
};
