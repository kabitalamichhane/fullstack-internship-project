import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { money } from '../lib/format';
import { useAuth } from '../context/AuthContext';
import type { Cart } from '../types';

export default function CartPage() {
  const { refreshCart } = useAuth();
  const [cart, setCart] = useState<Cart | null>(null);
  const [error, setError] = useState('');
  const [params] = useSearchParams();

  useEffect(() => {
    api<Cart>('/cart').then(setCart).catch((e) => setError(e.message));
    // Returning from a cancelled Stripe checkout: release the reserved stock.
    const cancelled = params.get('cancelled');
    if (cancelled) api(`/orders/${cancelled}/cancel`, { method: 'POST' }).catch(() => undefined);
  }, [params]);

  const update = async (productId: string, quantity: number) => {
    try {
      setError('');
      setCart(await api<Cart>(`/cart/items/${productId}`, { method: 'PUT', json: { quantity } }));
      refreshCart();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  if (!cart) return <p className="p-8 text-center text-slate-500">{error || 'Loading cart…'}</p>;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <h1 className="mb-4 text-2xl font-bold">Your cart</h1>
      {params.get('cancelled') && <p className="card mb-4 text-amber-700">Payment was cancelled. Your items are still in the cart.</p>}
      {error && <p className="mb-4 text-red-600">{error}</p>}
      {cart.items.length === 0 ? (
        <div className="card text-center">
          <p className="text-slate-500">Your cart is empty.</p>
          <Link to="/" className="btn-primary mt-4">Start shopping</Link>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-[1fr_300px]">
          <ul className="space-y-3">
            {cart.items.map((i) => (
              <li key={i.productId} className="card flex gap-4">
                <img src={i.image ?? ''} alt="" className="h-20 w-20 rounded bg-slate-100 object-cover" />
                <div className="flex-1">
                  <Link to={`/product/${i.productId}`} className="font-medium hover:underline">{i.title}</Link>
                  <p className="text-xs text-slate-500">Sold by {i.storeName}</p>
                  <p className="text-sm">{money(i.unitPriceCents)} each</p>
                  <div className="mt-2 flex items-center gap-2">
                    <button className="btn-outline px-2 py-1" aria-label="Decrease" onClick={() => update(i.productId, i.quantity - 1)}>−</button>
                    <span className="w-8 text-center">{i.quantity}</span>
                    <button className="btn-outline px-2 py-1" aria-label="Increase" disabled={i.quantity >= i.stock} onClick={() => update(i.productId, i.quantity + 1)}>+</button>
                    <button className="ml-4 text-sm text-red-600" onClick={() => update(i.productId, 0)}>Remove</button>
                  </div>
                </div>
                <p className="font-semibold">{money(i.lineTotalCents)}</p>
              </li>
            ))}
          </ul>
          <div className="card h-fit space-y-3">
            <div className="flex justify-between"><span>Items ({cart.itemCount})</span><span>{money(cart.subtotalCents)}</span></div>
            <p className="text-xs text-slate-500">Coupons can be applied at checkout.</p>
            <Link to="/checkout" className="btn-primary w-full">Proceed to checkout</Link>
          </div>
        </div>
      )}
    </div>
  );
}
