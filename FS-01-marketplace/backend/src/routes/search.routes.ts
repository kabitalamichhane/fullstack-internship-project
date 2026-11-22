import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import {
  es,
  markElasticsearchAvailable,
  markElasticsearchUnavailable,
  PRODUCT_INDEX,
  shouldUseElasticsearch,
} from '../lib/elastic';
import { prisma } from '../lib/prisma';
import { asyncHandler } from '../utils/http';

const router = Router();

const querySchema = z.object({
  q: z.string().trim().optional(),
  category: z.string().optional(), // category slug
  vendorId: z.string().optional(),
  minPrice: z.coerce.number().int().min(0).optional(), // cents
  maxPrice: z.coerce.number().int().min(0).optional(),
  minRating: z.coerce.number().min(0).max(5).optional(),
  inStock: z.enum(['true', 'false']).optional(),
  sort: z.enum(['relevance', 'price_asc', 'price_desc', 'newest', 'rating']).default('relevance'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(60).default(20),
});

type SearchQuery = z.infer<typeof querySchema>;

const SORTS: Record<string, Record<string, 'asc' | 'desc'>[]> = {
  relevance: [],
  price_asc: [{ priceCents: 'asc' }],
  price_desc: [{ priceCents: 'desc' }],
  newest: [{ createdAt: 'desc' }],
  rating: [{ ratingAvg: 'desc' }, { ratingCount: 'desc' }],
};

/**
 * GET /api/search?q=shoes&category=fashion&minPrice=1000&maxPrice=5000&minRating=4&sort=price_asc
 * Full-text search with filters, sorting, pagination and category facets via Elasticsearch.
 * Falls back to a PostgreSQL query if Elasticsearch is unreachable.
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = querySchema.parse(req.query);
    if (!shouldUseElasticsearch()) {
      res.json(await searchDatabase(q));
      return;
    }
    try {
      const result = await searchElastic(q);
      markElasticsearchAvailable();
      res.json(result);
    } catch (err) {
      markElasticsearchUnavailable();
      console.warn('[search] Elasticsearch unavailable, using database fallback:', (err as Error).message);
      res.json(await searchDatabase(q));
    }
  }),
);

async function searchElastic(q: SearchQuery) {
  const filter: object[] = [{ term: { isActive: true } }];
  if (q.category) filter.push({ term: { categorySlug: q.category } });
  if (q.vendorId) filter.push({ term: { vendorId: q.vendorId } });
  if (q.minPrice !== undefined || q.maxPrice !== undefined)
    filter.push({ range: { priceCents: { gte: q.minPrice, lte: q.maxPrice } } });
  if (q.minRating !== undefined) filter.push({ range: { ratingAvg: { gte: q.minRating } } });
  if (q.inStock === 'true') filter.push({ range: { stock: { gt: 0 } } });

  const must = q.q
    ? [{ multi_match: { query: q.q, fields: ['title^3', 'description', 'categoryName', 'storeName'], fuzziness: 'AUTO' } }]
    : [{ match_all: {} }];

  const result = await es.search({
    index: PRODUCT_INDEX,
    from: (q.page - 1) * q.pageSize,
    size: q.pageSize,
    query: { bool: { must, filter } },
    sort: SORTS[q.sort].length ? (SORTS[q.sort] as never) : undefined,
    aggs: {
      categories: { terms: { field: 'categorySlug', size: 30 } },
      price: { stats: { field: 'priceCents' } },
    },
  });

  const total = typeof result.hits.total === 'number' ? result.hits.total : result.hits.total?.value ?? 0;
  const aggs = result.aggregations as { categories?: { buckets: { key: string; doc_count: number }[] } } | undefined;
  return {
    source: 'elasticsearch',
    total,
    page: q.page,
    pageSize: q.pageSize,
    items: result.hits.hits.map((h) => ({ id: h._id, ...(h._source as object) })),
    facets: { categories: aggs?.categories?.buckets.map((b) => ({ slug: b.key, count: b.doc_count })) ?? [] },
  };
}

async function searchDatabase(q: SearchQuery) {
  const where: Prisma.ProductWhereInput = {
    isActive: true,
    vendor: { approved: true },
    ...(q.q && {
      OR: [
        { title: { contains: q.q, mode: 'insensitive' } },
        { description: { contains: q.q, mode: 'insensitive' } },
      ],
    }),
    ...(q.category && { category: { slug: q.category } }),
    ...(q.vendorId && { vendorId: q.vendorId }),
    ...((q.minPrice !== undefined || q.maxPrice !== undefined) && { priceCents: { gte: q.minPrice, lte: q.maxPrice } }),
    ...(q.minRating !== undefined && { ratingAvg: { gte: q.minRating } }),
    ...(q.inStock === 'true' && { stock: { gt: 0 } }),
  };
  const [total, rows] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      include: { category: true, vendor: { select: { storeName: true } } },
      orderBy: SORTS[q.sort].length ? (SORTS[q.sort] as Prisma.ProductOrderByWithRelationInput[]) : { createdAt: 'desc' },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
  ]);
  return {
    source: 'database',
    total,
    page: q.page,
    pageSize: q.pageSize,
    items: rows.map((p) => ({
      id: p.id,
      title: p.title,
      description: p.description,
      priceCents: p.priceCents,
      stock: p.stock,
      ratingAvg: p.ratingAvg,
      ratingCount: p.ratingCount,
      image: p.images[0] ?? null,
      categorySlug: p.category.slug,
      categoryName: p.category.name,
      storeName: p.vendor.storeName,
      vendorId: p.vendorId,
    })),
    facets: { categories: [] },
  };
}

export default router;
