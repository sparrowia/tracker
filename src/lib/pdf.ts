import { GlobalWorkerOptions, getDocument } from "pdfjs-dist";

// Use the bundled worker
GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

export async function extractPdfText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const pdf = await getDocument({ data: buffer }).promise;
  const pages: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const items = content.items.filter((item) => "str" in item) as {
      str: string;
      transform: number[];
      width: number;
      hasEOL: boolean;
    }[];

    let text = "";
    for (let j = 0; j < items.length; j++) {
      const item = items[j];

      if (j > 0) {
        const prev = items[j - 1];
        // Y position differs → new line
        const sameLine = Math.abs(item.transform[5] - prev.transform[5]) < 2;

        if (!sameLine || prev.hasEOL) {
          text += "\n";
        } else {
          // Same line: insert space only if there's a real gap between items
          const prevEnd = prev.transform[4] + prev.width;
          const gap = item.transform[4] - prevEnd;
          const charWidth =
            prev.str.length > 0 ? prev.width / prev.str.length : 5;
          if (gap > charWidth * 0.3) {
            text += " ";
          }
        }
      }

      text += item.str;
    }

    if (text.trim()) pages.push(text.trim());
  }

  return pages.join("\n\n");
}
