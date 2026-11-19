import { FormEvent, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Navbar() {
  const { user, logout, cartCount } = useAuth();
  const [q, setQ] = useState('');
  const navigate = useNavigate();

  const search = (e: FormEvent) => {
    e.preventDefault();
    navigate(`/?q=${encodeURIComponent(q)}`);
  };

  const link = ({ isActive }: { isActive: boolean }) =>
    `text-sm font-medium ${isActive ? 'text-brand-600' : 'text-slate-600 hover:text-slate-900'}`;

  return (
    <header className="sticky top-0 z-20 border-b bg-white">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-4 px-4 py-3">
        <Link to="/" className="text-xl font-bold text-brand-600">
          Nexmart
        </Link>
        <form onSubmit={search} className="order-3 w-full sm:order-none sm:flex-1">
          <input
            className="input"
            placeholder="Search products, brands and stores…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search products"
          />
        </form>
        <nav className="ml-auto flex items-center gap-4">
          {user?.role === 'VENDOR' && <NavLink to="/vendor" className={link}>Vendor dashboard</NavLink>}
          {user?.role === 'ADMIN' && <NavLink to="/admin" className={link}>Admin</NavLink>}
          {user?.role === 'CUSTOMER' && (
            <>
              <NavLink to="/orders" className={link}>Orders</NavLink>
              <NavLink to="/cart" className={link}>
                Cart{cartCount > 0 && <span className="badge ml-1 bg-brand-500 text-white">{cartCount}</span>}
              </NavLink>
            </>
          )}
          {user ? (
            <>
              <span className="hidden text-sm text-slate-500 md:inline">Hi, {user.name.split(' ')[0]}</span>
              <button className="btn-outline" onClick={() => logout().then(() => navigate('/'))}>Log out</button>
            </>
          ) : (
            <>
              <NavLink to="/login" className={link}>Log in</NavLink>
              <Link to="/register" className="btn-primary">Sign up</Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
