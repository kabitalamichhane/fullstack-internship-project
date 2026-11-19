import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';

type Question = { id: string; text: string; options: string[]; position: number };
type Quiz = { id: string; title: string; passPercent: number; courseId: string; questions: Question[]; course: { title: string } };
type Attempt = { id: string; score: number; passed: boolean; createdAt: string };
type Result = {
  score: number;
  passed: boolean;
  correct: number;
  total: number;
  passPercent: number;
  feedback: { questionId: string; correct: boolean; correctIndex: number; chosen: number; explanation?: string }[];
};

/** Take a quiz → submitted to the server → auto-graded with per-question feedback. */
export default function QuizPage() {
  const { id } = useParams();
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [answers, setAnswers] = useState<number[]>([]);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState('');

  const load = () =>
    api<{ quiz: Quiz; attempts: Attempt[] }>(`/quizzes/${id}`)
      .then((r) => {
        setQuiz(r.quiz);
        setAttempts(r.attempts);
        setAnswers(new Array(r.quiz.questions.length).fill(-1));
      })
      .catch((e) => setError(e.message));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const submit = async () => {
    setError('');
    if (answers.includes(-1)) return setError('Please answer every question.');
    try {
      const r = await api<Result>(`/quizzes/${id}/attempts`, { method: 'POST', json: { answers } });
      setResult(r);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      api<{ attempts: Attempt[] }>(`/quizzes/${id}`).then((x) => setAttempts(x.attempts));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const retry = () => {
    setResult(null);
    setAnswers(new Array(quiz!.questions.length).fill(-1));
  };

  if (!quiz) return <p className="p-8 text-center text-slate-500">{error || 'Loading quiz…'}</p>;
  const best = attempts.reduce((m, a) => Math.max(m, a.score), 0);

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-8">
      <Link to={`/courses/${quiz.courseId}`} className="text-sm text-brand-600">← {quiz.course.title}</Link>
      <h1 className="text-2xl font-bold">{quiz.title}</h1>
      <p className="text-sm text-slate-500">
        {quiz.questions.length} questions · Pass mark {quiz.passPercent}%{attempts.length > 0 && ` · Best score ${best}% (${attempts.length} attempts)`}
      </p>

      {result && (
        <div className={`card ${result.passed ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50'}`} role="status">
          <p className="text-2xl font-bold">{result.score}%</p>
          <p>{result.correct} of {result.total} correct — {result.passed ? '🎉 Passed!' : `You need ${result.passPercent}% to pass. Review the answers below and try again.`}</p>
          <div className="mt-3 flex gap-2">
            <button className="btn-outline" onClick={retry}>Try again</button>
            <Link className="btn-primary" to={`/courses/${quiz.courseId}`}>Back to course</Link>
          </div>
        </div>
      )}

      {quiz.questions.map((q, qi) => {
        const fb = result?.feedback[qi];
        return (
          <fieldset key={q.id} className="card space-y-2" disabled={!!result}>
            <legend className="sr-only">Question {qi + 1}</legend>
            <p className="font-medium">{qi + 1}. {q.text}</p>
            {q.options.map((opt, oi) => {
              const isChosen = answers[qi] === oi;
              const style = fb
                ? oi === fb.correctIndex
                  ? 'border-green-500 bg-green-50'
                  : isChosen
                    ? 'border-red-400 bg-red-50'
                    : 'border-slate-200'
                : isChosen
                  ? 'border-brand-500 bg-brand-50'
                  : 'border-slate-200 hover:bg-slate-50';
              return (
                <label key={oi} className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 ${style}`}>
                  <input type="radio" name={q.id} checked={isChosen} onChange={() => setAnswers(answers.map((a, i) => (i === qi ? oi : a)))} />
                  {opt}
                  {fb && oi === fb.correctIndex && <span className="ml-auto text-sm text-green-700">Correct answer</span>}
                </label>
              );
            })}
            {fb?.explanation && <p className="text-sm text-slate-600">💡 {fb.explanation}</p>}
          </fieldset>
        );
      })}

      {error && <p className="text-red-600" role="alert">{error}</p>}
      {!result && <button className="btn-primary w-full" onClick={submit}>Submit quiz & grade answers</button>}
    </div>
  );
}
