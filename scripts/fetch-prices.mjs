// Fetches current TCGPlayer market prices for the featured cards of each
// expansion and writes them to src/data/card-prices.json. Runs at build time,
// so prices get refreshed on every deploy (every git push).
//
// Source: https://pokemontcg.io/ (TCGPlayer data, updated daily)

import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const expansionsDir = path.resolve('./src/content/expansiones');
const outputFile = path.resolve('./src/data/card-prices.json');

// Extract card id from either old-style pokemontcg.io URLs
// ("https://images.pokemontcg.io/me1/181_hires.png" -> "me1-181")
// or new scrydex.com URLs for recent sets
// ("https://images.scrydex.com/pokemon/me3-124/large" -> "me3-124")
function extractCardId(imageUrl) {
  if (!imageUrl) return null;
  // pokemontcg.io uses "SETID/CARDNUM_hires.png" or "SETID/CARDNUM_SUFFIX_hires.png"
  // (cel25c has cards like 4_A where "_A" is part of the card ID, not the _hires suffix)
  const pkmntcg = imageUrl.match(/pokemontcg\.io\/([^/]+)\/(.+?)(?:_hires)?\.(?:png|jpg|webp)$/);
  if (pkmntcg) return `${pkmntcg[1]}-${pkmntcg[2]}`;
  const scrydex = imageUrl.match(/scrydex\.com\/pokemon\/([^/]+)/);
  if (scrydex) return scrydex[1];
  return null;
}

async function fetchCardPrice(cardId) {
  try {
    const res = await fetch(`https://api.pokemontcg.io/v2/cards/${cardId}`);
    if (!res.ok) return null;
    const { data } = await res.json();
    const prices = data?.tcgplayer?.prices ?? {};
    const [variant, info] = Object.entries(prices)[0] ?? [];
    // Return entry even without market price — the TCGPlayer URL is still
    // useful and the UI will gracefully omit the price badge when missing.
    return {
      name: data.name,
      rarity: data.rarity,
      variant: variant ?? null,
      market: info?.market ?? null,
      low: info?.low ?? null,
      high: info?.high ?? null,
      updatedAt: data.tcgplayer?.updatedAt ?? null,
      tcgplayerUrl: data.tcgplayer?.url ?? null,
    };
  } catch (err) {
    console.error(`[prices] error fetching ${cardId}:`, err.message);
    return null;
  }
}

async function main() {
  const files = (await readdir(expansionsDir)).filter((f) => f.endsWith('.md'));
  const result = {};

  for (const file of files) {
    const slug = file.replace(/\.md$/, '');
    const content = await readFile(path.join(expansionsDir, file), 'utf-8');
    const match = content.match(/cartaDestacada:\s*["']([^"']+)["']/);
    const cardId = extractCardId(match?.[1]);
    if (!cardId) continue;

    const price = await fetchCardPrice(cardId);
    if (price) {
      result[slug] = { cardId, ...price };
      console.log(`[prices] ${slug.padEnd(22)} ${price.name.padEnd(24)} $${price.market}`);
    } else {
      console.warn(`[prices] ${slug.padEnd(22)} no price data`);
    }
  }

  await mkdir(path.dirname(outputFile), { recursive: true });
  await writeFile(
    outputFile,
    JSON.stringify({ fetchedAt: new Date().toISOString(), prices: result }, null, 2)
  );
  console.log(`[prices] wrote ${Object.keys(result).length} entries to ${path.relative(process.cwd(), outputFile)}`);
}

main().catch((err) => {
  console.error('[prices] fatal error:', err);
  process.exit(0);
});
