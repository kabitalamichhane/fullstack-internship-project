import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api, downloadFile } from '../lib/api';
import { money, STATUS_COLORS } from '../lib/format';
import { useAuth } from '../context/AuthContext';
import type { Order } from '../types';

const STEPS = ['PLACED', 'PACKED', 'SHIPPED', 'DELIVERED'];

/** Shows each vendor's shipment with a progress tracker: placed → packed → shipped → delivered. */
export default function OrderDetailPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { refreshCart } = useAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState('');

  const load = () => api<{ order: Order }>(`/orders/${id}`).then((r) => setOrder(r.order)).catch((e) => setError(e.message));

  useEffect(() => {
    load();
    refreshCart();
    // After Stripe redirects back, the webhook may take a second: poll briefly.
    if (params.get('paid')) {
      const t = setInterval(load, 2000);
      setTimeout(() => clearInterval(t), 10000);
      return () => clearInterval(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const cancel = async () => {
    if (!confirm('Cancel this order?')) return;
    try {
      await api(`/orders/${id}/cancel`, { method: 'POST' });
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  if (!order) return <p className="p-8 text-center text-slate-500">{error || 'Loading…'}</p>;
  const addr = order.shippingAddress;

  return (
    <div className="mx-auto max-w-4xl space-y-4 px-4 py-6">
      <Link to="/orders" className="text-sm text-brand-600">← All orders</Link>
      {params.get('paid') && order.status !== 'PENDING_PAYMENT' && (
        <p className="card border-green-200 bg-green-50 text-green-800">Payment successful. Thank you for your order!</p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Order #{order.id.slice(-8).toUpperCase()}</h1>
        <span className={`badge ${STATUS_COLORS[order.status]}`}>{order.status.replace('_', ' ')}</span>
      </div>
      {error && <p className="text-red-600">{error}</p>}

      {order.vendorOrders.map((vo) => {
        const current = STEPS.indexOf(vo.status);
        return (
          <section key={vo.id} className="card space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Shipment from {vo.vendor?.storeName}</h2>
              <span className={`badge ${STATUS_COLORS[vo.status]}`}>{vo.status.replace('_', ' ')}</span>
            </div>
            {vo.status !== 'CANCELLED' && (
              <ol className="flex gap-1" aria-label="Shipment progress">
                {STEPS.map((s, i) => (
                  <li key={s} className="flex-1">
                    <div className={`h-2 rounded ${i <= current ? 'bg-brand-500' : 'bg-slate-200'}`} />
                    <p className={`mt-1 text-xs ${i <= current ? 'text-brand-700' : 'text-slate-400'}`}>{s}</p>
                  </li>
                ))}
              </ol>
            )}
            <ul className="divide-y text-sm">
              {vo.items.map((i) => (
                <li key={i.id} className="flex justify-between py-2">
                  <Link to={`/product/${i.productId}`} className="hover:underline">{i.quantity} × {i.title}</Link>
                  <span>{money(i.unitPriceCents * i.quantity)}</span>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card text-sm">
          <h3 className="mb-1 font-semibold">Ship to</h3>
          <p>{addr.fullName}</p>
          <p>{addr.line1} {addr.line2}</p>
          <p>{addr.city} {addr.state} {addr.postalCode}</p>
          <p>{addr.country} · {addr.phone}</p>
        </div>
        <div className="card space-y-1 text-sm">
          <div className="flex justify-between"><span>Subtotal</span><span>{money(order.subtotalCents)}</span></div>
          {order.discountCents > 0 && <div className="flex justify-between text-green-700"><span>Discount ({order.couponCode})</span><span>−{money(order.discountCents)}</span></div>}
          <div className="flex justify-between text-base font-bold"><span>Total</span><span>{money(order.totalCents)}</span></div>
          <div className="flex gap-2 pt-2">
            {!['PENDING_PAYMENT', 'CANCELLED'].includes(order.status) && (
              <button className="btn-outline" onClick={() => downloadFile(`/orders/${order.id}/invoice`, `invoice-${order.id.slice(-8)}.pdf`).catch((e) => setError(e.message))}>
                Download invoice (PDF)
              </button>
            )}
            {['PENDING_PAYMENT', 'PLACED'].includes(order.status) && <button className="btn-danger" onClick={cancel}>Cancel order</button>}
          </div>
        </div>
      </div>
    </div>
  );
}
