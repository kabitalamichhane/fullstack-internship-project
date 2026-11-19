import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { asyncHandler, HttpError } from '../utils/http';
import { issueCertificate, writeCertificatePdf } from '../services/certificate.service';

const router = Router();

/** Public verification page data — anyone (e.g. an employer) can check a certificate code. */
router.get(
  '/verify/:code',
  asyncHandler(async (req, res) => {
    const cert = await prisma.certificate.findUnique({
      where: { code: req.params.code.toUpperCase() },
      include: { user: { select: { name: true } }, course: { select: { title: true, instructor: { select: { name: true } } } } },
    });
    if (!cert) throw new HttpError(404, 'No certificate with this code');
    res.json({ valid: true, name: cert.user.name, course: cert.course.title, instructor: cert.course.instructor.name, issuedAt: cert.issuedAt, code: cert.code });
  }),
);

router.get(
  '/',
  authenticate,
  asyncHandler(async (req, res) => {
    const certificates = await prisma.certificate.findMany({
      where: { userId: req.user!.id },
      include: { course: { select: { title: true } } },
      orderBy: { issuedAt: 'desc' },
    });
    res.json({ certificates });
  }),
);

/** Issue (if eligible) and download the certificate PDF for a course. */
router.get(
  '/course/:courseId/pdf',
  authenticate,
  asyncHandler(async (req, res) => {
    const cert = await issueCertificate(req.user!.id, req.params.courseId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="certificate-${cert.code}.pdf"`);
    await writeCertificatePdf(cert.id, res);
  }),
);

export default router;
