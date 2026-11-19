import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'STUDENT' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: string) => setForm({ ...form, [k]: v });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const user = await register(form);
      navigate(user.role === 'INSTRUCTOR' ? '/instructor' : '/');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="card mx-auto mt-12 max-w-sm space-y-4">
      <h1 className="text-xl font-bold">Create your account</h1>
      <fieldset className="grid grid-cols-2 gap-2">
        <legend className="label">I want to</legend>
        {[
          ['STUDENT', 'Learn'],
          ['INSTRUCTOR', 'Teach'],
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
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input id="email" type="email" required className="input" value={form.email} onChange={(e) => set('email', e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor="password">Password</label>
        <input id="password" type="password" minLength={8} required className="input" value={form.password} onChange={(e) => set('password', e.target.value)} aria-describedby="pw" />
        <p id="pw" className="mt-1 text-xs text-slate-500">At least 8 characters.</p>
      </div>
      {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
      <button className="btn-primary w-full" disabled={busy}>{busy ? 'Creating…' : 'Create account'}</button>
      <p className="text-center text-sm">Have an account? <Link to="/login" className="text-brand-600">Log in</Link></p>
    </form>
  );
}
