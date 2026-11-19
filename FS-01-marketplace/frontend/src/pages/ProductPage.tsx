import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { money, stars } from '../lib/format';
import { useAuth } from '../context/AuthContext';
import type { Product } from '../types';

export default function ProductPage() {
  const { id } = useParams();
  const { user, refreshCart } = useAuth();
  const navigate = useNavigate();
  const [product, setProduct] = useState<Product | null>(null);
  const [image, setImage] = useState(0);
  const [qty, setQty] = useState(1);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [review, setReview] = useState({ rating: 5, comment: '' });

  const load = () => api<{ product: Product }>(`/products/${id}`).then((r) => setProduct(r.product)).catch((e) => setMsg({ ok: false, text: e.message }));
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const addToCart = async () => {
    if (!user) return navigate(`/login?next=/product/${id}`);
    try {
      await api('/cart/items', { method: 'POST', json: { productId: id, quantity: qty } });
      await refreshCart();
      setMsg({ ok: true, text: 'Added to cart' });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    }
  };

  const submitReview = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api(`/reviews/product/${id}`, { method: 'POST', json: review });
      setMsg({ ok: true, text: 'Thanks for your review!' });
      setReview({ rating: 5, comment: '' });
      load();
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    }
  };

  if (!product) return <p className="p-8 text-center text-slate-500">{msg?.text ?? 'Loading…'}</p>;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <Link to="/" className="text-sm text-brand-600">← Back to products</Link>
      <div className="mt-4 grid gap-8 md:grid-cols-2">
        <div>
          <div className="aspect-square overflow-hidden rounded-xl bg-white">
            {product.images[image] ? (
              <img src={product.images[image]} alt={product.title} className="h-full w-full object-contain" />
            ) : (
              <div className="flex h-full items-center justify-center text-slate-400">No image</div>
            )}
          </div>
          <div className="mt-3 flex gap-2">
            {product.images.map((src, i) => (
              <button key={src} onClick={() => setImage(i)} className={`h-16 w-16 overflow-hidden rounded border-2 ${i === image ? 'border-brand-500' : 'border-transparent'}`}>
                <img src={src} alt={`View ${i + 1}`} className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <p className="text-sm text-slate-500">{product.category.name} · Sold by <b>{product.vendor?.storeName}</b></p>
          <h1 className="text-2xl font-bold">{product.title}</h1>
          <p className="text-amber-500">{stars(product.ratingAvg)} <span className="text-sm text-slate-500">{product.ratingAvg.toFixed(1)} ({product.ratingCount} reviews)</span></p>
          <p className="text-3xl font-bold">{money(product.priceCents)}</p>
          <p className="whitespace-pre-line text-slate-700">{product.description}</p>
          <p className={product.stock > 0 ? 'text-green-700' : 'text-red-600'}>{product.stock > 0 ? `${product.stock} in stock` : 'Out of stock'}</p>

          {(!user || user.role === 'CUSTOMER') && product.stock > 0 && (
            <div className="flex items-center gap-3">
              <label className="sr-only" htmlFor="qty">Quantity</label>
              <input id="qty" type="number" min={1} max={product.stock} value={qty} onChange={(e) => setQty(Math.max(1, Number(e.target.value)))} className="input w-20" />
              <button className="btn-primary" onClick={addToCart}>Add to cart</button>
            </div>
          )}
          {msg && <p className={msg.ok ? 'text-green-700' : 'text-red-600'} role="status">{msg.text}</p>}
        </div>
      </div>

      <section className="mt-10 grid gap-6 md:grid-cols-[1fr_320px]">
        <div>
          <h2 className="mb-3 text-xl font-semibold">Customer reviews</h2>
          {product.reviews?.length ? (
            <ul className="space-y-3">
              {product.reviews.map((r) => (
                <li key={r.id} className="card">
                  <p className="text-amber-500">{stars(r.rating)}</p>
                  <p className="text-sm font-medium">{r.user.name} · <span className="text-slate-400">{new Date(r.createdAt).toLocaleDateString()}</span></p>
                  {r.comment && <p className="mt-1 text-slate-700">{r.comment}</p>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-slate-500">No reviews yet.</p>
          )}
        </div>
        {user?.role === 'CUSTOMER' && (
          <form onSubmit={submitReview} className="card h-fit space-y-3">
            <h3 className="font-semibold">Write a review</h3>
            <p className="text-xs text-slate-500">Available after your order is delivered.</p>
            <label className="label" htmlFor="rating">Rating</label>
            <select id="rating" className="input" value={review.rating} onChange={(e) => setReview({ ...review, rating: Number(e.target.value) })}>
              {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} star{n > 1 && 's'}</option>)}
            </select>
            <label className="label" htmlFor="comment">Comment</label>
            <textarea id="comment" className="input" rows={3} value={review.comment} onChange={(e) => setReview({ ...review, comment: e.target.value })} />
            <button className="btn-primary w-full">Submit review</button>
          </form>
        )}
      </section>
    </div>
  );
}
