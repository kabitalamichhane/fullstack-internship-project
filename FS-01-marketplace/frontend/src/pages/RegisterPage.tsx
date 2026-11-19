import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'CUSTOMER', storeName: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (k: string, v: string) => setForm({ ...form, [k]: v });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const data: Record<string, string> = { name: form.name, email: form.email, password: form.password, role: form.role };
      if (form.role === 'VENDOR') data.storeName = form.storeName;
      const user = await register(data);
      navigate(user.role === 'VENDOR' ? '/vendor' : '/');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="card mx-auto mt-12 max-w-sm space-y-4">
      <h1 className="text-xl font-bold">Create an account</h1>
      <fieldset className="grid grid-cols-2 gap-2">
        <legend className="label">I want to</legend>
        {[
          ['CUSTOMER', 'Shop'],
          ['VENDOR', 'Sell'],
        ].map(([value, label]) => (
          <label key={value} className={`btn-outline cursor-pointer ${form.role === value ? 'border-brand-500 bg-brand-50' : ''}`}>
            <input type="radio" name="role" value={value} className="sr-only" checked={form.role === value} onChange={() => set('role', value)} />
            {label}
          </label>
        ))}
      </fieldset>
      <div>
        <label className="label" htmlFor="name">Full name</label>
        <input id="name" required className="input" value={form.name} onChange={(e) => set('name', e.target.value)} />
      </div>
      {form.role === 'VENDOR' && (
        <div>
          <label className="label" htmlFor="storeName">Store name</label>
          <input id="storeName" required className="input" value={form.storeName} onChange={(e) => set('storeName', e.target.value)} />
        </div>
      )}
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input id="email" type="email" required className="input" value={form.email} onChange={(e) => set('email', e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor="password">Password</label>
        <input id="password" type="password" minLength={8} required className="input" value={form.password} onChange={(e) => set('password', e.target.value)} aria-describedby="pw-hint" />
        <p id="pw-hint" className="mt-1 text-xs text-slate-500">At least 8 characters.</p>
      </div>
      {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
      <button className="btn-primary w-full" disabled={busy}>{busy ? 'Creating…' : 'Create account'}</button>
      <p className="text-center text-sm">Already have an account? <Link to="/login" className="text-brand-600">Log in</Link></p>
    </form>
  );
}
