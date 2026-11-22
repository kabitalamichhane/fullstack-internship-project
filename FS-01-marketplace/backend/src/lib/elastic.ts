import { Client } from '@elastic/elasticsearch';
import { config } from '../config';
import { prisma } from './prisma';

export const es = new Client({ node: config.elasticUrl });
export const PRODUCT_INDEX = 'products';
const ELASTIC_RETRY_BASE_MS = 30_000;
const ELASTIC_RETRY_MAX_MS = 5 * 60_000;

let elasticFailureCount = 0;
let elasticRetryAt = 0;

export function shouldUseElasticsearch() {
  return Date.now() >= elasticRetryAt;
}

export function markElasticsearchAvailable() {
  elasticFailureCount = 0;
  elasticRetryAt = 0;
}

export function markElasticsearchUnavailable() {
  elasticFailureCount += 1;
  const retryDelay = Math.min(ELASTIC_RETRY_MAX_MS, ELASTIC_RETRY_BASE_MS * 2 ** Math.min(elasticFailureCount - 1, 4));
  elasticRetryAt = Date.now() + retryDelay;
}

export async function ensureProductIndex() {
  try {
    const exists = await es.indices.exists({ index: PRODUCT_INDEX });
    if (!exists) {
      await es.indices.create({
        index: PRODUCT_INDEX,
        mappings: {
          properties: {
            title: { type: 'text', fields: { keyword: { type: 'keyword' } } },
            description: { type: 'text' },
            categoryId: { type: 'keyword' },
            categorySlug: { type: 'keyword' },
            categoryName: { type: 'keyword' },
            vendorId: { type: 'keyword' },
            storeName: { type: 'keyword' },
            priceCents: { type: 'integer' },
            stock: { type: 'integer' },
            ratingAvg: { type: 'float' },
            ratingCount: { type: 'integer' },
            image: { type: 'keyword', index: false },
            isActive: { type: 'boolean' },
            createdAt: { type: 'date' },
          },
        },
      });
    }
    markElasticsearchAvailable();
  } catch (error) {
    markElasticsearchUnavailable();
    throw error;
  }
}

/** Load a product from Postgres and copy it into Elasticsearch. Called after every create/update. */
export async function indexProduct(productId: string) {
  const p = await prisma.product.findUnique({
    where: { id: productId },
    include: { category: true, vendor: true },
  });
  try {
    if (!p) {
      await es.delete({ index: PRODUCT_INDEX, id: productId }).catch(() => undefined);
      return;
    }
    await es.index({
      index: PRODUCT_INDEX,
      id: p.id,
      document: {
        title: p.title,
        description: p.description,
        categoryId: p.categoryId,
        categorySlug: p.category.slug,
        categoryName: p.category.name,
        vendorId: p.vendorId,
        storeName: p.vendor.storeName,
        priceCents: p.priceCents,
        stock: p.stock,
        ratingAvg: p.ratingAvg,
        ratingCount: p.ratingCount,
        image: p.images[0] ?? null,
        isActive: p.isActive && p.vendor.approved,
        createdAt: p.createdAt,
      },
    });
  } catch (err) {
    console.error('[elastic] failed to index product', productId, (err as Error).message);
  }
}

export async function removeProduct(productId: string) {
  await es.delete({ index: PRODUCT_INDEX, id: productId }).catch(() => undefined);
}
