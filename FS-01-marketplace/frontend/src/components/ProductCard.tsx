import { Link } from 'react-router-dom';
import { money, stars } from '../lib/format';
import type { SearchItem } from '../types';

export default function ProductCard({ p }: { p: SearchItem }) {
  return (
    <Link to={`/product/${p.id}`} className="card group flex flex-col transition hover:shadow-md">
      <div className="mb-3 aspect-square overflow-hidden rounded-lg bg-slate-100">
        {p.image ? (
          <img src={p.image} alt={p.title} loading="lazy" className="h-full w-full object-cover transition group-hover:scale-105" />
        ) : (
          <div className="flex h-full items-center justify-center text-slate-400">No image</div>
        )}
      </div>
      <p className="text-xs text-slate-500">{p.storeName}</p>
      <h3 className="line-clamp-2 font-medium">{p.title}</h3>
      <p className="mt-1 text-sm text-amber-500">
        {stars(p.ratingAvg)} <span className="text-slate-400">({p.ratingCount})</span>
      </p>
      <div className="mt-auto flex items-center justify-between pt-2">
        <span className="text-lg font-bold">{money(p.priceCents)}</span>
        {p.stock === 0 && <span className="badge bg-red-100 text-red-700">Sold out</span>}
      </div>
    </Link>
  );
}
