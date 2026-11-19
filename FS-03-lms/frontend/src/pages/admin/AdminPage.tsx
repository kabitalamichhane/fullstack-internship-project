import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { usd } from '../../lib/format';

type Stats = {
  users: number;
  byRole: Record<string, number>;
  courses: number;
  published: number;
  enrollments: number;
  revenueCents: number;
  platformFeesCents: number;
  videosProcessing: number;
  videosFailed: number;
};
type UserRow = { id: string; name: string; email: string; role: string; createdAt: string; _count: { enrollments: number; coursesTaught: number } };

export default function AdminPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [error, setError] = useState('');

  const load = () => {
    api<Stats>('/admin/stats').then(setStats).catch((e) => setError(e.message));
    api<{ users: UserRow[] }>('/admin/users').then((r) => setUsers(r.users));
  };
  useEffect(load, []);

  const changeRole = async (id: string, role: string) => {
    await api(`/admin/users/${id}/role`, { method: 'PATCH', json: { role } }).catch((e) => setError(e.message));
    load();
  };

  if (!stats) return <p className="p-8 text-center text-slate-500">{error || 'Loading…'}</p>;

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <h1 className="text-2xl font-bold">Platform admin</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ['Users', `${stats.users} (${stats.byRole.STUDENT ?? 0} students, ${stats.byRole.INSTRUCTOR ?? 0} instructors)`],
          ['Courses', `${stats.published} published / ${stats.courses}`],
          ['Enrollments', stats.enrollments],
          ['Revenue', `${usd(stats.revenueCents)} (fees ${usd(stats.platformFeesCents)})`],
          ['Videos processing', stats.videosProcessing],
          ['Videos failed', stats.videosFailed],
        ].map(([label, value]) => (
          <div key={label as string} className="card"><p className="text-sm text-slate-500">{label}</p><p className="text-lg font-bold">{value}</p></div>
        ))}
      </div>
      {error && <p className="text-red-600">{error}</p>}
      <section className="card overflow-x-auto">
        <h2 className="mb-2 font-semibold">Users</h2>
        <table className="w-full text-sm">
          <thead className="text-left text-slate-500"><tr><th className="py-2">Name</th><th>Email</th><th>Joined</th><th>Enrolled</th><th>Teaching</th><th>Role</th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t">
                <td className="py-2">{u.name}</td>
                <td>{u.email}</td>
                <td>{new Date(u.createdAt).toLocaleDateString()}</td>
                <td>{u._count.enrollments}</td>
                <td>{u._count.coursesTaught}</td>
                <td>
                  <select className="input py-1" value={u.role} onChange={(e) => changeRole(u.id, e.target.value)} aria-label={`Role for ${u.name}`}>
                    <option>STUDENT</option><option>INSTRUCTOR</option><option>ADMIN</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
