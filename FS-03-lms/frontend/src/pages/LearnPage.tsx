import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { duration } from '../lib/format';
import VideoPlayer from '../components/VideoPlayer';
import ProgressBar from '../components/ProgressBar';
import type { CourseDetail, Progress } from '../types';

/** Course player: lesson list on the left, HLS video + notes on the right. Progress is saved as you watch. */
export default function LearnPage() {
  const { courseId, lessonId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<CourseDetail | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<CourseDetail>(`/courses/${courseId}`)
      .then((d) => {
        setData(d);
        setProgress(d.progress);
      })
      .catch((e) => setError(e.message));
  }, [courseId]);

  if (!data) return <p className="p-8 text-center text-slate-500">{error || 'Loading…'}</p>;
  const lessons = data.course.lessons ?? [];
  const index = Math.max(0, lessons.findIndex((l) => l.id === lessonId));
  const lesson = lessons[index];
  if (!lesson) return <p className="p-8 text-center text-slate-500">This course has no lessons yet.</p>;
  const canWatch = data.hasAccess || lesson.isPreview;
  const next = lessons[index + 1];
  const lessonQuizzes = data.course.quizzes?.filter((q) => q.lessonId === lesson.id) ?? [];

  const save = async (watchedSec: number, completed = false) => {
    if (!data.enrolled) return; // previews and instructors don't track progress
    try {
      setProgress(await api<Progress>(`/lessons/${lesson.id}/progress`, { method: 'POST', json: { watchedSec, completed } }));
    } catch {
      /* progress saving is best-effort */
    }
  };

  return (
    <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[300px_1fr]">
      <aside className="card h-fit space-y-3 p-0">
        <div className="border-b p-4">
          <Link to={`/courses/${data.course.id}`} className="text-sm text-brand-600">← {data.course.title}</Link>
          {progress && <div className="mt-3"><ProgressBar percent={progress.percent} /></div>}
        </div>
        <ol className="max-h-[60vh] overflow-y-auto">
          {lessons.map((l) => {
            const done = progress?.completedLessonIds.includes(l.id);
            const open = data.hasAccess || l.isPreview;
            return (
              <li key={l.id}>
                <button
                  disabled={!open}
                  onClick={() => navigate(`/learn/${data.course.id}/${l.id}`)}
                  className={`flex w-full items-center gap-2 px-4 py-2 text-left text-sm disabled:opacity-50 ${l.id === lesson.id ? 'bg-brand-50 font-semibold text-brand-700' : 'hover:bg-slate-50'}`}
                >
                  <span aria-hidden>{done ? '✅' : open ? '▶' : '🔒'}</span>
                  <span className="flex-1">{l.position}. {l.title}</span>
                  <span className="text-xs text-slate-400">{duration(l.durationSec)}</span>
                </button>
              </li>
            );
          })}
          {data.course.quizzes?.map((q) => (
            <li key={q.id}>
              <Link to={`/quiz/${q.id}`} className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-slate-50">
                <span aria-hidden>{progress?.passedQuizIds.includes(q.id) ? '✅' : '📝'}</span> Quiz: {q.title}
              </Link>
            </li>
          ))}
        </ol>
      </aside>

      <section className="space-y-4">
        {!canWatch ? (
          <div className="card text-center">Enroll in the course to watch this lesson.</div>
        ) : lesson.videoStatus === 'READY' && lesson.hlsUrl ? (
          <VideoPlayer
            key={lesson.id}
            src={lesson.hlsUrl}
            startAt={progress?.lessonProgress[lesson.id]?.watchedSec ?? 0}
            onProgress={(t) => save(t)}
            onEnded={() => save(lesson.durationSec ?? 0, true)}
          />
        ) : (
          <div className="card flex aspect-video items-center justify-center text-slate-500">
            {lesson.videoStatus === 'PROCESSING' || lesson.videoStatus === 'UPLOADED' ? 'Video is being processed…' : 'No video for this lesson.'}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-bold">{lesson.title}</h1>
          <div className="flex gap-2">
            {data.enrolled && !progress?.completedLessonIds.includes(lesson.id) && (
              <button className="btn-outline" onClick={() => save(0, true)}>Mark as complete</button>
            )}
            {next && <button className="btn-primary" onClick={() => navigate(`/learn/${data.course.id}/${next.id}`)}>Next lesson →</button>}
          </div>
        </div>
        {lesson.content && <div className="card whitespace-pre-line text-slate-700">{lesson.content}</div>}
        {lessonQuizzes.map((q) => (
          <Link key={q.id} to={`/quiz/${q.id}`} className="card block hover:shadow-md">📝 Test yourself: <b>{q.title}</b> ({q._count.questions} questions)</Link>
        ))}
        {progress?.complete && (
          <div className="card border-green-200 bg-green-50 text-green-800">
            🎉 You've completed this course! <Link to={`/courses/${data.course.id}`} className="font-semibold underline">Get your certificate</Link>
          </div>
        )}
      </section>
    </div>
  );
}
