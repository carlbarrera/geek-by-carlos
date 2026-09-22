/**
 * Basic Auth middleware para todo /admin/*
 * Lee usuarios/claves de las variables de entorno del proyecto Cloudflare Pages.
 * Variables esperadas:
 *   EBAY_USER_CARLOS  / EBAY_PASS_CARLOS
 *   EBAY_USER_SOBRINO / EBAY_PASS_SOBRINO
 * (Cualquiera de los dos pares es válido.)
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

export const onRequest: PagesFunction<Env> = async ({ request, env, next }) => {
  const creds = decodeBasic(request.headers.get('Authorization'));
  if (!creds) return unauthorized();

  const pares: Array<[string | undefined, string | undefined]> = [
    [env.EBAY_USER_CARLOS, env.EBAY_PASS_CARLOS],
    [env.EBAY_USER_SOBRINO, env.EBAY_PASS_SOBRINO],
  ];

  const ok = pares.some(([u, p]) => u && p && safeEqual(creds.user, u) && safeEqual(creds.pass, p));
  if (!ok) return unauthorized();

  return next();
};
