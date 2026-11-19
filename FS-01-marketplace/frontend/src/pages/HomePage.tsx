import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import ProductCard from '../components/ProductCard';
import type { Category, SearchItem } from '../types';

type SearchResult = { total: number; page: number; pageSize: number; items: SearchItem[]; source: string };

/** Home = product search with filters (category, price, rating, stock) and sorting, powered by Elasticsearch. */
export default function HomePage() {
  const [params, setParams] = useSearchParams();
  const [categories, setCategories] = useState<Category[]>([]);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api<{ categories: Category[] }>('/products/categories').then((r) => setCategories(r.categories)).catch(() => undefined);
  }, []);

  useEffect(() => {
    setLoading(true);
    setError('');
    api<SearchResult>(`/search?${params.toString()}`)
      .then(setResult)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [params]);

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next);
  };

  const page = Number(params.get('page') ?? 1);
  const totalPages = result ? Math.max(1, Math.ceil(result.total / result.pageSize)) : 1;
  const dollars = (key: string) => (params.get(key) ? String(Number(params.get(key)) / 100) : '');

  return (
    <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 md:grid-cols-[240px_1fr]">
      <aside className="card h-fit space-y-4">
        <h2 className="font-semibold">Filters</h2>
        <div>
          <label className="label" htmlFor="cat">Category</label>
          <select id="cat" className="input" value={params.get('category') ?? ''} onChange={(e) => set('category', e.target.value)}>
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.slug}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <span className="label">Price ($)</span>
          <div className="flex gap-2">
            <input className="input" type="number" min={0} placeholder="Min" aria-label="Minimum price" defaultValue={dollars('minPrice')}
              onBlur={(e) => set('minPrice', e.target.value ? String(Math.round(Number(e.target.value) * 100)) : '')} />
            <input className="input" type="number" min={0} placeholder="Max" aria-label="Maximum price" defaultValue={dollars('maxPrice')}
              onBlur={(e) => set('maxPrice', e.target.value ? String(Math.round(Number(e.target.value) * 100)) : '')} />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="rating">Minimum rating</label>
          <select id="rating" className="input" value={params.get('minRating') ?? ''} onChange={(e) => set('minRating', e.target.value)}>
            <option value="">Any</option>
            {[4, 3, 2, 1].map((r) => <option key={r} value={r}>{r}★ & up</option>)}
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={params.get('inStock') === 'true'} onChange={(e) => set('inStock', e.target.checked ? 'true' : '')} />
          In stock only
        </label>
        <button className="btn-outline w-full" onClick={() => setParams({})}>Clear filters</button>
      </aside>

      <section>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-slate-500">
            {params.get('q') && <>Results for “<b>{params.get('q')}</b>” · </>}
            {result?.total ?? 0} products
          </p>
          <select className="input w-48" aria-label="Sort by" value={params.get('sort') ?? 'relevance'} onChange={(e) => set('sort', e.target.value)}>
            <option value="relevance">Most relevant</option>
            <option value="price_asc">Price: low to high</option>
            <option value="price_desc">Price: high to low</option>
            <option value="newest">Newest</option>
            <option value="rating">Top rated</option>
          </select>
        </div>

        {error && <p className="card text-red-600">{error}</p>}
        {loading && !result && <p className="text-slate-500">Loading products…</p>}
        {result && result.items.length === 0 && <p className="card text-slate-500">No products match these filters.</p>}

        <div className={`grid grid-cols-2 gap-4 lg:grid-cols-4 ${loading ? 'opacity-60' : ''}`}>
          {result?.items.map((p) => <ProductCard key={p.id} p={p} />)}
        </div>

        {totalPages > 1 && (
          <div className="mt-6 flex items-center justify-center gap-3">
            <button className="btn-outline" disabled={page <= 1} onClick={() => set('page', String(page - 1))}>Previous</button>
            <span className="text-sm">Page {page} of {totalPages}</span>
            <button className="btn-outline" disabled={page >= totalPages} onClick={() => set('page', String(page + 1))}>Next</button>
          </div>
        )}
      </section>
    </div>
  );
}
