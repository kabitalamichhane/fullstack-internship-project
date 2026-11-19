import { describe, expect, it } from 'vitest';
import { buildHlsArgs, gradeQuiz, isCourseComplete, isWatched, progressPercent, revenueSplit, slugify } from '../src/utils/learning';

const questions = [
  { id: 'q1', correctIndex: 0 },
  { id: 'q2', correctIndex: 2 },
  { id: 'q3', correctIndex: 1 },
  { id: 'q4', correctIndex: 3 },
];

describe('gradeQuiz (auto-grading)', () => {
  it('scores all correct as 100% and passed', () => {
    const r = gradeQuiz(questions, [0, 2, 1, 3], 70);
    expect(r.score).toBe(100);
    expect(r.passed).toBe(true);
  });
  it('scores 2/4 as 50% and failed at 70% pass mark', () => {
    const r = gradeQuiz(questions, [0, 2, 0, 0], 70);
    expect(r.correct).toBe(2);
    expect(r.score).toBe(50);
    expect(r.passed).toBe(false);
  });
  it('passes exactly at the threshold', () => {
    expect(gradeQuiz(questions, [0, 2, 1, 0], 75).passed).toBe(true);
  });
  it('treats missing answers as wrong and reports per-question feedback', () => {
    const r = gradeQuiz(questions, [0], 70);
    expect(r.correct).toBe(1);
    expect(r.results[1]).toEqual({ questionId: 'q2', correct: false, correctIndex: 2, chosen: -1 });
  });
});

describe('progress & completion', () => {
  it('computes progress percent', () => {
    expect(progressPercent(3, 1)).toBe(33);
    expect(progressPercent(0, 0)).toBe(0);
    expect(progressPercent(2, 2)).toBe(100);
  });
  it('needs every lesson AND every quiz passed', () => {
    expect(isCourseComplete(['l1', 'l2'], ['l1', 'l2'], ['qz'], ['qz'])).toBe(true);
    expect(isCourseComplete(['l1', 'l2'], ['l1'], [], [])).toBe(false);
    expect(isCourseComplete(['l1'], ['l1'], ['qz'], [])).toBe(false);
    expect(isCourseComplete([], [], [], [])).toBe(false);
  });
  it('marks a video watched at 90%', () => {
    expect(isWatched(90, 100)).toBe(true);
    expect(isWatched(89, 100)).toBe(false);
    expect(isWatched(50, null)).toBe(false);
  });
});

describe('revenueSplit', () => {
  it('splits sale between platform and instructor and adds up', () => {
    expect(revenueSplit(1999, 20)).toEqual({ platformFeeCents: 400, instructorEarningCents: 1599 });
    const s = revenueSplit(4999, 30);
    expect(s.platformFeeCents + s.instructorEarningCents).toBe(4999);
  });
});

describe('helpers', () => {
  it('slugifies titles', () => {
    expect(slugify('Backend APIs with Node.js & Express!')).toBe('backend-apis-with-node-js-express');
  });
  it('builds FFmpeg HLS args with and without audio', () => {
    const withAudio = buildHlsArgs('in.mp4', 'out', true).join(' ');
    expect(withAudio.includes('-master_pl_name master.m3u8')).toBe(true);
    expect(withAudio.includes('v:0,a:0,name:360p v:1,a:1,name:720p')).toBe(true);
    const silent = buildHlsArgs('in.mp4', 'out', false).join(' ');
    expect(silent.includes('-c:a')).toBe(false);
    expect(silent.includes('v:0,name:360p v:1,name:720p')).toBe(true);
  });
});
