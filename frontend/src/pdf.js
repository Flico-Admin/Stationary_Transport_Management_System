// Downloads a report as a real PDF file (no print window).
// jspdf is loaded only when the button is clicked, so it does not slow the normal pages down.
export async function downloadPdf({ filename, title, subtitle = '', summary = [], head, rows, cell = (c) => c }) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ orientation: head.length > 6 ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' });
  const margin = 40;
  const width = doc.internal.pageSize.getWidth() - margin * 2;
  let y = 46;

  doc.setFont('helvetica', 'bold'); doc.setFontSize(16);
  doc.text(title, margin, y);
  y += 18;

  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  if (subtitle) {
    const lines = doc.splitTextToSize(subtitle, width);
    doc.text(lines, margin, y);
    y += lines.length * 12;
  }
  if (summary.length) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
    doc.text(doc.splitTextToSize(summary.map(([label, value]) => `${label}: ${value}`).join('     '), width), margin, y + 6);
    y += 20;
  }

  // columns that only hold numbers are right aligned
  const columnStyles = {};
  head.forEach((_, j) => { if (rows.length && rows.every((r) => r[j] === '' || typeof r[j] === 'number')) columnStyles[j] = { halign: 'right' }; });

  autoTable(doc, {
    startY: y + 6,
    head: [head],
    body: rows.map((r) => r.map((c, j) => String(cell(c, j) ?? ''))),
    margin: { left: margin, right: margin },
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: [40, 60, 90] },
    columnStyles,
    didParseCell: (d) => {
      if (d.section === 'body' && d.row.raw[0] === 'Total') d.cell.styles.fontStyle = 'bold';
      if (d.section === 'head' && columnStyles[d.column.index]) d.cell.styles.halign = 'right';
    },
  });

  // footer: date and page numbers
  const pages = doc.getNumberOfPages();
  const h = doc.internal.pageSize.getHeight();
  const stamp = new Date().toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.text(`Request Desk - ${stamp}`, margin, h - 20);
    doc.text(`Page ${p} of ${pages}`, margin + width, h - 20, { align: 'right' });
  }
  doc.save(filename);
}