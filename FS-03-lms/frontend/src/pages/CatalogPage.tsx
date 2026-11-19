import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { money } from '../lib/format';
import type { Course } from '../types';

export default function CatalogPage() {
  const [params, setParams] = useSearchParams();
  const [courses, setCourses] = useState<Course[] | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [q, setQ] = useState(params.get('q') ?? '');
  const [error, setError] = useState('');

  useEffect(() => {
    api<{ courses: Course[]; categories: string[] }>(`/courses?${params.toString()}`)
      .then((r) => {
        setCourses(r.courses);
        setCategories(r.categories);
      })
      .catch((e) => setError(e.message));
  }, [params]);

  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next);
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <section className="mb-8 rounded-2xl bg-gradient-to-r from-brand-600 to-indigo-400 p-8 text-white">
        <h1 className="text-3xl font-bold">Learn new skills, live and on demand</h1>
        <p className="mt-2 max-w-xl text-indigo-100">Video courses, quizzes with instant feedback, live classes with your instructor and certificates when you finish.</p>
        <form className="mt-4 flex max-w-lg gap-2" onSubmit={(e) => { e.preventDefault(); set('q', q); }}>
          <input className="input text-slate-800" placeholder="What do you want to learn?" aria-label="Search courses" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="btn bg-white text-brand-700 hover:bg-indigo-50">Search</button>
        </form>
      </section>

      <div className="mb-4 flex flex-wrap gap-2">
        <select className="input w-52" aria-label="Category" value={params.get('category') ?? ''} onChange={(e) => set('category', e.target.value)}>
          <option value="">All categories</option>
          {categories.map((c) => <option key={c}>{c}</option>)}
        </select>
        <select className="input w-40" aria-label="Price" value={params.get('price') ?? ''} onChange={(e) => set('price', e.target.value)}>
          <option value="">Any price</option>
          <option value="free">Free</option>
          <option value="paid">Paid</option>
        </select>
      </div>

      {error && <p className="text-red-600">{error}</p>}
      {!courses && !error && <p className="text-slate-500">Loading courses…</p>}
      {courses?.length === 0 && <p className="card text-slate-500">No courses found.</p>}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {courses?.map((c) => (
          <Link key={c.id} to={`/courses/${c.id}`} className="card flex flex-col p-0 transition hover:shadow-md">
            <div className="aspect-video overflow-hidden rounded-t-xl bg-gradient-to-br from-indigo-100 to-slate-200">
              {c.thumbnailUrl ? <img src={c.thumbnailUrl} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-4xl">🎓</div>}
            </div>
            <div className="flex flex-1 flex-col p-4">
              <p className="text-xs font-medium uppercase text-brand-600">{c.category} · {c.level}</p>
              <h2 className="mt-1 font-semibold">{c.title}</h2>
              <p className="line-clamp-2 text-sm text-slate-500">{c.subtitle ?? c.description}</p>
              <p className="mt-2 text-xs text-slate-500">{c.instructor.name} · {c._count?.lessons} lessons · {c._count?.enrollments} students</p>
              <p className="mt-auto pt-3 text-lg font-bold">{money(c.priceCents)}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
