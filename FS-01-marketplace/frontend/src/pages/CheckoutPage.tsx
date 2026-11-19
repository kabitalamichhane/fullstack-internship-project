import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { money } from '../lib/format';
import { useAuth } from '../context/AuthContext';
import type { Cart } from '../types';

const FIELDS: [key: string, label: string, required: boolean][] = [
  ['fullName', 'Full name', true],
  ['phone', 'Phone', true],
  ['line1', 'Address line 1', true],
  ['line2', 'Address line 2', false],
  ['city', 'City', true],
  ['state', 'State / Province', false],
  ['postalCode', 'Postal code', true],
  ['country', 'Country', true],
];

export default function CheckoutPage() {
  const { user, refreshCart } = useAuth();
  const navigate = useNavigate();
  const [cart, setCart] = useState<Cart | null>(null);
  const [address, setAddress] = useState<Record<string, string>>({ fullName: user?.name ?? '', country: 'Nepal' });
  const [coupon, setCoupon] = useState('');
  const [discount, setDiscount] = useState<{ code: string; discountCents: number } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Cart>('/cart').then(setCart).catch((e) => setError(e.message));
  }, []);

  const applyCoupon = async () => {
    setError('');
    try {
      setDiscount(await api('/coupons/validate', { method: 'POST', json: { code: coupon } }));
    } catch (e) {
      setDiscount(null);
      setError((e as Error).message);
    }
  };

  const placeOrder = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await api<{ orderId: string; checkoutUrl: string | null }>('/orders/checkout', {
        method: 'POST',
        json: { shippingAddress: address, couponCode: discount?.code },
      });
      if (r.checkoutUrl) {
        window.location.href = r.checkoutUrl; // Stripe hosted checkout (test mode)
      } else {
        await refreshCart();
        navigate(`/orders/${r.orderId}?paid=1`);
      }
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  if (!cart) return <p className="p-8 text-center text-slate-500">{error || 'Loading…'}</p>;
  if (cart.items.length === 0) return <p className="p-8 text-center text-slate-500">Your cart is empty.</p>;
  const total = cart.subtotalCents - (discount?.discountCents ?? 0);

  return (
    <form onSubmit={placeOrder} className="mx-auto grid max-w-5xl gap-6 px-4 py-6 md:grid-cols-[1fr_320px]">
      <section className="card space-y-3">
        <h1 className="text-xl font-bold">Shipping address</h1>
        <div className="grid gap-3 sm:grid-cols-2">
          {FIELDS.map(([key, label, required]) => (
            <div key={key}>
              <label className="label" htmlFor={key}>{label}{required && ' *'}</label>
              <input id={key} className="input" required={required} value={address[key] ?? ''} onChange={(e) => setAddress({ ...address, [key]: e.target.value })} />
            </div>
          ))}
        </div>
      </section>

      <aside className="card h-fit space-y-3">
        <h2 className="font-semibold">Order summary</h2>
        {cart.items.map((i) => (
          <div key={i.productId} className="flex justify-between text-sm">
            <span className="line-clamp-1">{i.quantity} × {i.title}</span>
            <span>{money(i.lineTotalCents)}</span>
          </div>
        ))}
        <div className="flex gap-2">
          <input className="input" placeholder="Coupon code" aria-label="Coupon code" value={coupon} onChange={(e) => setCoupon(e.target.value)} />
          <button type="button" className="btn-outline" onClick={applyCoupon} disabled={!coupon}>Apply</button>
        </div>
        <hr />
        <div className="flex justify-between text-sm"><span>Subtotal</span><span>{money(cart.subtotalCents)}</span></div>
        {discount && <div className="flex justify-between text-sm text-green-700"><span>Discount ({discount.code})</span><span>−{money(discount.discountCents)}</span></div>}
        <div className="flex justify-between text-lg font-bold"><span>Total</span><span>{money(total)}</span></div>
        {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
        <button className="btn-primary w-full" disabled={busy}>{busy ? 'Processing…' : 'Pay now'}</button>
        <p className="text-xs text-slate-500">Test mode: use card 4242 4242 4242 4242, any future date and CVC.</p>
      </aside>
    </form>
  );
}
