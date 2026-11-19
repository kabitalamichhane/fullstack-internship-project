/** Pure business rules (no database) — easy to unit test. */

export type GradableQuestion = { id: string; correctIndex: number };

export type GradeResult = {
  correct: number;
  total: number;
  score: number; // percent 0-100
  passed: boolean;
  results: { questionId: string; correct: boolean; correctIndex: number; chosen: number }[];
};

/** Auto-grade a multiple-choice quiz. answers[i] is the chosen option index for questions[i] (-1 = skipped). */
export function gradeQuiz(questions: GradableQuestion[], answers: number[], passPercent: number): GradeResult {
  const results = questions.map((q, i) => {
    const chosen = Number.isInteger(answers[i]) ? answers[i] : -1;
    return { questionId: q.id, correct: chosen === q.correctIndex, correctIndex: q.correctIndex, chosen };
  });
  const correct = results.filter((r) => r.correct).length;
  const score = questions.length ? Math.round((correct / questions.length) * 100) : 0;
  return { correct, total: questions.length, score, passed: score >= passPercent, results };
}

/** Progress percentage for a course: completed lessons / total lessons. */
export function progressPercent(totalLessons: number, completedLessons: number) {
  if (totalLessons === 0) return 0;
  return Math.min(100, Math.round((completedLessons / totalLessons) * 100));
}

/** A course is complete when every lesson is completed AND every quiz has a passing attempt. */
export function isCourseComplete(lessonIds: string[], completedLessonIds: string[], quizIds: string[], passedQuizIds: string[]) {
  const done = new Set(completedLessonIds);
  const passed = new Set(passedQuizIds);
  return lessonIds.length > 0 && lessonIds.every((id) => done.has(id)) && quizIds.every((id) => passed.has(id));
}

/** A lesson counts as watched once the student has seen 90% of the video. */
export const isWatched = (watchedSec: number, durationSec?: number | null) =>
  !!durationSec && durationSec > 0 && watchedSec / durationSec >= 0.9;

/** Split a course sale between the platform and the instructor. */
export function revenueSplit(amountCents: number, platformFeePercent: number) {
  const platformFeeCents = Math.round((amountCents * platformFeePercent) / 100);
  return { platformFeeCents, instructorEarningCents: amountCents - platformFeeCents };
}

export const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60);

export type Rendition = { name: string; height: number; videoBitrate: string; maxrate: string; bufsize: string };

export const RENDITIONS: Rendition[] = [
  { name: '360p', height: 360, videoBitrate: '800k', maxrate: '856k', bufsize: '1200k' },
  { name: '720p', height: 720, videoBitrate: '2800k', maxrate: '2996k', bufsize: '4200k' },
];

/**
 * Build FFmpeg arguments that convert one input video into adaptive HLS:
 * one H.264 rendition per entry in `renditions` + a master playlist (master.m3u8).
 * Output: outDir/v0/index.m3u8, outDir/v0/seg_000.ts, ..., outDir/master.m3u8
 */
export function buildHlsArgs(input: string, outDir: string, hasAudio: boolean, renditions: Rendition[] = RENDITIONS) {
  const n = renditions.length;
  const split = `[0:v]split=${n}${renditions.map((_, i) => `[v${i}]`).join('')}`;
  const scales = renditions.map((r, i) => `[v${i}]scale=-2:${r.height}[v${i}out]`);
  const args = ['-y', '-i', input, '-filter_complex', [split, ...scales].join(';')];

  renditions.forEach((r, i) => {
    args.push('-map', `[v${i}out]`, `-c:v:${i}`, 'libx264', `-b:v:${i}`, r.videoBitrate, `-maxrate:v:${i}`, r.maxrate, `-bufsize:v:${i}`, r.bufsize);
    if (hasAudio) args.push('-map', 'a:0');
  });
  if (hasAudio) args.push('-c:a', 'aac', '-b:a', '128k', '-ac', '2');

  args.push(
    '-preset', 'veryfast',
    '-g', '48', '-keyint_min', '48', '-sc_threshold', '0',
    '-f', 'hls',
    '-hls_time', '6',
    '-hls_playlist_type', 'vod',
    '-hls_segment_filename', `${outDir}/v%v/seg_%03d.ts`,
    '-master_pl_name', 'master.m3u8',
    '-var_stream_map', renditions.map((r, i) => (hasAudio ? `v:${i},a:${i},name:${r.name}` : `v:${i},name:${r.name}`)).join(' '),
    `${outDir}/v%v/index.m3u8`,
  );
  return args;
}
