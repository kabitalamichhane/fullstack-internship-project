/** Rebuild the Elasticsearch product index from PostgreSQL. Run: npm run reindex */
import { es, ensureProductIndex, indexProduct, PRODUCT_INDEX } from '../lib/elastic';
import { prisma } from '../lib/prisma';

async function main() {
  await es.indices.delete({ index: PRODUCT_INDEX }).catch(() => undefined);
  await ensureProductIndex();
  const products = await prisma.product.findMany({ select: { id: true } });
  for (const p of products) await indexProduct(p.id);
  await es.indices.refresh({ index: PRODUCT_INDEX });
  console.log(`Indexed ${products.length} products`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
