export default function ProgressBar({ percent, label }: { percent: number; label?: string }) {
  return (
    <div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label={label ?? 'Progress'}>
        <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${percent}%` }} />
      </div>
      <p className="mt-1 text-xs text-slate-500">{label ?? `${percent}% complete`}</p>
    </div>
  );
}
