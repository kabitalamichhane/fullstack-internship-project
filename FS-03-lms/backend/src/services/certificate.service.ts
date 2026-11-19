import PDFDocument from 'pdfkit';
import crypto from 'crypto';
import { Writable } from 'stream';
import { prisma } from '../lib/prisma';
import { config } from '../config';
import { HttpError } from '../utils/http';
import { getCourseProgress } from './progress.service';

/** Issue the certificate once (idempotent). Only allowed when the course is complete. */
export async function issueCertificate(userId: string, courseId: string) {
  const existing = await prisma.certificate.findUnique({ where: { userId_courseId: { userId, courseId } } });
  if (existing) return existing;
  const progress = await getCourseProgress(userId, courseId);
  if (!progress.complete) {
    throw new HttpError(400, `Finish all lessons (${progress.completedLessons}/${progress.totalLessons}) and pass all quizzes (${progress.passedQuizzes}/${progress.totalQuizzes}) to get your certificate`);
  }
  const code = crypto.randomBytes(5).toString('hex').toUpperCase(); // e.g. 9F2A11C03B
  return prisma.certificate.create({ data: { userId, courseId, code } });
}

/** Draw a landscape A4 certificate and stream it as a PDF. */
export async function writeCertificatePdf(certificateId: string, out: Writable) {
  const cert = await prisma.certificate.findUnique({
    where: { id: certificateId },
    include: { user: { select: { name: true } }, course: { select: { title: true, instructor: { select: { name: true } } } } },
  });
  if (!cert) throw new HttpError(404, 'Certificate not found');

  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 0 });
  doc.pipe(out);
  const W = doc.page.width;
  const H = doc.page.height;

  doc.rect(0, 0, W, H).fill('#f8fafc');
  doc.lineWidth(6).strokeColor('#1e3a8a').rect(24, 24, W - 48, H - 48).stroke();
  doc.lineWidth(1.5).strokeColor('#c9a227').rect(36, 36, W - 72, H - 72).stroke();

  const center = (text: string, y: number, size: number, font = 'Helvetica', color = '#0f172a') =>
    doc.font(font).fontSize(size).fillColor(color).text(text, 0, y, { width: W, align: 'center' });

  center('LearnHub Academy', 80, 18, 'Helvetica-Bold', '#1e3a8a');
  center('CERTIFICATE OF COMPLETION', 130, 32, 'Helvetica-Bold');
  center('This is to certify that', 200, 14, 'Helvetica', '#475569');
  center(cert.user.name, 230, 38, 'Times-BoldItalic', '#1e3a8a');
  doc.moveTo(W / 2 - 200, 280).lineTo(W / 2 + 200, 280).lineWidth(1).strokeColor('#94a3b8').stroke();
  center('has successfully completed the course', 300, 14, 'Helvetica', '#475569');
  center(cert.course.title, 330, 24, 'Helvetica-Bold');

  const date = cert.issuedAt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  doc.font('Helvetica').fontSize(12).fillColor('#0f172a');
  doc.text(date, 120, 440, { width: 220, align: 'center' });
  doc.text(cert.course.instructor.name, W - 340, 440, { width: 220, align: 'center' });
  doc.moveTo(120, 435).lineTo(340, 435).moveTo(W - 340, 435).lineTo(W - 120, 435).strokeColor('#0f172a').stroke();
  doc.fontSize(10).fillColor('#64748b');
  doc.text('Date issued', 120, 460, { width: 220, align: 'center' });
  doc.text('Instructor', W - 340, 460, { width: 220, align: 'center' });

  center(`Certificate ID: ${cert.code}  ·  Verify at ${config.clientUrl}/verify/${cert.code}`, H - 80, 9, 'Helvetica', '#64748b');
  doc.end();
}
