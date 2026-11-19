import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';
import { api } from '../../lib/api';
import { money, usd } from '../../lib/format';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Filler, Tooltip, Legend);

type Dashboard = {
  totals: { grossCents: number; earningsCents: number; platformFeesCents: number; sales: number; students: number; courses: number; avgQuizScore: number };
  monthly: { month: string; earningsCents: number; sales: number }[];
  courses: { id: string; title: string; priceCents: number; published: boolean; students: number; sales: number; earningsCents: number; completionRate: number }[];
  recentSales: { id: string; student: string; course: string; amountCents: number; earningCents: number; paidAt: string }[];
};

/** Instructor revenue dashboard built with Chart.js. */
export default function InstructorDashboard() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    api<Dashboard>('/instructor/dashboard').then(setData).catch((e) => setError(e.message));
  }, []);

  const newCourse = async () => {
    try {
      const r = await api<{ course: { id: string } }>('/courses', {
        method: 'POST',
        json: { title: 'Untitled course', description: 'Describe what students will learn in this course.', category: 'General' },
      });
      navigate(`/instructor/courses/${r.course.id}`);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  if (!data) return <p className="p-8 text-center text-slate-500">{error || 'Loading dashboard…'}</p>;
  const t = data.totals;
  const months = data.monthly.map((m) => new Date(m.month + '-01').toLocaleDateString(undefined, { month: 'short', year: '2-digit' }));

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Instructor dashboard</h1>
        <button className="btn-primary" onClick={newCourse}>+ New course</button>
      </div>
      {error && <p className="text-red-600">{error}</p>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ['Your earnings', usd(t.earningsCents)],
          ['Gross sales', usd(t.grossCents)],
          ['Students', t.students],
          ['Avg. quiz score', `${t.avgQuizScore}%`],
        ].map(([label, value]) => (
          <div key={label as string} className="card"><p className="text-sm text-slate-500">{label}</p><p className="text-2xl font-bold">{value}</p></div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card">
          <h2 className="mb-2 font-semibold">Monthly earnings</h2>
          {data.monthly.length ? (
            <Line
              aria-label="Line chart of monthly earnings"
              data={{
                labels: months,
                datasets: [{ label: 'Earnings ($)', data: data.monthly.map((m) => m.earningsCents / 100), borderColor: '#4f46e5', backgroundColor: 'rgba(79,70,229,0.15)', fill: true, tension: 0.3 }],
              }}
              options={{ plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { callback: (v) => `$${v}` } } } }}
            />
          ) : (
            <p className="text-slate-500">No sales yet.</p>
          )}
        </section>
        <section className="card">
          <h2 className="mb-2 font-semibold">Students per course</h2>
          {data.courses.length ? (
            <Bar
              aria-label="Bar chart of students and sales per course"
              data={{
                labels: data.courses.map((c) => (c.title.length > 22 ? c.title.slice(0, 22) + '…' : c.title)),
                datasets: [
                  { label: 'Students', data: data.courses.map((c) => c.students), backgroundColor: '#4f46e5' },
                  { label: 'Paid sales', data: data.courses.map((c) => c.sales), backgroundColor: '#a5b4fc' },
                ],
              }}
              options={{ scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }}
            />
          ) : (
            <p className="text-slate-500">Create your first course.</p>
          )}
        </section>
      </div>

      <section className="card overflow-x-auto">
        <h2 className="mb-2 font-semibold">My courses</h2>
        <table className="w-full text-sm">
          <thead className="text-left text-slate-500">
            <tr><th className="py-2">Course</th><th>Price</th><th>Status</th><th>Students</th><th>Completion</th><th>Earnings</th><th /></tr>
          </thead>
          <tbody>
            {data.courses.map((c) => (
              <tr key={c.id} className="border-t">
                <td className="py-2">{c.title}</td>
                <td>{money(c.priceCents)}</td>
                <td>{c.published ? <span className="badge bg-green-100 text-green-800">Published</span> : <span className="badge bg-slate-200">Draft</span>}</td>
                <td>{c.students}</td>
                <td>{c.completionRate}%</td>
                <td>{usd(c.earningsCents)}</td>
                <td className="space-x-3 text-right">
                  <Link className="text-brand-600" to={`/instructor/courses/${c.id}`}>Edit</Link>
                  <Link className="text-slate-500" to={`/courses/${c.id}`}>View</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card overflow-x-auto">
        <h2 className="mb-2 font-semibold">Recent sales</h2>
        {data.recentSales.length === 0 ? (
          <p className="text-slate-500">No sales yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-slate-500"><tr><th className="py-2">Date</th><th>Student</th><th>Course</th><th>Price</th><th>You earn</th></tr></thead>
            <tbody>
              {data.recentSales.map((s) => (
                <tr key={s.id} className="border-t">
                  <td className="py-2">{new Date(s.paidAt).toLocaleDateString()}</td>
                  <td>{s.student}</td>
                  <td>{s.course}</td>
                  <td>{usd(s.amountCents)}</td>
                  <td className="font-semibold">{usd(s.earningCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="mt-2 text-xs text-slate-500">Platform fee: {t.grossCents ? Math.round((t.platformFeesCents / t.grossCents) * 100) : 20}% of each sale.</p>
      </section>
    </div>
  );
}
