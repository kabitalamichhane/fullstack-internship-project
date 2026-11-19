import { FormEvent, useState } from 'react';
import { api } from '../../lib/api';
import type { Category, Product } from '../../types';

type Props = { categories: Category[]; product?: Product; onSaved: () => void; onCancel: () => void };

/** Create or edit a product. Images are uploaded as multipart/form-data and stored in S3 by the API. */
export default function ProductForm({ categories, product, onSaved, onCancel }: Props) {
  const [form, setForm] = useState({
    title: product?.title ?? '',
    description: product?.description ?? '',
    price: product ? String(product.priceCents / 100) : '',
    stock: product ? String(product.stock) : '10',
    categoryId: product?.categoryId ?? categories[0]?.id ?? '',
    isActive: product?.isActive ?? true,
  });
  const [files, setFiles] = useState<File[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const fd = new FormData();
    fd.append('title', form.title);
    fd.append('description', form.description);
    fd.append('priceCents', String(Math.round(Number(form.price) * 100)));
    fd.append('stock', form.stock);
    fd.append('categoryId', form.categoryId);
    fd.append('isActive', String(form.isActive));
    files.forEach((f) => fd.append('images', f));
    if (removed.length) fd.append('removeImages', JSON.stringify(removed));
    try {
      await api(product ? `/products/${product.id}` : '/products', { method: product ? 'PUT' : 'POST', body: fd });
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const set = (k: string, v: string | boolean) => setForm({ ...form, [k]: v });

  return (
    <form onSubmit={submit} className="card space-y-3">
      <h3 className="text-lg font-semibold">{product ? 'Edit product' : 'Add a new product'}</h3>
      <div>
        <label className="label" htmlFor="title">Title</label>
        <input id="title" required minLength={3} className="input" value={form.title} onChange={(e) => set('title', e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor="desc">Description</label>
        <textarea id="desc" required minLength={10} rows={4} className="input" value={form.description} onChange={(e) => set('description', e.target.value)} />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="price">Price ($)</label>
          <input id="price" type="number" step="0.01" min="0.01" required className="input" value={form.price} onChange={(e) => set('price', e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="stock">Stock</label>
          <input id="stock" type="number" min="0" required className="input" value={form.stock} onChange={(e) => set('stock', e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="category">Category</label>
          <select id="category" className="input" value={form.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>

      {product && product.images.length > 0 && (
        <div>
          <span className="label">Current images (click to remove)</span>
          <div className="flex flex-wrap gap-2">
            {product.images.map((src) => (
              <button type="button" key={src} onClick={() => setRemoved(removed.includes(src) ? removed.filter((r) => r !== src) : [...removed, src])}
                className={`relative h-16 w-16 overflow-hidden rounded border ${removed.includes(src) ? 'opacity-30' : ''}`}>
                <img src={src} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        </div>
      )}
      <div>
        <label className="label" htmlFor="images">Upload images (max 6, 5 MB each)</label>
        <input id="images" type="file" accept="image/*" multiple onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 6))} />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={form.isActive} onChange={(e) => set('isActive', e.target.checked)} /> Visible in store
      </label>
      {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
      <div className="flex gap-2">
        <button className="btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save product'}</button>
        <button type="button" className="btn-outline" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
