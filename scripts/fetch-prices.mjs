// Fetches current TCGPlayer market prices for the featured cards of each
// expansion and writes them to src/data/card-prices.json. Runs at build time,
// so prices get refreshed on every deploy (every git push).
//
// Source: https://pokemontcg.io/ (TCGPlayer data, updated daily)

import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const expansionsDir = path.resolve('./src/content/expansiones');
const outputFile = path.resolve('./src/data/card-prices.json');

// Extract "me1/181" from "https://images.pokemontcg.io/me1/181_hires.png"
function extractCardId(imageUrl) {
  if (!imageUrl) return null;
  const match = imageUrl.match(/pokemontcg\.io\/([^/]+)\/([^_/.]+)/);
  if (!match) return null;
  return `${match[1]}-${match[2]}`;
}

async function fetchCardPrice(cardId) {
  try {
    const res = await fetch(`https://api.pokemontcg.io/v2/cards/${cardId}`);
    if (!res.ok) return null;
    const { data } = await res.json();
    const prices = data?.tcgplayer?.prices ?? {};
    const [variant, info] = Object.entries(prices)[0] ?? [];
    if (!info) return null;
    return {
      name: data.name,
      rarity: data.rarity,
      variant,
      market: info.market,
      low: info.low,
      high: info.high,
      updatedAt: data.tcgplayer?.updatedAt,
      tcgplayerUrl: data.tcgplayer?.url,
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
