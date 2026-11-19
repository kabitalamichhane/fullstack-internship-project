import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, downloadFile } from '../lib/api';
import ProgressBar from '../components/ProgressBar';
import type { Course, Progress } from '../types';

type Enrollment = { id: string; courseId: string; completedAt: string | null; course: Course; progress: Progress };
type Cert = { id: string; code: string; issuedAt: string; courseId: string; course: { title: string } };

export default function MyLearningPage() {
  const [enrollments, setEnrollments] = useState<Enrollment[] | null>(null);
  const [certs, setCerts] = useState<Cert[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api<{ enrollments: Enrollment[] }>('/courses/mine').then((r) => setEnrollments(r.enrollments)).catch((e) => setError(e.message));
    api<{ certificates: Cert[] }>('/certificates').then((r) => setCerts(r.certificates)).catch(() => undefined);
  }, []);

  if (!enrollments) return <p className="p-8 text-center text-slate-500">{error || 'Loading…'}</p>;

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-8">
      <section>
        <h1 className="mb-4 text-2xl font-bold">My learning</h1>
        {enrollments.length === 0 && (
          <div className="card text-center">
            <p className="text-slate-500">You haven't enrolled in any course yet.</p>
            <Link to="/" className="btn-primary mt-3">Browse courses</Link>
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {enrollments.map((e) => (
            <Link key={e.id} to={`/courses/${e.courseId}`} className="card space-y-2 hover:shadow-md">
              <p className="text-xs uppercase text-brand-600">{e.course.category}</p>
              <h2 className="font-semibold">{e.course.title}</h2>
              <p className="text-xs text-slate-500">{e.course.instructor.name}</p>
              <ProgressBar percent={e.progress.percent} />
              {e.progress.complete && <span className="badge bg-green-100 text-green-800">Completed</span>}
            </Link>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">My certificates</h2>
        {certs.length === 0 ? (
          <p className="text-slate-500">Finish a course to earn your first certificate.</p>
        ) : (
          <ul className="space-y-2">
            {certs.map((c) => (
              <li key={c.id} className="card flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium">🎓 {c.course.title}</p>
                  <p className="text-xs text-slate-500">Issued {new Date(c.issuedAt).toLocaleDateString()} · ID {c.code} · <Link className="text-brand-600" to={`/verify/${c.code}`}>public verification link</Link></p>
                </div>
                <button className="btn-outline" onClick={() => downloadFile(`/certificates/course/${c.courseId}/pdf`, `certificate-${c.code}.pdf`)}>Download PDF</button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
