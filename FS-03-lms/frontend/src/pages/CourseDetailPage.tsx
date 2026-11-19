import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, downloadFile } from '../lib/api';
import { dateTime, duration, money } from '../lib/format';
import { useAuth } from '../context/AuthContext';
import ProgressBar from '../components/ProgressBar';
import type { CourseDetail } from '../types';

export default function CourseDetailPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<CourseDetail | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => api<CourseDetail>(`/courses/${id}`).then(setData).catch((e) => setError(e.message));
  useEffect(() => {
    load();
    // Returning from Stripe: the webhook may need a moment to enroll the student.
    if (params.get('enrolled')) {
      const t = setInterval(load, 2000);
      setTimeout(() => clearInterval(t), 10000);
      return () => clearInterval(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const enroll = async () => {
    if (!user) return navigate(`/login?next=/courses/${id}`);
    setBusy(true);
    setError('');
    try {
      const r = await api<{ enrolled: boolean; checkoutUrl?: string }>(`/enroll/${data!.course.id}`, { method: 'POST' });
      if (r.checkoutUrl) window.location.href = r.checkoutUrl;
      else await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const certificate = () =>
    downloadFile(`/certificates/course/${data!.course.id}/pdf`, `certificate-${data!.course.slug}.pdf`).catch(async () => {
      setError('Complete all lessons and pass all quizzes to unlock your certificate.');
    });

  if (!data) return <p className="p-8 text-center text-slate-500">{error || 'Loading…'}</p>;
  const { course, enrolled, hasAccess, isOwner, progress } = data;
  const firstLesson = course.lessons?.find((l) => !progress?.completedLessonIds.includes(l.id)) ?? course.lessons?.[0];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <div>
            <p className="text-sm font-medium uppercase text-brand-600">{course.category} · {course.level}</p>
            <h1 className="text-3xl font-bold">{course.title}</h1>
            {course.subtitle && <p className="mt-1 text-lg text-slate-600">{course.subtitle}</p>}
            <p className="mt-2 text-sm text-slate-500">By {course.instructor.name} · {course._count?.enrollments ?? 0} students</p>
          </div>
          <p className="whitespace-pre-line text-slate-700">{course.description}</p>

          <section>
            <h2 className="mb-2 text-xl font-semibold">Curriculum</h2>
            <ul className="card divide-y p-0">
              {course.lessons?.map((l) => {
                const done = progress?.completedLessonIds.includes(l.id);
                const open = hasAccess || l.isPreview;
                return (
                  <li key={l.id} className="flex items-center gap-3 p-3">
                    <span aria-hidden>{done ? '✅' : open ? '▶️' : '🔒'}</span>
                    {open ? <Link to={`/learn/${course.id}/${l.id}`} className="flex-1 hover:underline">{l.position}. {l.title}</Link> : <span className="flex-1">{l.position}. {l.title}</span>}
                    {l.isPreview && !hasAccess && <span className="badge bg-green-100 text-green-800">Preview</span>}
                    <span className="text-xs text-slate-400">{duration(l.durationSec)}</span>
                  </li>
                );
              })}
              {course.quizzes?.map((q) => (
                <li key={q.id} className="flex items-center gap-3 p-3">
                  <span aria-hidden>{progress?.passedQuizIds.includes(q.id) ? '✅' : '📝'}</span>
                  {hasAccess ? <Link to={`/quiz/${q.id}`} className="flex-1 hover:underline">Quiz: {q.title}</Link> : <span className="flex-1">Quiz: {q.title}</span>}
                  <span className="text-xs text-slate-400">{q._count.questions} questions · pass {q.passPercent}%</span>
                </li>
              ))}
            </ul>
          </section>

          {!!course.liveClasses?.length && (
            <section>
              <h2 className="mb-2 text-xl font-semibold">Live classes</h2>
              <ul className="space-y-2">
                {course.liveClasses.map((lc) => (
                  <li key={lc.id} className="card flex items-center justify-between">
                    <div>
                      <p className="font-medium">{lc.title}</p>
                      <p className="text-sm text-slate-500">{dateTime(lc.scheduledAt)}</p>
                    </div>
                    {lc.status === 'LIVE' && <span className="badge animate-pulse bg-red-600 text-white">LIVE NOW</span>}
                    {lc.status === 'ENDED' && <span className="badge bg-slate-200">Ended</span>}
                    {hasAccess && lc.status !== 'ENDED' && <Link className="btn-primary" to={`/live/${lc.id}`}>{isOwner ? 'Open studio' : 'Join'}</Link>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="card">
            <h2 className="font-semibold">About the instructor</h2>
            <p className="font-medium">{course.instructor.name}</p>
            <p className="text-sm text-slate-600">{course.instructor.bio}</p>
          </section>
        </div>

        <aside className="card h-fit space-y-4 lg:sticky lg:top-20">
          <p className="text-3xl font-bold">{money(course.priceCents)}</p>
          {params.get('enrolled') && !enrolled && <p className="text-sm text-slate-500">Confirming your payment…</p>}
          {isOwner ? (
            <Link to={`/instructor/courses/${course.id}`} className="btn-primary w-full">Edit course</Link>
          ) : enrolled ? (
            <>
              {progress && <ProgressBar percent={progress.percent} label={`${progress.completedLessons}/${progress.totalLessons} lessons · ${progress.passedQuizzes}/${progress.totalQuizzes} quizzes passed`} />}
              {firstLesson && <Link to={`/learn/${course.id}/${firstLesson.id}`} className="btn-primary w-full">{progress?.completedLessons ? 'Continue learning' : 'Start course'}</Link>}
              <button className="btn-outline w-full" disabled={!progress?.complete} onClick={certificate}>
                {progress?.complete ? '🎓 Download certificate' : 'Certificate unlocks at 100%'}
              </button>
            </>
          ) : (
            <button className="btn-primary w-full" onClick={enroll} disabled={busy}>
              {busy ? 'Please wait…' : course.priceCents ? `Buy now – ${money(course.priceCents)}` : 'Enroll for free'}
            </button>
          )}
          {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
          <ul className="space-y-1 text-sm text-slate-600">
            <li>📹 {course.lessons?.length} video lessons (adaptive streaming)</li>
            <li>📝 {course.quizzes?.length} auto-graded quizzes</li>
            <li>🎥 Live classes with chat</li>
            <li>🎓 Certificate of completion</li>
          </ul>
          {course.priceCents > 0 && !enrolled && <p className="text-xs text-slate-500">Test mode: card 4242 4242 4242 4242.</p>}
        </aside>
      </div>
    </div>
  );
}
