import PDFDocument from 'pdfkit';
import { Writable } from 'stream';
import { prisma } from '../lib/prisma';
import { HttpError } from '../utils/http';
import { ShippingAddress } from './order.service';

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/** Stream a PDF invoice for an order to any writable stream (e.g. the HTTP response). */
export async function writeInvoicePdf(orderId: string, out: Writable) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      user: { select: { name: true, email: true } },
      vendorOrders: { include: { items: true, vendor: { select: { storeName: true } } } },
    },
  });
  if (!order) throw new HttpError(404, 'Order not found');
  const addr = order.shippingAddress as unknown as ShippingAddress;

  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  doc.pipe(out);

  doc.fontSize(22).text('Nexmart Marketplace', { continued: false });
  doc.fontSize(10).fillColor('#666').text('Tax Invoice');
  doc.moveDown();

  doc.fillColor('#000').fontSize(10);
  doc.text(`Invoice #: INV-${order.id.slice(-8).toUpperCase()}`);
  doc.text(`Order ID: ${order.id}`);
  doc.text(`Date: ${(order.paidAt ?? order.createdAt).toDateString()}`);
  doc.text(`Status: ${order.status}`);
  doc.moveDown();

  doc.fontSize(12).text('Bill / Ship to', { underline: true });
  doc.fontSize(10).text(addr.fullName).text(addr.line1);
  if (addr.line2) doc.text(addr.line2);
  doc.text(`${addr.city}${addr.state ? ', ' + addr.state : ''} ${addr.postalCode}`).text(addr.country).text(addr.phone);
  doc.text(order.user.email);
  doc.moveDown();

  for (const vo of order.vendorOrders) {
    doc.fontSize(12).text(`Sold by: ${vo.vendor.storeName}`, { underline: true });
    doc.fontSize(10);
    const top = doc.y + 4;
    doc.text('Item', 50, top).text('Qty', 330, top).text('Price', 380, top).text('Total', 470, top);
    doc.moveTo(50, doc.y + 2).lineTo(545, doc.y + 2).stroke();
    for (const it of vo.items) {
      const y = doc.y + 6;
      doc.text(it.title.slice(0, 50), 50, y, { width: 270 });
      doc.text(String(it.quantity), 330, y).text(money(it.unitPriceCents), 380, y).text(money(it.unitPriceCents * it.quantity), 470, y);
    }
    doc.moveDown();
    doc.x = 50;
  }

  doc.moveDown();
  const right = (label: string, value: string, bold = false) => {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').text(`${label}: ${value}`, 350, doc.y, { align: 'right', width: 195 });
  };
  right('Subtotal', money(order.subtotalCents));
  if (order.discountCents) right(`Discount (${order.couponCode})`, `-${money(order.discountCents)}`);
  right('Total paid', money(order.totalCents), true);

  doc.font('Helvetica').fontSize(8).fillColor('#888').text('Thank you for shopping with us. This is a computer-generated invoice.', 50, 760, { align: 'center', width: 495 });
  doc.end();
}
