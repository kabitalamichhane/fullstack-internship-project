import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { money, STATUS_COLORS } from '../lib/format';
import type { Order } from '../types';

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<{ orders: Order[] }>('/orders').then((r) => setOrders(r.orders)).catch((e) => setError(e.message));
  }, []);

  if (!orders) return <p className="p-8 text-center text-slate-500">{error || 'Loading orders…'}</p>;

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <h1 className="mb-4 text-2xl font-bold">My orders</h1>
      {orders.length === 0 && <p className="card text-slate-500">You haven't placed any orders yet.</p>}
      <ul className="space-y-3">
        {orders.map((o) => (
          <li key={o.id}>
            <Link to={`/orders/${o.id}`} className="card flex flex-wrap items-center justify-between gap-2 hover:shadow-md">
              <div>
                <p className="font-medium">Order #{o.id.slice(-8).toUpperCase()}</p>
                <p className="text-sm text-slate-500">
                  {new Date(o.createdAt).toLocaleString()} · {o.vendorOrders.reduce((n, v) => n + v.items.length, 0)} items
                </p>
              </div>
              <span className={`badge ${STATUS_COLORS[o.status]}`}>{o.status.replace('_', ' ')}</span>
              <span className="font-semibold">{money(o.totalCents)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
