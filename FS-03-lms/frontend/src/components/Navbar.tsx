import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const link = ({ isActive }: { isActive: boolean }) =>
    `text-sm font-medium ${isActive ? 'text-brand-600' : 'text-slate-600 hover:text-slate-900'}`;

  return (
    <header className="sticky top-0 z-20 border-b bg-white">
      <div className="mx-auto flex max-w-7xl items-center gap-5 px-4 py-3">
        <Link to="/" className="text-xl font-bold text-brand-600">LearnHub</Link>
        <NavLink to="/" end className={link}>Courses</NavLink>
        {user?.role === 'STUDENT' && <NavLink to="/my-learning" className={link}>My learning</NavLink>}
        {(user?.role === 'INSTRUCTOR' || user?.role === 'ADMIN') && <NavLink to="/instructor" className={link}>Instructor</NavLink>}
        {user?.role === 'ADMIN' && <NavLink to="/admin" className={link}>Admin</NavLink>}
        <div className="ml-auto flex items-center gap-3">
          {user ? (
            <>
              <span className="hidden text-sm text-slate-500 sm:inline">{user.name} · {user.role.toLowerCase()}</span>
              <button className="btn-outline" onClick={() => logout().then(() => navigate('/'))}>Log out</button>
            </>
          ) : (
            <>
              <NavLink to="/login" className={link}>Log in</NavLink>
              <Link to="/register" className="btn-primary">Sign up</Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
