export type Role = 'STUDENT' | 'INSTRUCTOR' | 'ADMIN';
export type User = { id: string; email: string; name: string; role: Role };
export type VideoStatus = 'NONE' | 'UPLOADED' | 'PROCESSING' | 'READY' | 'FAILED';

export type Lesson = {
  id: string;
  title: string;
  content: string | null;
  position: number;
  isPreview: boolean;
  durationSec: number | null;
  videoStatus: VideoStatus;
  hlsUrl: string | null;
  videoError?: string | null;
};

export type QuizSummary = { id: string; title: string; lessonId: string | null; passPercent: number; _count: { questions: number } };
export type LiveClass = { id: string; title: string; scheduledAt: string; status: 'SCHEDULED' | 'LIVE' | 'ENDED'; roomName: string };

export type Course = {
  id: string;
  slug: string;
  title: string;
  subtitle?: string;
  description: string;
  category: string;
  level: string;
  priceCents: number;
  thumbnailUrl?: string;
  published: boolean;
  instructor: { id?: string; name: string; bio?: string };
  lessons?: Lesson[];
  quizzes?: QuizSummary[];
  liveClasses?: LiveClass[];
  _count?: { lessons?: number; enrollments?: number };
};

export type Progress = {
  totalLessons: number;
  completedLessons: number;
  percent: number;
  totalQuizzes: number;
  passedQuizzes: number;
  completedLessonIds: string[];
  passedQuizIds: string[];
  lessonProgress: Record<string, { watchedSec: number; completed: boolean }>;
  complete: boolean;
};

export type CourseDetail = { course: Course; enrolled: boolean; hasAccess: boolean; isOwner: boolean; progress: Progress | null };
