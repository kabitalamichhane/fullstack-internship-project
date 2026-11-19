import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { money, STATUS_COLORS } from '../../lib/format';
import ProductForm from './ProductForm';
import type { Category, OrderStatus, Product, VendorOrder } from '../../types';

type Vendor = { id: string; storeName: string; description?: string; approved: boolean; stripeAccountId?: string; logoUrl?: string };
type Stats = { orders: number; grossCents: number; payoutCents: number; commissionCents: number; productCount: number };

const NEXT: Partial<Record<OrderStatus, OrderStatus>> = { PLACED: 'PACKED', PACKED: 'SHIPPED', SHIPPED: 'DELIVERED' };

export default function VendorDashboard() {
  const [tab, setTab] = useState<'overview' | 'products' | 'orders' | 'store'>('overview');
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<VendorOrder[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [editing, setEditing] = useState<Product | 'new' | null>(null);
  const [msg, setMsg] = useState('');

  const loadAll = () => {
    api<{ vendor: Vendor }>('/vendor/me').then((r) => setVendor(r.vendor));
    api<Stats>('/vendor/stats').then(setStats);
    api<{ products: Product[] }>('/vendor/products').then((r) => setProducts(r.products));
    api<{ orders: VendorOrder[] }>('/vendor/orders').then((r) => setOrders(r.orders));
  };

  useEffect(() => {
    loadAll();
    api<{ categories: Category[] }>('/products/categories').then((r) => setCategories(r.categories));
  }, []);

  const connectStripe = async () => {
    try {
      const r = await api<{ url: string | null; mocked?: boolean }>('/vendor/stripe/onboard', { method: 'POST' });
      if (r.url) window.location.href = r.url;
      else {
        setMsg('Payout account connected (mock mode).');
        loadAll();
      }
    } catch (e) {
      setMsg((e as Error).message);
    }
  };

  const advance = async (vo: VendorOrder, status: OrderStatus) => {
    try {
      await api(`/vendor/orders/${vo.id}/status`, { method: 'PATCH', json: { status } });
      loadAll();
    } catch (e) {
      setMsg((e as Error).message);
    }
  };

  const removeProduct = async (p: Product) => {
    if (!confirm(`Delete "${p.title}"?`)) return;
    await api(`/products/${p.id}`, { method: 'DELETE' }).catch((e) => setMsg(e.message));
    loadAll();
  };

  const saveStore = async (fd: FormData) => {
    try {
      await api('/vendor/me', { method: 'PUT', body: fd });
      setMsg('Store profile saved');
      loadAll();
    } catch (e) {
      setMsg((e as Error).message);
    }
  };

  if (!vendor) return <p className="p-8 text-center text-slate-500">Loading…</p>;

  return (
    <div className="mx-auto max-w-6xl space-y-4 px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">{vendor.storeName}</h1>
        <nav className="flex gap-1 rounded-lg bg-slate-200 p-1 text-sm">
          {(['overview', 'products', 'orders', 'store'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`rounded-md px-3 py-1 capitalize ${tab === t ? 'bg-white shadow' : ''}`}>{t}</button>
          ))}
        </nav>
      </div>

      {!vendor.approved && <p className="card border-amber-200 bg-amber-50 text-amber-800">Your store is waiting for admin approval. Products will appear in search once approved.</p>}
      {msg && <p className="card text-sm" role="status">{msg}</p>}

      {tab === 'overview' && stats && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ['Orders', String(stats.orders)],
              ['Gross sales', money(stats.grossCents)],
              ['Your earnings', money(stats.payoutCents)],
              ['Platform commission', money(stats.commissionCents)],
            ].map(([label, value]) => (
              <div key={label} className="card"><p className="text-sm text-slate-500">{label}</p><p className="text-2xl font-bold">{value}</p></div>
            ))}
          </div>
          <div className="card flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-semibold">Payouts (Stripe Connect)</h2>
              <p className="text-sm text-slate-500">{vendor.stripeAccountId ? `Connected: ${vendor.stripeAccountId}` : 'Connect a payout account to receive your share of each sale.'}</p>
            </div>
            <button className="btn-primary" onClick={connectStripe}>{vendor.stripeAccountId ? 'Update payout details' : 'Connect payouts'}</button>
          </div>
        </>
      )}

      {tab === 'products' && (
        <>
          {editing ? (
            <ProductForm categories={categories} product={editing === 'new' ? undefined : editing} onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); loadAll(); }} />
          ) : (
            <button className="btn-primary" onClick={() => setEditing('new')}>+ Add product</button>
          )}
          <div className="card overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-500">
                <tr><th className="p-3">Product</th><th>Price</th><th>Stock</th><th>Rating</th><th>Status</th><th /></tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.id} className="border-t">
                    <td className="flex items-center gap-2 p-3"><img src={p.images[0] ?? ''} alt="" className="h-10 w-10 rounded bg-slate-100 object-cover" />{p.title}</td>
                    <td>{money(p.priceCents)}</td>
                    <td className={p.stock < 5 ? 'font-semibold text-red-600' : ''}>{p.stock}</td>
                    <td>{p.ratingAvg.toFixed(1)} ({p.ratingCount})</td>
                    <td>{p.isActive ? 'Active' : 'Hidden'}</td>
                    <td className="space-x-2 pr-3 text-right">
                      <button className="text-brand-600" onClick={() => setEditing(p)}>Edit</button>
                      <button className="text-red-600" onClick={() => removeProduct(p)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {products.length === 0 && <p className="p-4 text-slate-500">No products yet.</p>}
          </div>
        </>
      )}

      {tab === 'orders' && (
        <div className="space-y-3">
          {orders.length === 0 && <p className="card text-slate-500">No orders yet.</p>}
          {orders.map((vo) => (
            <div key={vo.id} className="card space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">Order #{vo.order?.id.slice(-8).toUpperCase()} · {new Date(vo.order!.createdAt).toLocaleDateString()}</p>
                <span className={`badge ${STATUS_COLORS[vo.status]}`}>{vo.status}</span>
              </div>
              <p className="text-sm text-slate-500">
                {vo.order?.shippingAddress.fullName}, {vo.order?.shippingAddress.city}, {vo.order?.shippingAddress.country} · {vo.order?.shippingAddress.phone}
              </p>
              <ul className="text-sm">{vo.items.map((i) => <li key={i.id}>{i.quantity} × {i.title}</li>)}</ul>
              <p className="text-sm">Sale {money(vo.subtotalCents - vo.discountCents)} · Commission {money(vo.commissionCents)} · <b>You earn {money(vo.vendorPayoutCents)}</b></p>
              <div className="flex gap-2">
                {NEXT[vo.status] && <button className="btn-primary" onClick={() => advance(vo, NEXT[vo.status]!)}>Mark as {NEXT[vo.status]!.toLowerCase()}</button>}
                {['PLACED', 'PACKED'].includes(vo.status) && <button className="btn-outline" onClick={() => advance(vo, 'CANCELLED')}>Cancel</button>}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'store' && (
        <form className="card max-w-lg space-y-3" onSubmit={(e) => { e.preventDefault(); saveStore(new FormData(e.currentTarget)); }}>
          <h2 className="font-semibold">Store profile</h2>
          <div>
            <label className="label" htmlFor="storeName">Store name</label>
            <input id="storeName" name="storeName" className="input" defaultValue={vendor.storeName} />
          </div>
          <div>
            <label className="label" htmlFor="description">About your store</label>
            <textarea id="description" name="description" rows={3} className="input" defaultValue={vendor.description} />
          </div>
          <div>
            <label className="label" htmlFor="logo">Logo</label>
            {vendor.logoUrl && <img src={vendor.logoUrl} alt="Current logo" className="mb-2 h-16 w-16 rounded object-cover" />}
            <input id="logo" name="logo" type="file" accept="image/*" />
          </div>
          <button className="btn-primary">Save</button>
        </form>
      )}
    </div>
  );
}
