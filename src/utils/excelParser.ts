import * as XLSX from 'xlsx';
import { Article } from '../types';

export interface ParseResult {
  articles: Article[];
  errors: string[];
  detectedFormat: 'matrix_incidence' | 'standard_columns' | 'citations_list';
  hasFormulas?: boolean;
}

/**
 * Extracts authors and title from a bibliographic citation string (Russian academic standard).
 * Example:
 * "Захаров В.Н., Леонтьев А.А., Рогов А.А., Сидоров Ю.В. ПРОГРАММНАЯ СИСТЕМА... // Труды ПетрГУ. 2000."
 */
export function parseBibliographicString(citation: string): { authors: string[]; title: string } {
  const clean = citation.trim();
  if (!clean) return { authors: [], title: 'Без названия' };

  // Split by "//" to separate main work info from journal/collection info
  const beforeSlash = clean.split('//')[0].trim();

  // Regex to match authors at the beginning of the citation
  // Pattern: "Фамилия И.О." or "Фамилия И. О." or "Фамилия, И.О."
  const authorRegex = /([А-ЯЁ][а-яё]+(?:-[А-ЯЁ][а-яё]+)?\s+[А-ЯЁ]\.\s?[А-ЯЁ]\.?|[А-ЯЁ]\.\s?[А-ЯЁ]\.?\s+[А-ЯЁ][а-яё]+)/g;
  const matches = beforeSlash.match(authorRegex) || [];

  let authors: string[] = [];
  let title = beforeSlash;

  if (matches.length > 0) {
    authors = matches.map((m) => m.replace(/\s+/g, ' ').trim());
    // Remove the author block from the start of the title
    const lastAuthor = matches[matches.length - 1];
    const lastIdx = beforeSlash.lastIndexOf(lastAuthor);
    if (lastIdx !== -1) {
      title = beforeSlash.substring(lastIdx + lastAuthor.length).trim();
      title = title.replace(/^[,\.\s–—\-]+/, '').trim();
    }
  }

  if (!title) {
    title = clean.length > 80 ? clean.substring(0, 80) + '...' : clean;
  }

  return { authors, title };
}

export function parseExcelFile(file: File): Promise<ParseResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        // Read workbook with formula caching enabled
        const workbook = XLSX.read(data, {
          type: 'array',
          cellFormula: true,
          cellNF: true,
        });

        // Scan sheets: prioritize first sheet or sheet with incidence matrix/publications
        let targetSheetName = workbook.SheetNames[0];
        for (const name of workbook.SheetNames) {
          const lower = name.toLowerCase();
          if (lower.includes('инцидент') || lower.includes('матрица') || lower.includes('статьи') || lower.includes('публикац')) {
            targetSheetName = name;
            break;
          }
        }

        const worksheet = workbook.Sheets[targetSheetName];

        // Check if sheet contains formula cells
        let hasFormulas = false;
        Object.keys(worksheet).forEach((key) => {
          if (!key.startsWith('!') && worksheet[key]?.f) {
            hasFormulas = true;
          }
        });

        // Read sheet as raw 2D array of rows with formula evaluation
        const rawRows: (string | number | boolean | null | undefined)[][] = XLSX.utils.sheet_to_json(worksheet, {
          header: 1,
          defval: '',
        });

        if (!rawRows || rawRows.length === 0) {
          throw new Error('Лист Excel пуст.');
        }

        const articles: Article[] = [];
        const errors: string[] = [];
        let detectedFormat: ParseResult['detectedFormat'] = 'standard_columns';

        // 1. Check for Matrix Incidence Format
        let headerRowIdx = -1;
        let yearColIdx = -1;
        let citationColIdx = -1;
        let authorCols: { colIdx: number; authorName: string }[] = [];

        for (let r = 0; r < Math.min(6, rawRows.length); r++) {
          const row = rawRows[r];
          if (!row) continue;

          let foundYear = -1;
          let foundCitation = -1;
          const candidates: { colIdx: number; authorName: string }[] = [];

          row.forEach((cellVal, cIdx) => {
            const valStr = String(cellVal || '').trim();
            const lower = valStr.toLowerCase();

            if (lower === 'год' || lower === 'year') {
              foundYear = cIdx;
            } else if (
              lower.includes('название') ||
              lower.includes('статья') ||
              lower.includes('публикация') ||
              lower.includes('описание') ||
              (foundYear !== -1 && cIdx === foundYear + 1)
            ) {
              foundCitation = cIdx;
            } else {
              // Exclude utility / formula columns from being parsed as author names
              const isServiceCol = /(всего|итого|сумма|тип|кол-во|количество|total|sum|type|формула|ранг)/i.test(valStr);
              if (!isServiceCol && valStr.length >= 3 && /[А-ЯЁ][а-яё]+/.test(valStr)) {
                candidates.push({ colIdx: cIdx, authorName: valStr });
              }
            }
          });

          if (candidates.length >= 2) {
            headerRowIdx = r;
            yearColIdx = foundYear !== -1 ? foundYear : 1;
            citationColIdx = foundCitation !== -1 ? foundCitation : 2;
            authorCols = candidates;
            detectedFormat = 'matrix_incidence';
            break;
          }
        }

        if (detectedFormat === 'matrix_incidence') {
          // Parse rows starting after headerRowIdx
          for (let r = headerRowIdx + 1; r < rawRows.length; r++) {
            const row = rawRows[r];
            if (!row || row.length === 0) continue;

            const rawYear = row[yearColIdx];
            const yearNum = typeof rawYear === 'number' ? Math.round(rawYear) : parseInt(String(rawYear || ''), 10);
            const citationText = String(row[citationColIdx] || '').trim();
            const firstCellText = String(row[0] || '').trim();

            // Detect and skip summary rows with Excel formulas (ИТОГО, СУММА, AVERAGE, etc.)
            const isSummaryRow =
              /(^|\s)(итого|сумма|всего|среднее|максимум|минимум|общие|total|sum|average|mean|max|min)/i.test(citationText) ||
              /(^|\s)(итого|сумма|всего|среднее|максимум|минимум|общие|total|sum|average|mean|max|min)/i.test(firstCellText) ||
              /(^|\s)(итого|сумма|всего|среднее|максимум|минимум|общие|total|sum|average|mean|max|min)/i.test(String(rawYear || '').trim());

            if (isSummaryRow) {
              continue; // Skip summary row with formulas
            }

            if (!citationText && isNaN(yearNum)) {
              // Probably an empty row
              continue;
            }

            // Collect authors marked with 1, true, +, or positive formula results
            const markedAuthors: string[] = [];
            authorCols.forEach(({ colIdx, authorName }) => {
              const cellVal = row[colIdx];
              let isMarked = false;

              if (typeof cellVal === 'boolean') {
                isMarked = cellVal;
              } else if (typeof cellVal === 'number') {
                isMarked = cellVal > 0;
              } else if (typeof cellVal === 'string') {
                const s = cellVal.trim().toLowerCase();
                isMarked =
                  s === '1' ||
                  s === '1.0' ||
                  s === '+' ||
                  s === 'x' ||
                  s === 'v' ||
                  s === '✓' ||
                  s === 'true' ||
                  s === 'истина' ||
                  (!isNaN(parseFloat(s)) && parseFloat(s) > 0);
              }

              if (isMarked) {
                markedAuthors.push(authorName);
              }
            });

            // Also parse title & authors from citation text if none or few marked
            const parsedFromText = parseBibliographicString(citationText);
            const finalAuthors = markedAuthors.length > 0 ? markedAuthors : parsedFromText.authors;

            if (finalAuthors.length === 0 && !citationText) {
              continue;
            }

            // Determine organization
            let org = 'ПетрГУ';
            const lowerCit = citationText.toLowerCase();
            if (lowerCit.includes('карнц') || lowerCit.includes('ияли') || lowerCit.includes('ран')) {
              org = 'КарНЦ РАН';
              if (lowerCit.includes('петргу')) {
                org = 'ПетрГУ / КарНЦ РАН';
              }
            }

            articles.push({
              id: `excel_row_${r + 1}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
              title: citationText || parsedFromText.title || `Публикация #${r}`,
              authors: finalAuthors.length > 0 ? finalAuthors : ['Не указан'],
              year: !isNaN(yearNum) && yearNum >= 1900 && yearNum <= 2100 ? yearNum : 2024,
              organization: org,
            });
          }
        } else {
          // 2. Standard Column Format
          const json: Record<string, unknown>[] = XLSX.utils.sheet_to_json(worksheet);

          json.forEach((row, idx) => {
            const norm: Record<string, unknown> = {};
            Object.keys(row).forEach((k) => {
              norm[k.trim().toLowerCase()] = row[k];
            });

            const rawAuthors =
              norm['авторы'] ||
              norm['автор'] ||
              norm['соавторы'] ||
              norm['authors'] ||
              norm['author'] ||
              '';

            const rawTitle =
              norm['название'] ||
              norm['название статьи'] ||
              norm['наименование'] ||
              norm['публикация'] ||
              norm['библиографическое описание'] ||
              norm['title'] ||
              '';

            const rawYear =
              norm['год'] ||
              norm['год издания'] ||
              norm['год публикации'] ||
              norm['year'] ||
              2024;
            const yearNum = typeof rawYear === 'number' ? Math.round(rawYear) : parseInt(String(rawYear), 10);
            const year = !isNaN(yearNum) && yearNum >= 1900 && yearNum <= 2100 ? yearNum : 2024;

            const org = String(norm['организация'] || norm['аффилиация'] || norm['organization'] || 'ПетрГУ').trim();

            let authors: string[] = [];
            let title = String(rawTitle).trim();

            // Skip summary rows in standard column format
            const isSummary =
              /(^|\s)(итого|сумма|всего|среднее|total|sum|average)/i.test(title) ||
              /(^|\s)(итого|сумма|всего|среднее|total|sum|average)/i.test(String(rawAuthors || '').trim());
            if (isSummary) return;

            if (rawAuthors) {
              authors = String(rawAuthors)
                .split(/[,;\n]/)
                .map((a) => a.trim())
                .filter(Boolean);
            } else if (title) {
              // Try parsing citation
              const parsed = parseBibliographicString(title);
              authors = parsed.authors;
              title = parsed.title;
            }

            if (authors.length === 0) {
              errors.push(`Строка ${idx + 2}: не удалось определить авторов`);
              return;
            }

            articles.push({
              id: `excel_${idx + 1}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
              title: title || `Публикация #${idx + 1}`,
              authors,
              year,
              organization: org || 'ПетрГУ',
            });
          });
        }

        resolve({ articles, errors, detectedFormat, hasFormulas });
      } catch (err) {
        reject(err);
      }
    };

    reader.onerror = (err) => reject(err);
    reader.readAsArrayBuffer(file);
  });
}
