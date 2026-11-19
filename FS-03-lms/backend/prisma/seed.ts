/**
 * Demo data. Run: npm run seed
 *
 * Demo logins (password: Password123!)
 *   admin@demo.com       ADMIN
 *   instructor@demo.com  INSTRUCTOR
 *   student@demo.com     STUDENT
 *
 * Seeded lessons point at a public HLS test stream of "Big Buck Bunny" (Blender open movie)
 * so videos play before you upload your own. Upload a video from the course editor to test
 * the FFmpeg → S3 → CloudFront pipeline.
 */
import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const SAMPLE_HLS = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8';

async function main() {
  const passwordHash = await bcrypt.hash('Password123!', 10);
  const mk = (email: string, name: string, role: Role, bio?: string) =>
    prisma.user.upsert({ where: { email }, update: {}, create: { email, name, role, passwordHash, bio } });

  await mk('admin@demo.com', 'Platform Admin', 'ADMIN');
  const instructor = await mk('instructor@demo.com', 'Asha Sharma', 'INSTRUCTOR', 'Full-stack engineer and teacher with 8 years of experience.');
  const student = await mk('student@demo.com', 'Demo Student', 'STUDENT');

  if (await prisma.course.findUnique({ where: { slug: 'web-development-foundations' } })) {
    console.log('Seed data already present');
    return;
  }

  const web = await prisma.course.create({
    data: {
      instructorId: instructor.id,
      title: 'Web Development Foundations',
      slug: 'web-development-foundations',
      subtitle: 'HTML, CSS and how the web works',
      description: 'Learn how browsers, URLs and HTTP work, then build responsive pages with semantic HTML and modern CSS.',
      category: 'Web Development',
      level: 'Beginner',
      priceCents: 0,
      published: true,
      lessons: {
        create: [
          { position: 1, title: 'How websites work', content: 'Browsers, URLs, DNS and the request/response cycle.', isPreview: true, videoStatus: 'READY', hlsUrl: SAMPLE_HLS, durationSec: 634 },
          { position: 2, title: 'Semantic HTML', content: 'header, nav, main, section, article, footer and accessible forms.', videoStatus: 'READY', hlsUrl: SAMPLE_HLS, durationSec: 634 },
          { position: 3, title: 'Modern CSS: Flexbox & Grid', content: 'Layouts and responsive design with media queries.', videoStatus: 'READY', hlsUrl: SAMPLE_HLS, durationSec: 634 },
        ],
      },
    },
  });

  await prisma.quiz.create({
    data: {
      courseId: web.id,
      title: 'HTML & CSS Foundations Quiz',
      passPercent: 70,
      questions: {
        create: [
          { position: 1, text: 'What is HTML used for?', options: ['To structure the content of a web page', 'To compile machine code', 'To run database queries', 'To encrypt network traffic'], correctIndex: 0, explanation: 'HTML describes the structure and meaning of content.' },
          { position: 2, text: 'What is CSS used for?', options: ['Storing user records', 'Styling and laying out the page', 'Defining REST endpoints', 'Parsing JSON'], correctIndex: 1, explanation: 'CSS controls appearance and layout.' },
          { position: 3, text: 'Why are labels important in forms?', options: ['They encrypt passwords', 'They replace CSS', 'They identify inputs and improve accessibility', 'They block numbers'], correctIndex: 2 },
          { position: 4, text: 'What does responsive design mean?', options: ['The site reloads every 5 seconds', 'The server answers in under 100ms', 'The database runs in parallel', 'The layout adapts to different screen sizes'], correctIndex: 3 },
        ],
      },
    },
  });

  const node = await prisma.course.create({
    data: {
      instructorId: instructor.id,
      title: 'Backend APIs with Node.js & Express',
      slug: 'backend-apis-node-express',
      subtitle: 'REST, CRUD, validation and databases',
      description: 'Design REST APIs, implement CRUD with Express and Prisma, validate input on the server and handle errors properly.',
      category: 'Backend',
      level: 'Intermediate',
      priceCents: 1999,
      published: true,
      lessons: {
        create: [
          { position: 1, title: 'What is an API?', isPreview: true, content: 'Clients, servers, HTTP methods and status codes.', videoStatus: 'READY', hlsUrl: SAMPLE_HLS, durationSec: 634 },
          { position: 2, title: 'CRUD with Express', content: 'GET, POST, PUT/PATCH, DELETE.', videoStatus: 'READY', hlsUrl: SAMPLE_HLS, durationSec: 634 },
        ],
      },
      liveClasses: {
        create: { title: 'Live Q&A: Building your first API', scheduledAt: new Date(Date.now() + 2 * 86400000), roomName: 'seed-live-qa' },
      },
    },
  });

  await prisma.enrollment.create({ data: { userId: student.id, courseId: web.id } });
  // Some paid sales so the instructor dashboard has data
  const months = [5, 4, 3, 2, 1, 0];
  for (const m of months) {
    const buyer = await mk(`buyer${m}@demo.com`, `Buyer ${m}`, 'STUDENT');
    const paidAt = new Date();
    paidAt.setMonth(paidAt.getMonth() - m);
    await prisma.payment.create({
      data: { userId: buyer.id, courseId: node.id, amountCents: 1999, platformFeeCents: 400, instructorEarningCents: 1599, status: 'PAID', paidAt },
    });
    await prisma.enrollment.create({ data: { userId: buyer.id, courseId: node.id } });
  }
  console.log('Seed complete');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
