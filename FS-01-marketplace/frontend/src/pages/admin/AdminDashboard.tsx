import { FormEvent, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { money, STATUS_COLORS } from '../../lib/format';

type Analytics = {
  totals: Record<string, number>;
  ordersByStatus: { status: string; count: number }[];
  topProducts: { productId: string; title: string; unitsSold: number }[];
  topVendors: { vendorId: string; storeName: string; salesCents: number; commissionCents: number }[];
  daily: { day: string; revenueCents: number; orders: number }[];
};
type VendorRow = { id: string; storeName: string; approved: boolean; user: { name: string; email: string }; _count: { products: number } };
type Coupon = { id: string; code: string; type: string; value: number; minOrderCents: number; usedCount: number; maxUses?: number; active: boolean; expiresAt?: string };

/** Admin analytics page: KPIs, revenue chart, top products/vendors, vendor approval and coupon management. */
export default function AdminDashboard() {
  const [data, setData] = useState<Analytics | null>(null);
  const [vendors, setVendors] = useState<VendorRow[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [days, setDays] = useState(30);
  const [error, setError] = useState('');

  const load = () => {
    api<Analytics>(`/admin/analytics?days=${days}`).then(setData).catch((e) => setError(e.message));
    api<{ vendors: VendorRow[] }>('/admin/vendors').then((r) => setVendors(r.vendors));
    api<{ coupons: Coupon[] }>('/coupons').then((r) => setCoupons(r.coupons));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [days]);

  const toggleVendor = async (v: VendorRow) => {
    await api(`/admin/vendors/${v.id}`, { method: 'PATCH', json: { approved: !v.approved } });
    load();
  };

  const createCoupon = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formEl = e.currentTarget;
    const f = new FormData(formEl);
    const type = String(f.get('type'));
    const value = Number(f.get('value'));
    try {
      await api('/coupons', {
        method: 'POST',
        json: {
          code: f.get('code'),
          type,
          value: type === 'FIXED' ? Math.round(value * 100) : value,
          minOrderCents: Math.round(Number(f.get('minOrder') || 0) * 100),
          maxUses: f.get('maxUses') ? Number(f.get('maxUses')) : null,
          expiresAt: f.get('expiresAt') || null,
        },
      });
      formEl.reset();
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  if (!data) return <p className="p-8 text-center text-slate-500">{error || 'Loading analytics…'}</p>;
  const t = data.totals;
  const maxRevenue = Math.max(1, ...data.daily.map((d) => d.revenueCents));

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Admin analytics</h1>
        <select className="input w-40" value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Date range">
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </div>
      {error && <p className="text-red-600">{error}</p>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ['Gross merchandise value', money(t.gmvCents)],
          ['Platform commission', money(t.commissionCents)],
          ['Paid orders', t.orders],
          ['Average order', money(t.avgOrderCents)],
          ['Customers', t.customers],
          ['Active vendors', t.vendors],
          ['Vendors awaiting approval', t.pendingVendors],
          ['Live products', t.products],
        ].map(([label, value]) => (
          <div key={label as string} className="card"><p className="text-sm text-slate-500">{label}</p><p className="text-2xl font-bold">{value}</p></div>
        ))}
      </div>

      <section className="card">
        <h2 className="mb-3 font-semibold">Daily revenue</h2>
        {data.daily.length === 0 ? (
          <p className="text-slate-500">No sales in this period.</p>
        ) : (
          <div className="flex h-48 items-end gap-1" role="img" aria-label="Bar chart of daily revenue">
            {data.daily.map((d) => (
              <div key={d.day} className="group relative flex-1">
                <div className="rounded-t bg-brand-500 hover:bg-brand-700" style={{ height: `${(d.revenueCents / maxRevenue) * 180}px` }} />
                <span className="pointer-events-none absolute -top-8 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-slate-800 px-2 py-1 text-xs text-white group-hover:block">
                  {d.day}: {money(d.revenueCents)} ({d.orders})
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="card">
          <h2 className="mb-2 font-semibold">Orders by status</h2>
          <ul className="space-y-1 text-sm">
            {data.ordersByStatus.map((s) => (
              <li key={s.status} className="flex justify-between"><span className={`badge ${STATUS_COLORS[s.status]}`}>{s.status}</span><span>{s.count}</span></li>
            ))}
          </ul>
        </section>
        <section className="card">
          <h2 className="mb-2 font-semibold">Top products</h2>
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            {data.topProducts.map((p) => <li key={p.productId}>{p.title} — <b>{p.unitsSold}</b> sold</li>)}
          </ol>
        </section>
        <section className="card">
          <h2 className="mb-2 font-semibold">Top vendors</h2>
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            {data.topVendors.map((v) => <li key={v.vendorId}>{v.storeName} — {money(v.salesCents)} (commission {money(v.commissionCents)})</li>)}
          </ol>
        </section>
      </div>

      <section className="card overflow-x-auto">
        <h2 className="mb-2 font-semibold">Vendors</h2>
        <table className="w-full text-sm">
          <thead className="text-left text-slate-500"><tr><th>Store</th><th>Owner</th><th>Products</th><th>Status</th><th /></tr></thead>
          <tbody>
            {vendors.map((v) => (
              <tr key={v.id} className="border-t">
                <td className="py-2">{v.storeName}</td>
                <td>{v.user.name} ({v.user.email})</td>
                <td>{v._count.products}</td>
                <td>{v.approved ? <span className="badge bg-green-100 text-green-800">Approved</span> : <span className="badge bg-amber-100 text-amber-800">Pending</span>}</td>
                <td className="text-right"><button className={v.approved ? 'text-red-600' : 'text-brand-600'} onClick={() => toggleVendor(v)}>{v.approved ? 'Suspend' : 'Approve'}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card space-y-3">
        <h2 className="font-semibold">Coupons</h2>
        <form onSubmit={createCoupon} className="grid gap-2 sm:grid-cols-6">
          <input name="code" required placeholder="CODE" className="input" aria-label="Coupon code" />
          <select name="type" className="input" aria-label="Type"><option value="PERCENT">% off</option><option value="FIXED">$ off</option></select>
          <input name="value" type="number" step="0.01" min="0.01" required placeholder="Value" className="input" aria-label="Value" />
          <input name="minOrder" type="number" step="0.01" min="0" placeholder="Min order $" className="input" aria-label="Minimum order" />
          <input name="maxUses" type="number" min="1" placeholder="Max uses" className="input" aria-label="Maximum uses" />
          <input name="expiresAt" type="date" className="input" aria-label="Expiry date" />
          <button className="btn-primary sm:col-span-6 sm:w-40">Create coupon</button>
        </form>
        <table className="w-full text-sm">
          <thead className="text-left text-slate-500"><tr><th>Code</th><th>Discount</th><th>Min order</th><th>Used</th><th>Expires</th></tr></thead>
          <tbody>
            {coupons.map((c) => (
              <tr key={c.id} className="border-t">
                <td className="py-2 font-mono">{c.code}</td>
                <td>{c.type === 'PERCENT' ? `${c.value}%` : money(c.value)}</td>
                <td>{money(c.minOrderCents)}</td>
                <td>{c.usedCount}{c.maxUses ? ` / ${c.maxUses}` : ''}</td>
                <td>{c.expiresAt ? new Date(c.expiresAt).toLocaleDateString() : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
