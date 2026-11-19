import { FormEvent, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, API_URL } from '../../lib/api';
import { dateTime, duration } from '../../lib/format';
import type { CourseDetail, Lesson } from '../../types';

const STATUS_STYLE: Record<string, string> = {
  NONE: 'bg-slate-200 text-slate-700',
  UPLOADED: 'bg-amber-100 text-amber-800',
  PROCESSING: 'bg-blue-100 text-blue-800',
  READY: 'bg-green-100 text-green-800',
  FAILED: 'bg-red-100 text-red-800',
};

type DraftQuestion = { text: string; options: string[]; correctIndex: number; explanation: string };
const emptyQuestion = (): DraftQuestion => ({ text: '', options: ['', '', '', ''], correctIndex: 0, explanation: '' });

/** Upload a file with progress events (fetch has no upload progress, so XHR is used here). */
function uploadWithProgress(url: string, file: File, field: string, onProgress: (pct: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.setRequestHeader('Authorization', `Bearer ${localStorage.getItem('token')}`);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error(JSON.parse(xhr.responseText || '{}').error ?? 'Upload failed')));
    xhr.onerror = () => reject(new Error('Network error during upload'));
    const fd = new FormData();
    fd.append(field, file);
    xhr.send(fd);
  });
}

export default function CourseEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<CourseDetail | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [uploads, setUploads] = useState<Record<string, number>>({}); // lessonId → upload %
  const [processing, setProcessing] = useState<Record<string, number>>({}); // lessonId → transcode %
  const [questions, setQuestions] = useState<DraftQuestion[]>([emptyQuestion()]);
  const pollRef = useRef<number>();

  const load = () => api<CourseDetail>(`/courses/${id}`).then(setData).catch((e) => setMsg({ ok: false, text: e.message }));
  useEffect(() => {
    load();
    return () => window.clearInterval(pollRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Poll the video pipeline while any lesson is uploading/processing.
  useEffect(() => {
    window.clearInterval(pollRef.current);
    const busy = data?.course.lessons?.filter((l) => l.videoStatus === 'UPLOADED' || l.videoStatus === 'PROCESSING') ?? [];
    if (!busy.length) return;
    pollRef.current = window.setInterval(async () => {
      const statuses = await Promise.all(busy.map((l) => api<{ id: string; videoStatus: string; progress: number }>(`/lessons/${l.id}/status`)));
      setProcessing(Object.fromEntries(statuses.map((s) => [s.id, s.progress])));
      if (statuses.some((s) => s.videoStatus === 'READY' || s.videoStatus === 'FAILED')) load();
    }, 3000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setMsg(null);
    try {
      await fn();
      if (ok) setMsg({ ok: true, text: ok });
      await load();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    }
  };

  if (!data) return <p className="p-8 text-center text-slate-500">{msg?.text ?? 'Loading…'}</p>;
  const c = data.course;
  const lessons = c.lessons ?? [];

  const saveDetails = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set('priceCents', String(Math.round(Number(fd.get('price') || 0) * 100)));
    fd.delete('price');
    if (!(fd.get('thumbnail') as File)?.size) fd.delete('thumbnail');
    run(() => api(`/courses/${c.id}`, { method: 'PUT', body: fd }), 'Course details saved');
  };

  const addLesson = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    run(async () => {
      await api(`/lessons/course/${c.id}`, { method: 'POST', json: { title: f.get('title'), content: f.get('content') || undefined, isPreview: f.get('isPreview') === 'on' } });
      form.reset();
    }, 'Lesson added');
  };

  const uploadVideo = async (lesson: Lesson, file: File) => {
    setUploads((u) => ({ ...u, [lesson.id]: 0 }));
    try {
      await uploadWithProgress(`${API_URL}/api/lessons/${lesson.id}/video`, file, 'video', (p) => setUploads((u) => ({ ...u, [lesson.id]: p })));
      setMsg({ ok: true, text: `Uploaded "${file.name}". Converting to streaming format in the background…` });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setUploads((u) => {
        const { [lesson.id]: _, ...rest } = u;
        return rest;
      });
      load();
    }
  };

  const createQuiz = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    run(async () => {
      await api(`/quizzes/course/${c.id}`, {
        method: 'POST',
        json: {
          title: f.get('quizTitle'),
          passPercent: Number(f.get('passPercent')),
          lessonId: f.get('lessonId') || null,
          questions: questions.map((q) => ({ ...q, options: q.options.filter(Boolean), explanation: q.explanation || undefined })),
        },
      });
      form.reset();
      setQuestions([emptyQuestion()]);
    }, 'Quiz created');
  };

  const scheduleLive = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    run(async () => {
      await api(`/live/course/${c.id}`, { method: 'POST', json: { title: f.get('liveTitle'), scheduledAt: new Date(String(f.get('scheduledAt'))).toISOString() } });
      form.reset();
    }, 'Live class scheduled');
  };

  const updateQ = (i: number, patch: Partial<DraftQuestion>) => setQuestions(questions.map((q, j) => (j === i ? { ...q, ...patch } : q)));

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link to="/instructor" className="text-sm text-brand-600">← Dashboard</Link>
          <h1 className="text-2xl font-bold">{c.title}</h1>
        </div>
        <div className="flex gap-2">
          <Link to={`/courses/${c.id}`} className="btn-outline">Preview</Link>
          <button className={c.published ? 'btn-outline' : 'btn-primary'} onClick={() => run(() => api(`/courses/${c.id}/publish`, { method: 'POST', json: { published: !c.published } }), c.published ? 'Course unpublished' : 'Course published!')}>
            {c.published ? 'Unpublish' : 'Publish course'}
          </button>
        </div>
      </div>
      {msg && <p className={`card ${msg.ok ? 'text-green-700' : 'text-red-600'}`} role="status">{msg.text}</p>}

      {/* 1. Details */}
      <form onSubmit={saveDetails} className="card grid gap-3 sm:grid-cols-2">
        <h2 className="text-lg font-semibold sm:col-span-2">Course details</h2>
        <div className="sm:col-span-2"><label className="label" htmlFor="title">Title</label><input id="title" name="title" required className="input" defaultValue={c.title} /></div>
        <div className="sm:col-span-2"><label className="label" htmlFor="subtitle">Subtitle</label><input id="subtitle" name="subtitle" className="input" defaultValue={c.subtitle} /></div>
        <div className="sm:col-span-2"><label className="label" htmlFor="description">Description</label><textarea id="description" name="description" rows={4} required minLength={10} className="input" defaultValue={c.description} /></div>
        <div><label className="label" htmlFor="category">Category</label><input id="category" name="category" className="input" defaultValue={c.category} /></div>
        <div>
          <label className="label" htmlFor="level">Level</label>
          <select id="level" name="level" className="input" defaultValue={c.level}><option>Beginner</option><option>Intermediate</option><option>Advanced</option></select>
        </div>
        <div><label className="label" htmlFor="price">Price ($, 0 = free)</label><input id="price" name="price" type="number" min="0" step="0.01" className="input" defaultValue={c.priceCents / 100} /></div>
        <div><label className="label" htmlFor="thumbnail">Thumbnail image</label><input id="thumbnail" name="thumbnail" type="file" accept="image/*" /></div>
        <button className="btn-primary w-fit">Save details</button>
      </form>

      {/* 2. Lessons + video upload */}
      <section className="card space-y-3">
        <h2 className="text-lg font-semibold">Lessons & videos</h2>
        <p className="text-sm text-slate-500">Uploaded videos are converted by FFmpeg into adaptive HLS (360p + 720p) and delivered through the CDN.</p>
        <ul className="divide-y">
          {lessons.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center gap-3 py-3">
              <span className="w-6 text-slate-400">{l.position}.</span>
              <div className="min-w-[200px] flex-1">
                <p className="font-medium">{l.title} {l.isPreview && <span className="badge bg-green-100 text-green-800">Free preview</span>}</p>
                <p className="text-xs text-slate-500">
                  <span className={`badge ${STATUS_STYLE[l.videoStatus]}`}>{l.videoStatus}</span> {duration(l.durationSec)}
                  {l.videoStatus === 'PROCESSING' && ` · converting ${processing[l.id] ?? 0}%`}
                  {l.videoStatus === 'FAILED' && <span className="text-red-600"> · {l.videoError}</span>}
                </p>
                {uploads[l.id] !== undefined && (
                  <div className="mt-1 h-1.5 w-full rounded bg-slate-200"><div className="h-full rounded bg-brand-500" style={{ width: `${uploads[l.id]}%` }} /></div>
                )}
              </div>
              <label className="btn-outline cursor-pointer">
                {l.videoStatus === 'NONE' ? 'Upload video' : 'Replace video'}
                <input type="file" accept="video/*" className="sr-only" disabled={uploads[l.id] !== undefined} onChange={(e) => e.target.files?.[0] && uploadVideo(l, e.target.files[0])} />
              </label>
              <button className="text-sm text-slate-600" onClick={() => run(() => api(`/lessons/${l.id}`, { method: 'PUT', json: { isPreview: !l.isPreview } }))}>
                {l.isPreview ? 'Make private' : 'Make preview'}
              </button>
              <button className="text-sm text-red-600" onClick={() => confirm(`Delete lesson "${l.title}"?`) && run(() => api(`/lessons/${l.id}`, { method: 'DELETE' }), 'Lesson deleted')}>Delete</button>
            </li>
          ))}
          {lessons.length === 0 && <li className="py-3 text-slate-500">No lessons yet.</li>}
        </ul>
        <form onSubmit={addLesson} className="grid gap-2 rounded-lg bg-slate-50 p-3 sm:grid-cols-[1fr_auto]">
          <input name="title" required minLength={2} placeholder="New lesson title" className="input" aria-label="Lesson title" />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isPreview" /> Free preview</label>
          <textarea name="content" rows={2} placeholder="Lesson notes (optional)" className="input sm:col-span-2" aria-label="Lesson notes" />
          <button className="btn-primary w-fit">Add lesson</button>
        </form>
      </section>

      {/* 3. Quizzes */}
      <section className="card space-y-3">
        <h2 className="text-lg font-semibold">Quizzes</h2>
        <ul className="space-y-1 text-sm">
          {c.quizzes?.map((q) => (
            <li key={q.id} className="flex items-center justify-between rounded border p-2">
              <span>📝 {q.title} · {q._count.questions} questions · pass {q.passPercent}%</span>
              <span className="space-x-3">
                <Link className="text-brand-600" to={`/quiz/${q.id}`}>Open</Link>
                <button className="text-red-600" onClick={() => confirm('Delete this quiz?') && run(() => api(`/quizzes/${q.id}`, { method: 'DELETE' }), 'Quiz deleted')}>Delete</button>
              </span>
            </li>
          ))}
        </ul>
        <form onSubmit={createQuiz} className="space-y-3 rounded-lg bg-slate-50 p-3">
          <div className="grid gap-2 sm:grid-cols-3">
            <input name="quizTitle" required placeholder="Quiz title" className="input" aria-label="Quiz title" />
            <select name="lessonId" className="input" aria-label="Attach to lesson">
              <option value="">End of course</option>
              {lessons.map((l) => <option key={l.id} value={l.id}>After: {l.title}</option>)}
            </select>
            <input name="passPercent" type="number" min={1} max={100} defaultValue={70} className="input" aria-label="Pass percentage" />
          </div>
          {questions.map((q, i) => (
            <fieldset key={i} className="space-y-2 rounded border bg-white p-3">
              <legend className="px-1 text-sm font-medium">Question {i + 1}</legend>
              <input required className="input" placeholder="Question text" value={q.text} onChange={(e) => updateQ(i, { text: e.target.value })} aria-label={`Question ${i + 1} text`} />
              {q.options.map((opt, oi) => (
                <div key={oi} className="flex items-center gap-2">
                  <input type="radio" name={`correct-${i}`} checked={q.correctIndex === oi} onChange={() => updateQ(i, { correctIndex: oi })} aria-label={`Mark option ${oi + 1} correct`} />
                  <input className="input" required={oi < 2} placeholder={`Option ${oi + 1}${oi < 2 ? '' : ' (optional)'}`} value={opt} onChange={(e) => updateQ(i, { options: q.options.map((o, k) => (k === oi ? e.target.value : o)) })} />
                </div>
              ))}
              <input className="input" placeholder="Explanation shown after grading (optional)" value={q.explanation} onChange={(e) => updateQ(i, { explanation: e.target.value })} aria-label="Explanation" />
              {questions.length > 1 && <button type="button" className="text-sm text-red-600" onClick={() => setQuestions(questions.filter((_, j) => j !== i))}>Remove question</button>}
            </fieldset>
          ))}
          <p className="text-xs text-slate-500">Select the radio button next to the correct answer.</p>
          <div className="flex gap-2">
            <button type="button" className="btn-outline" onClick={() => setQuestions([...questions, emptyQuestion()])}>+ Add question</button>
            <button className="btn-primary">Create quiz</button>
          </div>
        </form>
      </section>

      {/* 4. Live classes */}
      <section className="card space-y-3">
        <h2 className="text-lg font-semibold">Live classes</h2>
        <ul className="space-y-1 text-sm">
          {c.liveClasses?.map((lc) => (
            <li key={lc.id} className="flex items-center justify-between rounded border p-2">
              <span>🎥 {lc.title} · {dateTime(lc.scheduledAt)} · {lc.status}</span>
              {lc.status !== 'ENDED' && <button className="btn-primary" onClick={() => navigate(`/live/${lc.id}`)}>Open studio</button>}
            </li>
          ))}
        </ul>
        <form onSubmit={scheduleLive} className="grid gap-2 rounded-lg bg-slate-50 p-3 sm:grid-cols-[1fr_auto_auto]">
          <input name="liveTitle" required minLength={3} placeholder="Session title" className="input" aria-label="Live class title" />
          <input name="scheduledAt" type="datetime-local" required className="input" aria-label="Date and time" />
          <button className="btn-primary">Schedule</button>
        </form>
      </section>

      {!c.published && (
        <button className="text-sm text-red-600" onClick={() => confirm('Delete this course permanently?') && api(`/courses/${c.id}`, { method: 'DELETE' }).then(() => navigate('/instructor')).catch((e) => setMsg({ ok: false, text: e.message }))}>
          Delete course
        </button>
      )}
    </div>
  );
}
