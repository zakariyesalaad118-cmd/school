import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import { resolveAssetUrl } from '../services/api';
import type { SchoolSettings, StudentQrCard } from '../types/nexus';

export type IdCardPdfLayout = 'cr80' | 'a4-sheet';

interface LoadedRaster {
  dataUrl: string;
  width: number;
  height: number;
}

function isSafeImageUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (/^data:image\/(png|jpeg|jpg|webp);base64,/i.test(trimmed)) return true;
  if (trimmed.startsWith('/')) return true;
  try {
    const parsed = new URL(trimmed, window.location.origin);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

async function loadImageAsPng(url?: string | null): Promise<LoadedRaster | null> {
  const resolvedUrl = resolveAssetUrl(url);
  if (!resolvedUrl || !isSafeImageUrl(resolvedUrl)) return null;

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.referrerPolicy = 'no-referrer';
    img.onload = () => {
      try {
        const w = img.naturalWidth || 256;
        const h = img.naturalHeight || 256;
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve({
          dataUrl: canvas.toDataURL('image/png'),
          width: w,
          height: h,
        });
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = resolvedUrl;
  });
}

function hexToRgb(hex: string | undefined, fallback: [number, number, number]): [number, number, number] {
  if (!hex || !/^#[0-9A-Fa-f]{6}$/.test(hex)) return fallback;
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

function drawCropMarks(doc: jsPDF, x: number, y: number, w: number, h: number) {
  const mark = 2.5;
  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.15);

  // Top-left
  doc.line(x - mark, y, x - 0.5, y);
  doc.line(x, y - mark, x, y - 0.5);
  // Top-right
  doc.line(x + w + 0.5, y, x + w + mark, y);
  doc.line(x + w, y - mark, x + w, y - 0.5);
  // Bottom-left
  doc.line(x - mark, y + h, x - 0.5, y + h);
  doc.line(x, y + h + 0.5, x, y + h + mark);
  // Bottom-right
  doc.line(x + w + 0.5, y + h, x + w + mark, y + h);
  doc.line(x + w, y + h + 0.5, x + w, y + h + mark);
}

function drawIdCard(
  doc: jsPDF,
  x: number,
  y: number,
  card: StudentQrCard,
  studentPhoto: LoadedRaster | null,
  schoolLogo: LoadedRaster | null,
  qrPngDataUrl: string,
  settings: SchoolSettings | null,
  badgeSubtitle: string
) {
  const cardW = 85.6;
  const cardH = 53.98;
  const headerH = 12.5;

  const primaryRgb = hexToRgb(settings?.primaryColor, [15, 76, 129]);
  const accentRgb = hexToRgb(settings?.accentColor, [5, 150, 105]);

  // Card Base Surface
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.25);
  doc.roundedRect(x, y, cardW, cardH, 2.2, 2.2, 'FD');

  // Header Banner
  doc.setFillColor(...primaryRgb);
  doc.rect(x + 0.15, y + 0.15, cardW - 0.3, headerH, 'F');

  // Accent Divider Stripe
  doc.setFillColor(...accentRgb);
  doc.rect(x + 0.15, y + headerH, cardW - 0.3, 1.1, 'F');

  // School Crest Box
  const crestX = x + 3.2;
  const crestY = y + 2;
  const crestSize = 8.6;
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(crestX, crestY, crestSize, crestSize, 1.2, 1.2, 'F');
  if (schoolLogo) {
    doc.addImage(schoolLogo.dataUrl, 'PNG', crestX + 0.6, crestY + 0.6, crestSize - 1.2, crestSize - 1.2);
  } else {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...primaryRgb);
    doc.text('NS', crestX + crestSize / 2, crestY + 5.6, { align: 'center' });
  }

  // School Name & Card Subtitle
  const schoolName = (settings?.schoolName || 'SOMALI PRIMERY AND SECONDARY SCHOOL').toUpperCase();
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(255, 255, 255);
  const clippedSchool = doc.splitTextToSize(schoolName, cardW - 18)[0] || schoolName;
  doc.text(clippedSchool, x + 14, y + 5.6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.2);
  doc.setTextColor(226, 232, 240);
  doc.text(badgeSubtitle.toUpperCase(), x + 14, y + 9.4);

  // Portrait Photo Frame (Left Column)
  const photoX = x + 3.2;
  const photoY = y + 16;
  const photoW = 17.5;
  const photoH = 22;

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.25);
  doc.roundedRect(photoX, photoY, photoW, photoH, 1.4, 1.4, 'FD');

  if (studentPhoto) {
    doc.addImage(studentPhoto.dataUrl, 'PNG', photoX + 0.4, photoY + 0.4, photoW - 0.8, photoH - 0.8);
  } else {
    doc.setFillColor(...primaryRgb);
    doc.roundedRect(photoX + 0.4, photoY + 0.4, photoW - 0.8, photoH - 0.8, 1.1, 1.1, 'F');
    const initials = card.student.fullName
      .trim()
      .split(/\s+/)
      .map((p) => p[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(255, 255, 255);
    doc.text(initials || 'ST', photoX + photoW / 2, photoY + photoH / 2 + 1.5, {
      align: 'center',
    });
  }

  // Division Tag below photo
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.4);
  doc.setTextColor(...accentRgb);
  doc.text(card.student.division.toUpperCase(), photoX + photoW / 2, photoY + photoH + 3.5, {
    align: 'center',
  });

  // Basic Profile Information (Center Column)
  const infoX = x + 23;
  const infoMaxW = 36;
  let cursorY = y + 18.2;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);
  const nameLines = doc.splitTextToSize(card.student.fullName, infoMaxW).slice(0, 2);
  doc.text(nameLines, infoX, cursorY);
  cursorY += nameLines.length * 3.6 + 1.4;

  // Student ID
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.5);
  doc.setTextColor(100, 116, 139);
  doc.text('STUDENT ID', infoX, cursorY);
  doc.setFont('courier', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(15, 23, 42);
  doc.text(card.student.studentId, infoX + 15.5, cursorY);
  cursorY += 3.8;

  // Admission Number (if present)
  if (card.student.admissionNumber) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.5);
    doc.setTextColor(100, 116, 139);
    doc.text('ADMISSION NO', infoX, cursorY);
    doc.setFont('courier', 'normal');
    doc.setFontSize(6.2);
    doc.setTextColor(51, 65, 85);
    doc.text(card.student.admissionNumber, infoX + 15.5, cursorY);
    cursorY += 3.6;
  }

  // Class & Academic Year
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.5);
  doc.setTextColor(100, 116, 139);
  doc.text('CLASS / YEAR', infoX, cursorY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.2);
  doc.setTextColor(...primaryRgb);
  doc.text(`${card.student.className} · ${card.student.academicYear}`, infoX + 15.5, cursorY);
  cursorY += 3.6;

  // DOB & Gender
  if (card.student.dateOfBirth || card.student.gender) {
    const dobText = card.student.dateOfBirth || '—';
    const genderText = card.student.gender ? card.student.gender.toUpperCase() : '';
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.5);
    doc.setTextColor(100, 116, 139);
    doc.text('DOB / GENDER', infoX, cursorY);
    doc.setTextColor(51, 65, 85);
    doc.text(`${dobText}${genderText ? ` · ${genderText}` : ''}`, infoX + 15.5, cursorY);
    cursorY += 3.6;
  }

  // Guardian Phone
  if (card.student.guardianPhone) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.5);
    doc.setTextColor(100, 116, 139);
    doc.text('GUARDIAN TEL', infoX, cursorY);
    doc.setFont('courier', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(51, 65, 85);
    doc.text(card.student.guardianPhone, infoX + 15.5, cursorY);
  }

  // Secure Attendance QR Code (Right Column)
  const qrBoxSize = 21.5;
  const qrX = x + cardW - qrBoxSize - 3.2;
  const qrY = y + 16;

  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.2);
  doc.roundedRect(qrX, qrY, qrBoxSize, qrBoxSize, 1.2, 1.2, 'FD');
  doc.addImage(qrPngDataUrl, 'PNG', qrX + 0.9, qrY + 0.9, qrBoxSize - 1.8, qrBoxSize - 1.8);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(4.8);
  doc.setTextColor(71, 85, 105);
  doc.text('ATTENDANCE QR', qrX + qrBoxSize / 2, qrY + qrBoxSize + 3.2, { align: 'center' });

  // Footer Hairline & Metadata
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.2);
  doc.line(x + 3.2, y + cardH - 5.5, x + cardW - 3.2, y + cardH - 5.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(4.9);
  doc.setTextColor(100, 116, 139);
  const footerLeft = settings?.phone || settings?.email || settings?.address || 'NEXUS SCHOOL OS';
  doc.text(String(footerLeft).slice(0, 42), x + 3.2, y + cardH - 2.3);
  doc.text(`VALID ${card.student.academicYear}`, x + cardW - 3.2, y + cardH - 2.3, {
    align: 'right',
  });
}

export async function generateStudentIdCardsPdf(params: {
  cards: StudentQrCard[];
  settings: SchoolSettings | null;
  layout?: IdCardPdfLayout;
  badgeSubtitle?: string;
  fileName?: string;
}): Promise<void> {
  const {
    cards,
    settings,
    layout = cards.length === 1 ? 'cr80' : 'a4-sheet',
    badgeSubtitle = 'OFFICIAL STUDENT IDENTITY PASS',
    fileName,
  } = params;

  if (cards.length === 0) {
    throw new Error('No student cards provided for PDF generation.');
  }

  const schoolLogo = await loadImageAsPng(settings?.logoUrl);

  const prepared = await Promise.all(
    cards.map(async (card) => {
      const [photo, qrPngDataUrl] = await Promise.all([
        loadImageAsPng(card.student.photoUrl),
        card.qrDataUrl && card.qrDataUrl.startsWith('data:image/png')
          ? Promise.resolve(card.qrDataUrl)
          : QRCode.toDataURL(card.qrPayload, {
              errorCorrectionLevel: 'M',
              margin: 1,
              width: 320,
              color: { dark: '#0F172A', light: '#FFFFFF' },
            }),
      ]);
      return { card, photo, qrPngDataUrl };
    })
  );

  if (layout === 'cr80') {
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: [85.6, 53.98],
    });

    prepared.forEach((item, index) => {
      if (index > 0) doc.addPage([85.6, 53.98], 'landscape');
      drawIdCard(
        doc,
        0,
        0,
        item.card,
        item.photo,
        schoolLogo,
        item.qrPngDataUrl,
        settings,
        badgeSubtitle
      );
    });

    const outName =
      fileName ||
      (cards.length === 1
        ? `${cards[0].student.studentId}-id-card.pdf`
        : `student-id-cards-${new Date().toISOString().slice(0, 10)}.pdf`);
    doc.save(outName);
    return;
  }

  // Printable A4 Sheet (2 columns x 4 rows = 8 CR80 cards per page with cut marks)
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const marginX = 14.4;
  const marginY = 18;
  const gapX = 10;
  const gapY = 12;
  const cardW = 85.6;
  const cardH = 53.98;
  const perPage = 8;

  prepared.forEach((item, index) => {
    if (index > 0 && index % perPage === 0) {
      doc.addPage('a4', 'portrait');
    }

    const slot = index % perPage;
    const col = slot % 2;
    const row = Math.floor(slot / 2);

    if (slot === 0) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(71, 85, 105);
      doc.text(
        `${settings?.schoolName || 'SOMALI PRIMERY AND SECONDARY SCHOOL'} — Student ID Cards (${new Date().toISOString().slice(0, 10)})`,
        marginX,
        11
      );
    }

    const x = marginX + col * (cardW + gapX);
    const y = marginY + row * (cardH + gapY);

    drawCropMarks(doc, x, y, cardW, cardH);
    drawIdCard(
      doc,
      x,
      y,
      item.card,
      item.photo,
      schoolLogo,
      item.qrPngDataUrl,
      settings,
      badgeSubtitle
    );
  });

  const outName =
    fileName || `student-id-cards-sheet-${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(outName);
}
