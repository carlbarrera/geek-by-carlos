# CLAUDE.md — Geek By Carlos

Este archivo le da contexto completo a Claude sobre el proyecto. **Léelo siempre al iniciar una sesión nueva.**

---

## ¿Qué es este proyecto?

**Geek By Carlos** ([geekbycarlos.com](https://geekbycarlos.com)) — blog personal sobre **Pokémon Trading Card Game** y cultura geek, propiedad de Carlos Fernando Barrera Narváez.

- **Audiencia:** coleccionistas y jugadores de Pokémon TCG en Colombia y LatAm
- **Idioma:** **siempre en español** (mexicano-colombiano neutro), nunca inglés en el contenido
- **Tono:** cercano, honesto, técnico cuando hace falta, con humor sutil. NO corporate. NO entusiasta excesivo. Carlos habla como si estuviera explicándole a un amigo en una cafetería.
- **Plan a futuro:** abrir tienda online de producto sellado Pokémon TCG (ya hay página `/tienda` con vista previa, pero no vende todavía)

---

## Stack técnico

- **Framework:** Astro 6 + MDX
- **Estilos:** Tailwind CSS 4 (config en `src/styles/global.css`)
- **TypeScript:** strict mode
- **Content Collections:** posts en `src/content/blog/` (`.mdx`), expansiones en `src/content/expansiones/` (`.md`)
- **Hosting:** Cloudflare Workers (auto-deploy en cada `git push origin main`)
- **Dominio:** `geekbycarlos.com` (Cloudflare Registrar)
- **Repo:** [github.com/carlbarrera/geek-by-carlos](https://github.com/carlbarrera/geek-by-carlos)
- **Worker URL backup:** `geek-by-carlos.carlosbarrera28.workers.dev`

**Gotcha crítico:** NO uses `node:fs`, `node:path` ni otros módulos Node de runtime en componentes/páginas. Cloudflare Workers no los tiene y rompen el build en `prerendering static routes`. Si necesitas acceso a filesystem, hazlo en `scripts/` (build time), no en runtime.

---

## Estructura del proyecto

```
geek-by-carlos/
├── CLAUDE.md                          ← este archivo
├── HANDOVER.md                        ← guía para el editor humano
├── astro.config.mjs
├── package.json                       ← scripts: dev / build (prebuild = fetch-prices) / preview
├── scripts/
│   └── fetch-prices.mjs              ← actualiza precios TCGPlayer en cada build
├── public/
│   ├── logo.jpeg                      ← logo principal (Game Boy + guantelete + Pokébola)
│   ├── favicon.svg                    ← Shiny Rayquaza 8-bit
│   ├── pokeball.svg                   ← Pokébola decorativa
│   └── favicon-pokeball-classic.svg   ← variante backup
├── src/
│   ├── components/
│   │   ├── Header.astro               ← navegación principal
│   │   ├── Footer.astro
│   │   ├── PostCard.astro             ← tarjeta de post en home/listados
│   │   ├── ExpansionCard.astro        ← tarjeta de set en /expansiones
│   │   └── blog/                      ← componentes para usar dentro de posts MDX
│   │       ├── Callout.astro          ← cajas info/tip/warning/danger/success
│   │       ├── CardShowcase.astro     ← perfil completo de una carta
│   │       ├── MiniCard.astro         ← carta compacta para grids/rankings
│   │       ├── CardGrid.astro         ← wrapper responsive de cartas
│   │       ├── PriceTable.astro       ← tabla con medallas y total
│   │       ├── StatsBox.astro         ← 2-4 stats coloreados
│   │       └── EraCard.astro          ← card de era con imagen
│   ├── content/
│   │   ├── blog/                      ← posts en MDX
│   │   └── expansiones/               ← sets de Pokémon en MD (con frontmatter)
│   ├── content.config.ts              ← schemas de content collections
│   ├── data/
│   │   └── card-prices.json           ← precios actuales (generado por fetch-prices.mjs)
│   ├── layouts/
│   │   └── BaseLayout.astro
│   ├── pages/
│   │   ├── index.astro                ← home (hero + featured + recientes + expansiones)
│   │   ├── blog/[...slug].astro
│   │   ├── expansiones/[...slug].astro
│   │   ├── sobre.astro
│   │   └── tienda.astro
│   └── styles/
│       └── global.css                 ← tema Shiny Rayquaza (gold) + Lugia (silver/blue)
```

---

## Paleta de colores (Shiny Rayquaza + Lugia)

Definida en `src/styles/global.css`:

| Variable CSS | Hex | Uso |
|---|---|---|
| `--color-bg` | `#070b16` | Fondo principal (navy oscuro) |
| `--color-bg-elev` | `#111830` | Fondo elevado (header, footer) |
| `--color-bg-card` | `#18213d` | Cards |
| `--color-border` | `#293354` | Bordes |
| `--color-text` | `#eaeef9` | Texto principal |
| `--color-text-dim` | `#a4afc8` | Texto secundario |
| `--color-accent` | `#fbbf24` | **Gold Rayquaza Shiny** (acento primario) |
| `--color-accent-2` | `#3b82f6` | **Azul Lugia** |
| `--color-accent-3` | `#c5d1e5` | **Plateado Lugia** |
| `--color-accent-4` | `#ef4444` | Rojo (ojos Lugia, alertas) |

**Gradientes:**
- `.holo-gradient` — multicolor (oro → naranja → rojo → azul → plata)
- `.rayquaza-gradient` — todo oro
- `.lugia-gradient` — plata → azul

---

## Cómo escribir un POST NUEVO

### 1. Estructura del archivo

Crear en `src/content/blog/[slug-del-post].mdx` (NO `.md`):

```mdx
---
title: "Título del post (atractivo, 50-80 caracteres)"
description: "Resumen SEO de 140-160 caracteres. Aparece en Google y al compartir."
pubDate: 2026-05-23
category: "Pokémon TCG"   # o "Reviews" | "Guías" | "Noticias" | "Personal"
tags: ["tag1", "tag2", "tag3"]
featured: true             # solo el más reciente debe ser true (unfeature los anteriores)
---

import Callout from '../../components/blog/Callout.astro';
import StatsBox from '../../components/blog/StatsBox.astro';
import CardShowcase from '../../components/blog/CardShowcase.astro';
import CardGrid from '../../components/blog/CardGrid.astro';
import MiniCard from '../../components/blog/MiniCard.astro';
import PriceTable from '../../components/blog/PriceTable.astro';
import EraCard from '../../components/blog/EraCard.astro';

[Cuerpo del post en MDX...]
```

### 2. Reglas de contenido

- **NUNCA wall of text.** Cada 2-3 párrafos debe ir un componente visual (Callout, CardShowcase, StatsBox, etc.).
- **Imágenes son obligatorias.** Si hablas de una carta, **muéstrala** con CardShowcase o MiniCard.
- **Precios siempre verificados.** Antes de citar un precio, consulta la API: `curl "https://api.pokemontcg.io/v2/cards/CARDID"` o el archivo `src/data/card-prices.json`.
- **Links internos a otros posts.** Cada nuevo post debe linkear a 1-2 posts previos para SEO.
- **Cierre con teaser del próximo post.** Mantiene a los lectores volviendo.
- **Firma:** termina con `*— Carlos*`
- **Featured rotation:** al publicar un post nuevo, **pon `featured: false` en el post anterior featured** para que el nuevo sea el destacado del home.

### 3. Workflow técnico

```bash
# 1. Crear el archivo .mdx en src/content/blog/
# 2. Verificar build local (opcional pero recomendado)
cd ~/Desktop/geek-by-carlos
npm run build

# 3. Commit con mensaje descriptivo
git add -A
git commit -m "blog: titulo del post"

# 4. Push (auto-despliega en Cloudflare)
git push origin main

# 5. Esperar ~2 min y verificar
curl -s -o /dev/null -w "%{http_code}\n" "https://geekbycarlos.com/blog/[slug]/"
# debe devolver 200
```

---

## Componentes de blog disponibles

### `<Callout type="..." title="...">`
Cajas resaltadas. Tipos: `info`, `tip`, `warning`, `danger`, `success`.

```mdx
<Callout type="warning" title="Cuidado con esto">
  Texto del callout. Soporta **negrita**, *cursiva*, [links](/blog/otro-post/).
</Callout>
```

### `<CardShowcase ...>`
Perfil completo de una carta. Usar para cartas individuales importantes.

```mdx
<CardShowcase
  image="https://images.pokemontcg.io/me2/125_hires.png"
  name="Mega Charizard X ex"
  number="125"
  set="Phantasmal Flames (me2)"
  hp={360}
  type="Fuego (Stage 2 · MEGA · ex)"
  illustrator="Special Illustration Rare"
  price={889.17}
  tcgplayerUrl="https://prices.pokemontcg.io/tcgplayer/me2-125"
  color="#ef4444"
  tagline="🔥 La chase del año"
>
  Texto del cuerpo. Acepta **markdown** dentro.
</CardShowcase>
```

### `<MiniCard ...>`
Versión compacta. Para grids y rankings.

```mdx
<MiniCard
  image="https://images.pokemontcg.io/me2/125_hires.png"
  name="Mega Charizard X ex"
  number="125"
  price={889.17}
  color="#ef4444"
  tcgplayerUrl="https://prices.pokemontcg.io/tcgplayer/me2-125"
  rank="🥇"
/>
```

### `<CardGrid title="...">`
Envuelve MiniCards en grid responsive (1 col móvil / 2-3 desktop).

```mdx
<CardGrid title="Top 3 cartas más caras">
  <MiniCard ... />
  <MiniCard ... />
  <MiniCard ... />
</CardGrid>
```

### `<StatsBox title="..." stats={[...]}>`
Bloque de 2-4 stats con color, valor grande y hint pequeño.

```mdx
<StatsBox
  title="El post en cifras"
  stats={[
    { label: "Precio", value: "$889", hint: "TCGPlayer", color: "#ef4444" },
    { label: "Cambio 5d", value: "+6.4%", hint: "Subiendo", color: "#22c55e" },
  ]}
/>
```

### `<PriceTable rows={[...]} title="..." total={true}>`
Tabla de precios con medallas 🥇🥈🥉 y total automático.

```mdx
<PriceTable
  title="Top 10"
  total={true}
  rows={[
    { rank: 1, name: "Carta X", price: 100.50, color: "#fbbf24", note: "Set Y" },
  ]}
/>
```

### `<EraCard ...>`
Card de era con imagen de carta icónica. Para timelines históricos.

```mdx
<EraCard
  step={1}
  name="WotC Base"
  years="1999-2003"
  image="https://images.pokemontcg.io/base1/4_hires.png"
  cardName="Charizard #4 Base Set"
  mechanic="Las raíces del TCG..."
  color="#ef4444"
/>
```

---

## Cómo agregar una EXPANSIÓN nueva

Crear en `src/content/expansiones/[slug].md`:

```md
---
nombre: "Nombre del Set"
codigo: "ABC"
serie: "Mega Evolution"   # o "Scarlet & Violet" | "Sword & Shield"
fechaLanzamiento: 2025-09-26
totalCartas: 188
descripcion: "Descripción de 1-2 líneas..."
color: "#9333ea"
destacada: true            # opcional, marca como expansión destacada
cartaDestacada: "https://images.pokemontcg.io/SETID/NUMERO_hires.png"
cartaDestacadaAlt: "Alt text de la carta"
---

## ¿De qué va este set?

Contenido en markdown plano.
```

**Importante:** después de agregar una expansión nueva, **correr el script de precios**:

```bash
node scripts/fetch-prices.mjs
```

Esto actualiza `src/data/card-prices.json` con el precio actual de la carta destacada.

---

## Cómo obtener datos de una carta Pokémon

**Pokémon TCG API** (gratis, sin API key): `https://api.pokemontcg.io/v2`

### Buscar una carta por nombre

```bash
curl "https://api.pokemontcg.io/v2/cards?q=name:Charizard%20set.id:me2&pageSize=10"
```

### Detalles de una carta específica

```bash
curl "https://api.pokemontcg.io/v2/cards/me2-125"
```

Devuelve JSON con:
- `name`, `hp`, `types`, `subtypes`, `evolvesFrom`
- `attacks[]` (nombre, costo, daño, texto)
- `weaknesses`, `resistances`, `retreatCost`
- `set` (nombre, fecha, etc.)
- `images.large` (URL de imagen)
- `tcgplayer.prices` (precios actuales por variante)
- `tcgplayer.url` (link a TCGPlayer)

### URLs de imágenes (formato estándar)

```
https://images.pokemontcg.io/[SET_ID]/[CARD_NUMBER]_hires.png
```

**Para sets recientes** (me2pt5 Ascended Heroes en adelante), las imágenes están en:
```
https://images.scrydex.com/pokemon/[SET_ID]-[CARD_NUMBER]/large
```

Si una URL devuelve 404, probar con la otra.

### Set IDs comunes

| Era | IDs |
|---|---|
| Base Set | `base1` |
| EX era | `ex1`...`ex16` |
| Diamond & Pearl | `dp1`...`dp7`, `pl1`...`pl4` |
| Black & White | `bw1`...`bw11` |
| XY | `xy1`...`xy12` |
| Sun & Moon | `sm1`...`sm12`, `sm115` (Hidden Fates) |
| Sword & Shield | `swsh1`...`swsh12`, `swsh12pt5` (Crown Zenith), `swsh35` (Champion's Path) |
| Scarlet & Violet | `sv1`...`sv10`, `sv3pt5` (151), `sv4pt5` (Paldean Fates), `sv6pt5` (Shrouded Fable), `sv8pt5` (Prismatic Evolutions) |
| Black Bolt / White Flare | `zsv10pt5` / `rsv10pt5` |
| Mega Evolution | `me1`, `me2`, `me2pt5`, `me3` |

---

## Tono de voz (CRÍTICO)

Carlos escribe con **honestidad técnica** y **cero corporate speak**.

### ✅ Estilo Carlos:
- "Charizard Base Set Unlimited vale $556 USD raw — punto."
- "Si te ofrecen una booster box auténtica de Base Set por $300K COP, es 100% falsa."
- "Lección aprendida: nunca asumir sin verificar la API."
- "Esto es marketing de The Pokémon Company. Saben que Charizard vende sobres."

### ❌ Evitar:
- "¡Bienvenidos amigos coleccionistas! Hoy vamos a hablar de..."
- "En el fascinante mundo del Pokémon TCG..."
- "Sin lugar a dudas, esta es una carta increíblemente espectacular."
- Emojis decorativos en cada párrafo (sí emojis funcionales tipo ⭐🥇)

### Patrones recurrentes
- Usar **negritas** para enfatizar datos importantes (precios, porcentajes, fechas)
- Mencionar **fuentes reales** (TCGPlayer, pkmn.gg, Reddit r/PokemonTCG)
- Incluir **callouts de "danger"** cuando se hable de estafas o riesgos
- Cerrar con **predicción específica** o **teaser de siguiente post**
- Citar siempre **precio actual** + **fecha de consulta** ("TCGPlayer market price, abril 2026")

---

## Restricciones de derechos de autor

El sitio es **proyecto personal sin afiliación oficial**. Reglas:

- ✅ **Sí se puede:** mencionar nombres de Pokémon, sets, cartas, precios reales
- ✅ **Sí se puede:** usar imágenes de cartas de la API pública de Pokémon TCG (fair use editorial)
- ❌ **NO se puede:** usar el logo oficial de Pokémon ni Pokémon Company
- ❌ **NO se puede:** vender producto NO original (cuando la tienda abra, solo sellado oficial)
- ✅ **Siempre incluir disclaimer:** "Pokémon y nombres relacionados son propiedad de Nintendo, Game Freak y The Pokémon Company. Este sitio es un proyecto personal independiente."

El footer del sitio ya incluye este disclaimer automáticamente.

---

## Posts existentes (referencia)

Lista actualizada cada vez que sale un post nuevo:

| Fecha | Slug | Categoría |
|---|---|---|
| 2026-05-23 | `charizard-a-traves-de-las-eras` | Pokémon TCG |
| 2026-05-02 | `glosario-pokemon-tcg-2026` | Guías |
| 2026-04-30 | `top-10-cartas-mas-caras-tcg-moderno` | Pokémon TCG |
| 2026-04-28 | `mega-charizard-x-sir-review` | Reviews |
| 2026-04-27 | `como-detectar-cartas-pokemon-falsas` | Guías |
| 2026-04-26 | `base-set-1999-las-16-holograficas` | Pokémon TCG |
| 2026-04-24 | `historia-del-pokemon-tcg` | Pokémon TCG |
| 2026-04-23 | `bienvenida` | Personal |
| 2026-04-20 | `guia-empezar-coleccionar-pokemon-tcg` | Guías |
| 2026-04-15 | `scarlet-violet-impacto` | Reviews |

**Post pendiente prometido:** "5 Pokémon que NO son Charizard que cualquier coleccionista debe tener" (incluir Eevee, Lugia, Mewtwo, Pikachu, Umbreon).

---

## Workflow típico al recibir un pedido

Cuando Carlos (o el editor) diga: **"escribe un post sobre X"**:

1. **Verificar datos en API** antes de escribir (precios, IDs de cartas, nombres exactos)
2. **Crear archivo MDX** con frontmatter completo
3. **Estructurar con componentes**: cada sección importante con un CardShowcase, Callout o StatsBox
4. **Linkear posts previos relacionados**
5. **Unfeature post anterior** si el nuevo es featured
6. **Build local** (`npm run build`) para verificar que no rompa
7. **Commit con mensaje descriptivo**
8. **Push** y verificar deploy 200 OK en ~2 min
9. **Actualizar esta tabla "Posts existentes"** en CLAUDE.md

---

## Comandos útiles

```bash
# Dev server local (con HMR)
npm run dev

# Build de producción
npm run build

# Actualizar todos los precios TCGPlayer
node scripts/fetch-prices.mjs

# Verificar status de un post en producción
curl -s -o /dev/null -w "%{http_code}\n" "https://geekbycarlos.com/blog/SLUG/"

# Ver últimos commits
git log --oneline -10

# Ver posts actuales del blog
ls src/content/blog/
```

---

## Email del proyecto

`carlos@geekbycarlos.com` — Cloudflare Email Routing → `carlosbarrera28@hotmail.com`

NO usar `carlisbarrera29@gmail.com` (email viejo) en ningún post o página.

---

**Última actualización de este archivo:** 2026-05-23 — al cierre del post "Charizard a través de las eras"
