import path from "node:path";
import PDFDocument from "pdfkit";
import { exportText, toParagraphs, type ExportChapter } from "./chapters";

const FONT_DIR = path.join(process.cwd(), "node_modules", "dejavu-fonts-ttf", "ttf");
const REGULAR = path.join(FONT_DIR, "DejaVuSerif.ttf");
const BOLD = path.join(FONT_DIR, "DejaVuSerif-Bold.ttf");

export function chapterHeading(c: Pick<ExportChapter, "number" | "title">): string {
  return `Глава ${c.number}${c.title ? `. ${c.title}` : ""}`;
}

/** PDF книги: титул, главы с новой страницы, номера страниц. Шрифт с кириллицей встроен. */
export function buildBookPdf(title: string, chapters: ExportChapter[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 72, bottom: 72, left: 72, right: 72 },
      font: REGULAR,
      bufferPages: true,
      info: { Title: title },
    });
    const parts: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => parts.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(parts)));
    doc.on("error", reject);

    doc.font(BOLD).fontSize(28).text(title, { align: "center" });

    for (const chapter of chapters) {
      doc.addPage();
      doc.font(BOLD).fontSize(18).text(chapterHeading(chapter), { align: "center" });
      doc.moveDown(1.5);
      doc.font(REGULAR).fontSize(11.5);
      for (const paragraph of toParagraphs(exportText(chapter))) {
        doc.text(paragraph, { align: "justify", indent: 24, lineGap: 3, paragraphGap: 4 });
      }
    }

    const range = doc.bufferedPageRange();
    for (let i = 1; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      doc.font(REGULAR).fontSize(9);
      // Номер страницы внутри нижнего поля; без смены bottom текст ушёл бы на новую страницу.
      const bottom = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      doc.text(String(i + 1), 0, doc.page.height - 45, { align: "center", width: doc.page.width });
      doc.page.margins.bottom = bottom;
    }

    doc.end();
  });
}
