# HANDOVER.md — Guía para el editor de Geek By Carlos

Hola — si estás leyendo esto, Carlos te confió la administración del blog **Geek By Carlos** ([geekbycarlos.com](https://geekbycarlos.com)). Esta guía te lleva paso a paso desde cero hasta publicar tu primer post.

---

## TL;DR — En 5 minutos

1. Pídele a Carlos que te agregue como **colaborador** en `github.com/carlbarrera/geek-by-carlos`
2. Instala **Claude Code** ([claude.com/claude-code](https://claude.com/claude-code)) — gratis con cuenta Anthropic
3. Clona el repo: `git clone https://github.com/carlbarrera/geek-by-carlos.git`
4. Abre Claude Code en esa carpeta
5. Pega el prompt de la sección **"Tu primera sesión"** abajo, y Claude hace el resto

---

## Setup completo (~30 min, una sola vez)

### 1. Cuenta de GitHub

Si no tienes, créala en [github.com/signup](https://github.com/signup) (gratis).

Dile a Carlos tu **username de GitHub** (NO el email — el handle público, ej: `juanperez`).

Carlos te va a agregar como **colaborador con permiso de write** en el repo `geek-by-carlos`. Te llegará una invitación por email — **acéptala**.

### 2. Instalar Claude Code

[claude.com/claude-code](https://claude.com/claude-code) — descarga e instala. Requiere cuenta Anthropic (gratis o con plan).

### 3. Instalar Git y Node.js (si no los tienes)

**Mac:**
```bash
# Instalar Homebrew si no lo tienes
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Instalar git y node
brew install git node
```

**Windows:**
- Descarga [Git for Windows](https://git-scm.com/download/win)
- Descarga [Node.js LTS](https://nodejs.org/en/download)

**Verificar:**
```bash
git --version    # debe mostrar 2.x.x o más
node --version   # debe mostrar v22 o v25
```

### 4. Configurar Git con tu identidad

```bash
git config --global user.name "Tu Nombre"
git config --global user.email "tu@email.com"
```

### 5. Autenticarse con GitHub desde la terminal

La forma más fácil es instalar **GitHub CLI**:

```bash
# Mac
brew install gh

# Windows: descargar de https://cli.github.com
```

Luego:
```bash
gh auth login
```

Sigue los prompts (elige GitHub.com → HTTPS → Yes a auth Git → Login with browser → pega código).

### 6. Clonar el repositorio

```bash
cd ~/Desktop   # o donde quieras tenerlo
git clone https://github.com/carlbarrera/geek-by-carlos.git
cd geek-by-carlos
```

### 7. Instalar dependencias del proyecto

```bash
npm install
```

Tarda 1-2 min. Una sola vez.

### 8. (Opcional) Probar que todo funciona

```bash
npm run dev
```

Te debe abrir el sitio en `http://localhost:4321`. Si lo ves, todo está bien.

`Ctrl+C` para detener el servidor.

---

## Tu primera sesión con Claude

Abre Claude Code en la carpeta del proyecto:

```bash
cd ~/Desktop/geek-by-carlos
claude
```

**Pégale exactamente este prompt en el primer mensaje:**

```
Hola Claude. Vengo de Carlos, soy el nuevo editor del blog Geek By Carlos.

Antes de hacer cualquier cosa, lee el archivo CLAUDE.md en la raíz del
proyecto — ahí está TODO el contexto que necesitas: stack, componentes,
workflow, tono de voz, gotchas técnicos y lista de posts actuales.

Cuando termines, dime "listo, ¿qué publicamos hoy?" y a partir de ahí
trabajamos como lo hace Carlos: yo te digo el tema, tú escribes el post
en MDX usando los componentes existentes, haces commit y push, y
Cloudflare deploya solo.

Reglas importantes:
- Verificar SIEMPRE precios contra la Pokémon TCG API antes de citarlos
- NO usar node:fs ni node:path en componentes (rompe Cloudflare Workers)
- Tono Carlos: honesto, técnico, cercano. Nunca corporate.
- Idioma: español neutro colombiano-mexicano, nunca inglés en contenido
- Cada post lleva imágenes y componentes — NUNCA wall of text
```

Claude leerá el `CLAUDE.md` y queda contextualizado. Desde ese momento puedes pedirle cosas como las que verás abajo.

---

## Ejemplos de pedidos que puedes hacerle a Claude

### Publicar un post nuevo

```
Hagamos un post sobre [tema X].
```

O más específico:

```
Quiero un post sobre las 5 cartas más caras de Crown Zenith.
Verifica precios actuales en TCGPlayer, usa CardShowcase y MiniCard,
y publícalo con fecha de hoy como featured.
```

### Agregar una expansión nueva

```
Acaba de salir el set Mega Evolution 4 (me4). Búscalo en la API,
agrégalo a /expansiones con su chase card destacada,
y actualiza los precios.
```

### Actualizar precios

```
Corre el script de precios y dime qué cartas cambiaron más
en la última semana.
```

### Hacer un cambio menor

```
En el post de Base Set 1999, agrega un párrafo al final sobre
la diferencia entre 1st Edition y Shadowless.
```

### Verificar status del sitio

```
¿Cómo está el sitio? Tráeme estado actual del deploy,
último post publicado, y si hay errores 4xx/5xx.
```

### Pedir ideas

```
Dame 5 ideas de posts para esta semana. Que sean variadas y
con potencial de tráfico.
```

---

## Workflow de un post típico

Esto es lo que pasa cuando le pides un post a Claude:

1. **Investigación** — Claude consulta la API de Pokémon TCG para verificar precios, imágenes, datos
2. **Escritura** — Genera el archivo `.mdx` en `src/content/blog/[slug]/`
3. **Revisión visual** — Usa componentes (CardShowcase, Callout, etc.) en lugar de párrafos largos
4. **Featured rotation** — Unfeature el post anterior, marca el nuevo como featured
5. **Build local** — `npm run build` para verificar que no rompa nada
6. **Commit** — Mensaje descriptivo
7. **Push** — `git push origin main`
8. **Deploy** — Cloudflare construye y despliega en 2-3 min (automático)
9. **Verificación** — Claude hace `curl` para confirmar que la URL responde 200

**Tu rol:** decirle qué publicar y revisar el resultado. No tienes que escribir nada técnico ni tocar archivos a mano.

---

## ¿Y si algo sale mal?

### Si Claude hace un cambio que no te gusta

```
Reviértelo. Vuelve al estado del último commit.
```

O específico:

```
Borra el último post que escribiste, no me gustó el enfoque.
Vamos a rehacerlo con [nuevo enfoque].
```

### Si el sitio se rompe después de un push

```
El sitio dice 500 / no carga. ¿Qué pasa?
Mira el último deploy de Cloudflare y arregla.
```

Si es muy grave, **revertir el último commit**:

```bash
git revert HEAD
git push origin main
```

Cloudflare redespliega la versión anterior en 2 min.

### Si necesitas ayuda con algo del sitio que NO sea contenido

(Cambios de diseño, agregar nuevas páginas, configurar email, etc.)

**Pasa a Carlos** — eso ya entra en territorio de mantenimiento y él decide qué hacer.

---

## Lo que **NO** debes hacer

❌ **No subas información personal** de Carlos sin su autorización (teléfono, dirección, datos de la tarjeta, etc.)

❌ **No mezcles dinero en el sitio** sin coordinarlo con Carlos primero — si llega el momento de activar la tienda, lo hace él.

❌ **No cambies la paleta de colores** (Shiny Rayquaza + Lugia) ni el logo. Es parte de la identidad del proyecto.

❌ **No prometas servicios o compras** en posts del blog. Solo contenido editorial.

❌ **No inventes precios** ni datos. Siempre verifica con la API de Pokémon TCG o TCGPlayer directamente.

❌ **No publiques sin verificar build local** primero (`npm run build`).

❌ **No hagas force-push** (`git push -f`). Si algo está mal, usa `git revert` que es más seguro.

---

## Cosas que SÍ debes hacer

✅ **Publicar al menos 1 post por semana** para mantener ritmo

✅ **Variar las categorías**: Pokémon TCG, Reviews, Guías, Noticias, Personal

✅ **Linkear posts entre sí** — cuando hagas un post nuevo, referencia 1-2 posts viejos relacionados

✅ **Mantener el tono Carlos**: honesto, técnico, sin corporate speak (ver sección "Tono de voz" en `CLAUDE.md`)

✅ **Verificar siempre datos** antes de publicar — la única regla inquebrantable

✅ **Cierre con teaser** del siguiente post

✅ **Update de `CLAUDE.md`** cuando publiques algo importante — Claude lo necesita para futuras sesiones

---

## Contacto con Carlos

- **Email:** [carlos@geekbycarlos.com](mailto:carlos@geekbycarlos.com)
- **WhatsApp / Teléfono:** (pide a Carlos directamente)

Si tienes dudas que el `CLAUDE.md` no responde, escríbele directo.

---

## Recursos útiles

- **Pokémon TCG API** — [pokemontcg.io](https://pokemontcg.io) — precios y datos de cartas (gratis)
- **TCGPlayer** — [tcgplayer.com](https://www.tcgplayer.com) — precios de referencia
- **pkmn.gg** — [pkmn.gg](https://pkmn.gg) — base de datos visual de sets
- **Bulbapedia** — [bulbapedia.bulbagarden.net](https://bulbapedia.bulbagarden.net) — wiki Pokémon completa
- **Reddit r/PokemonTCG** — [reddit.com/r/PokemonTCG](https://reddit.com/r/PokemonTCG) — comunidad activa
- **Astro Docs** — [docs.astro.build](https://docs.astro.build) — si necesitas entender algún concepto técnico

---

**¡Bienvenido al equipo!** Si todo sale bien, la persona que está leyendo esto va a publicar al menos 30 posts antes de que termine 2026. 🚀

*— Documento entregado por Carlos · Mayo 2026*
