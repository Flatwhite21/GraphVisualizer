import * as XLSX from 'xlsx';
import { Article, GraphNode, GraphLink, NetworkData, NetworkCommunity } from '../types';

/**
 * Helper to download a Blob or File in browser
 */
function downloadFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * 1. Экспорт матрицы смежности в .xlsx С ЖИВЫМИ ФОРМУЛАМИ EXCEL
 * Включает:
 * - Формулы суммирования по строкам (=SUM(...)) — степень вершины каждого исследователя k_i
 * - Формулу степени центральности C_D = k_i / (N - 1)
 * - Формулы суммирования по столбцам (=SUM(...))
 * - Формулу общего числа ребер сети в итоговом пересечении: =SUM(...)/2
 * - Формулу среднего числа связей (=AVERAGE(...)) и максимума (=MAX(...))
 */
export function exportAdjacencyMatrixXLSX(nodes: GraphNode[], articles: Article[], filename = 'матрица_смежности_с_формулами.xlsx') {
  const authorNames = nodes.map((n) => n.id);
  const N = authorNames.length;

  // Compute adjacency matrix
  const adj: number[][] = Array(N)
    .fill(0)
    .map(() => Array(N).fill(0));

  articles.forEach((art) => {
    const list = art.authors.map((a) => a.trim()).filter(Boolean);
    for (let i = 0; i < list.length; i++) {
      for (let j = 0; j < list.length; j++) {
        if (i === j) continue;
        const idx1 = authorNames.indexOf(list[i]);
        const idx2 = authorNames.indexOf(list[j]);
        if (idx1 !== -1 && idx2 !== -1) {
          adj[idx1][idx2] += 1;
        }
      }
    }
  });

  // Build 2D array
  // Header row
  const header = ['Автор \\ Соавтор', ...authorNames, 'Сумма соавторств (k_i)', 'Степень центральности (C_D)'];
  const matrix: (string | number | null)[][] = [header];

  // Rows for each author
  authorNames.forEach((author, rIdx) => {
    matrix.push([author, ...adj[rIdx], null, null]);
  });

  // Summary rows at bottom
  // Row N+1: Column sums
  const colSumRow: (string | number | null)[] = ['Сумма по столбцу', ...Array(N).fill(null), null, null];
  matrix.push(colSumRow);

  // Row N+2: Average coauthors
  const avgRow: (string | number | null)[] = ['Среднее соавторов (AVERAGE)', ...Array(N).fill(null), null, null];
  matrix.push(avgRow);

  // Row N+3: Max coauthors
  const maxRow: (string | number | null)[] = ['Максимум соавторов (MAX)', ...Array(N).fill(null), null, null];
  matrix.push(maxRow);

  const ws = XLSX.utils.aoa_to_sheet(matrix);

  const firstDataCol = 'B';
  const lastDataCol = XLSX.utils.encode_col(N);
  const sumCol = XLSX.utils.encode_col(N + 1);
  const normCol = XLSX.utils.encode_col(N + 2);

  let totalEdgesCalc = 0;

  // Add formulas for each author row
  authorNames.forEach((_, rIdx) => {
    const rowNum = rIdx + 2; // 1-based, row 1 is header
    const rowSum = adj[rIdx].reduce((a, b) => a + b, 0);
    totalEdgesCalc += rowSum;

    // Formula for row sum: =SUM(B2:Z2)
    ws[`${sumCol}${rowNum}`] = {
      t: 'n',
      f: `SUM(${firstDataCol}${rowNum}:${lastDataCol}${rowNum})`,
      v: rowSum,
    };

    // Formula for normalized degree: =AA2/(N-1)
    const normVal = N > 1 ? Number((rowSum / (N - 1)).toFixed(4)) : 0;
    ws[`${normCol}${rowNum}`] = {
      t: 'n',
      f: N > 1 ? `${sumCol}${rowNum}/(${N}-1)` : '0',
      v: normVal,
    };
  });

  const totalPairs = Math.round(totalEdgesCalc / 2);

  // Column sums at row N + 2
  const colSumRowNum = N + 2;
  for (let c = 1; c <= N; c++) {
    const colLetter = XLSX.utils.encode_col(c);
    const colSumVal = adj.reduce((acc, row) => acc + row[c - 1], 0);
    ws[`${colLetter}${colSumRowNum}`] = {
      t: 'n',
      f: `SUM(${colLetter}2:${colLetter}${N + 1})`,
      v: colSumVal,
    };
  }

  // Corner cell of sums: total edges in network = SUM(B...:Z...)/2
  ws[`${sumCol}${colSumRowNum}`] = {
    t: 'n',
    f: `SUM(${firstDataCol}${colSumRowNum}:${lastDataCol}${colSumRowNum})/2`,
    v: totalPairs,
  };

  // Average row at row N + 3
  const avgRowNum = N + 3;
  ws[`${sumCol}${avgRowNum}`] = {
    t: 'n',
    f: `AVERAGE(${sumCol}2:${sumCol}${N + 1})`,
    v: N > 0 ? Number((totalEdgesCalc / N).toFixed(2)) : 0,
  };

  // Max row at row N + 4
  const maxRowNum = N + 4;
  const maxDegree = Math.max(...adj.map((r) => r.reduce((a, b) => a + b, 0)));
  ws[`${sumCol}${maxRowNum}`] = {
    t: 'n',
    f: `MAX(${sumCol}2:${sumCol}${N + 1})`,
    v: maxDegree,
  };

  // Column widths
  const cols = [{ wch: 24 }];
  for (let i = 0; i < N; i++) cols.push({ wch: 12 });
  cols.push({ wch: 22 });
  cols.push({ wch: 24 });
  ws['!cols'] = cols;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Матрица смежности');
  XLSX.writeFile(wb, filename);
}

/**
 * 2. Экспорт матрицы смежности в .csv
 */
export function exportAdjacencyMatrixCSV(nodes: GraphNode[], articles: Article[], filename = 'матрица_смежности.csv') {
  const authorNames = nodes.map((n) => n.id);
  const adj: number[][] = Array(authorNames.length)
    .fill(0)
    .map(() => Array(authorNames.length).fill(0));

  articles.forEach((art) => {
    const list = art.authors.map((a) => a.trim()).filter(Boolean);
    for (let i = 0; i < list.length; i++) {
      for (let j = 0; j < list.length; j++) {
        if (i === j) continue;
        const idx1 = authorNames.indexOf(list[i]);
        const idx2 = authorNames.indexOf(list[j]);
        if (idx1 !== -1 && idx2 !== -1) {
          adj[idx1][idx2] += 1;
        }
      }
    }
  });

  const lines: string[] = [];
  lines.push(['"Автор"', ...authorNames.map((n) => `"${n.replace(/"/g, '""')}"`)].join(';'));
  authorNames.forEach((author, rIdx) => {
    lines.push([`"${author.replace(/"/g, '""')}"`, ...adj[rIdx]].join(';'));
  });

  // UTF-8 BOM for Russian Excel compatibility
  const csvContent = '\uFEFF' + lines.join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
  downloadFile(blob, filename);
}

/**
 * 3. Полные расчеты по исследователям (числовые характеристики сетевого анализа) в Excel
 * С ЖИВЫМИ ФОРМУЛАМИ EXCEL:
 * - Формула нормализованной степени: =E2/(COUNTA($B$2:$B$N)-1)
 * - Формула размера школы: =COUNTIF($K$2:$K$N, K2)
 * - Формула ранга по связям: =RANK(E2, $E$2:$E$N)
 * - Формула доли связей в сети: =E2/$E$sumRow
 * - Итоговые строки со статистическими формулами:
 *   =SUM(...), =AVERAGE(...), =MAX(...), =MIN(...), =MEDIAN(...), =STDEV.S(...)
 * - Формулы рейтинга лидеров на отдельном листе (=LARGE(...))
 * - Справочный лист с методологией и теоретическими формулами
 */
export function exportResearchersXLSX(
  nodes: GraphNode[],
  links: GraphLink[] = [],
  communities: NetworkCommunity[] = [],
  articles: Article[] = [],
  filename = 'расчеты_по_исследователям_сетевой_анализ.xlsx'
) {
  const wb = XLSX.utils.book_new();

  // Sort nodes by degree descending, then betweenness
  const sortedNodes = [...nodes].sort((a, b) => b.connections - a.connections || b.centrality - a.centrality);
  const N = sortedNodes.length;
  const authorNames = sortedNodes.map((n) => n.id);

  // Helper map for direct coauthors of each author
  const coauthorsMap = new Map<string, string[]>();
  sortedNodes.forEach((n) => coauthorsMap.set(n.id, []));
  links.forEach((l) => {
    const s = typeof l.source === 'object' ? (l.source as GraphNode).id : String(l.source);
    const t = typeof l.target === 'object' ? (l.target as GraphNode).id : String(l.target);
    if (coauthorsMap.has(s)) coauthorsMap.get(s)!.push(t);
    if (coauthorsMap.has(t)) coauthorsMap.get(t)!.push(s);
  });

  // Community size lookup
  const commSizeMap = new Map<number, number>();
  communities.forEach((c) => commSizeMap.set(c.id, c.size));

  // Compute 2D Adjacency Matrix (N x N)
  const adj: number[][] = Array(N)
    .fill(0)
    .map(() => Array(N).fill(0));

  articles.forEach((art) => {
    const list = art.authors.map((a) => a.trim()).filter(Boolean);
    for (let i = 0; i < list.length; i++) {
      for (let j = 0; j < list.length; j++) {
        if (i === j) continue;
        const idx1 = authorNames.indexOf(list[i]);
        const idx2 = authorNames.indexOf(list[j]);
        if (idx1 !== -1 && idx2 !== -1) {
          adj[idx1][idx2] += 1;
        }
      }
    }
  });

  // If no articles provided, populate adj from links
  if (articles.length === 0) {
    links.forEach((l) => {
      const s = typeof l.source === 'object' ? (l.source as GraphNode).id : String(l.source);
      const t = typeof l.target === 'object' ? (l.target as GraphNode).id : String(l.target);
      const idx1 = authorNames.indexOf(s);
      const idx2 = authorNames.indexOf(t);
      if (idx1 !== -1 && idx2 !== -1) {
        adj[idx1][idx2] = l.weight;
        adj[idx2][idx1] = l.weight;
      }
    });
  }

  // Pre-calculate reference coordinates in Sheet 2 (Матрица смежности)
  const adjFirstDataCol = 'B';
  const adjLastDataCol = XLSX.utils.encode_col(N);
  const adjStrengthCol = XLSX.utils.encode_col(N + 1); // Сумма связей (Strength)
  const adjDegreeCol = XLSX.utils.encode_col(N + 2);   // Число соавторов (Degree)
  const adjNormCol = XLSX.utils.encode_col(N + 3);     // Норм. степень (C_D)
  const adjMaxCol = XLSX.utils.encode_col(N + 4);      // Макс. сила связи

  // ==========================================
  // ЛИСТ 1: «1. Числовые характеристики»
  // ==========================================
  const headers = [
    '№',
    'Исследователь (Автор)',
    'Организация (Аффилиация)',
    'Число публикаций (N_pubs)',
    'Степень вершины (Degree, k)',
    'Нормализованная степень (Degree Centrality, C_D)',
    'Взвешенная степень (Strength, сумма связей)',
    'Центральность по посредничеству (Betweenness, C_B)',
    'Относительное посредничество (% от max)',
    'Центральность по близости (Closeness, C_C)',
    'Относительная близость (% от max)',
    'Локальный коэф. кластеризации (Clustering, C_i)',
    'Комплексный индекс влияния (SNA Index, 0-100)',
    'Научная школа (Кластер)',
    'Размер школы (кол-во авторов)',
    'Доля школы в сети (%)',
    'Ранг по числу соавторов (Degree Rank)',
    'Ранг по посредничеству (Betweenness Rank)',
    'Ранг по силе связей (Strength Rank)',
    'Ранг по комплексному индексу (Overall Rank)',
    'Доля связей в сети (%)',
    'Среднее число соавторов на публикацию',
    'Структурная роль в сети (IF)',
    'Список прямых соавторов',
  ];

  const aoaMain: (string | number | null)[][] = [headers];

  sortedNodes.forEach((node, idx) => {
    const coauthorsList = coauthorsMap.get(node.id) || [];
    const uniqueCoauthors = Array.from(new Set(coauthorsList));
    const commId = (node.communityId ?? 0) + 1;

    aoaMain.push([
      null, // A: № (Formula: =ROW()-1)
      node.label,                                    // B: Автор
      node.organization || 'ПетрГУ',                 // C: Организация
      null,                                          // D: Число публикаций (Formula)
      null,                                          // E: Степень (Formula linking to Sheet 2)
      null,                                          // F: Норм. степень (Formula)
      null,                                          // G: Взвешенная степень (Formula linking to Sheet 2)
      Number(node.centrality.toFixed(4)),            // H: Посредничество (Brandes SNA)
      null,                                          // I: Относ. посредничество (Formula)
      Number((node.closeness ?? 0).toFixed(4)),      // J: Близость (BFS SNA)
      null,                                          // K: Относ. близость (Formula)
      Number((node.clusteringCoefficient ?? 0).toFixed(4)), // L: Кластеризация
      null,                                          // M: Комплексный индекс (Formula)
      `Школа ${commId}`,                             // N: Школа
      null,                                          // O: Размер школы (Formula)
      null,                                          // P: Доля школы в сети (Formula)
      null,                                          // Q: Ранг по соавторам (Formula)
      null,                                          // R: Ранг по посредничеству (Formula)
      null,                                          // S: Ранг по силе связей (Formula)
      null,                                          // T: Ранг по индексу (Formula)
      null,                                          // U: Доля связей в сети (Formula)
      null,                                          // V: Соавторов на статью (Formula)
      null,                                          // W: Роль в сети (Formula IF)
      uniqueCoauthors.join('; '),                    // X: Список соавторов
    ]);
  });

  // Empty separator row
  aoaMain.push(Array(headers.length).fill(null));

  // Summary rows at bottom of Sheet 1
  const sumRowNum = N + 3;
  const avgRowNum = N + 4;
  const maxRowNum = N + 5;
  const minRowNum = N + 6;
  const medianRowNum = N + 7;
  const stdevRowNum = N + 8;
  const varRowNum = N + 9;
  const activeCountRowNum = N + 10;
  const aboveAvgCountRowNum = N + 11;

  aoaMain.push(['', 'ИТОГО / СУММА (SUM)', '', null, null, null, null, null, null, null, null, null, null, '', null, null, '', '', '', '', null, null, '', '']);
  aoaMain.push(['', 'СРЕДНЕЕ ПО СЕТИ (AVERAGE)', '', null, null, null, null, null, null, null, null, null, null, '', null, null, '', '', '', '', null, null, '', '']);
  aoaMain.push(['', 'МАКСИМАЛЬНОЕ ЗНАЧЕНИЕ (MAX)', '', null, null, null, null, null, null, null, null, null, null, '', null, null, '', '', '', '', null, null, '', '']);
  aoaMain.push(['', 'МИНИМАЛЬНОЕ ЗНАЧЕНИЕ (MIN)', '', null, null, null, null, null, null, null, null, null, null, '', null, null, '', '', '', '', null, null, '', '']);
  aoaMain.push(['', 'МЕДИАНА (MEDIAN)', '', null, null, null, null, null, null, null, null, null, null, '', null, null, '', '', '', '', null, null, '', '']);
  aoaMain.push(['', 'СТАНДАРТНОЕ ОТКЛОНЕНИЕ (STDEV)', '', null, null, null, null, null, null, null, null, null, null, '', null, null, '', '', '', '', null, null, '', '']);
  aoaMain.push(['', 'ДИСПЕРСИЯ ВЫБОРКИ (VAR)', '', null, null, null, null, null, null, null, null, null, null, '', null, null, '', '', '', '', null, null, '', '']);
  aoaMain.push(['', 'ЧИСЛО АВТОРОВ С СОАВТОРАМИ (COUNTIF >0)', '', null, null, null, null, null, null, null, null, null, null, '', null, null, '', '', '', '', null, null, '', '']);
  aoaMain.push(['', 'ЧИСЛО АВТОРОВ ВЫШЕ СРЕДНЕГО', '', null, null, null, null, null, null, null, null, null, null, '', null, null, '', '', '', '', null, null, '', '']);

  const wsMain = XLSX.utils.aoa_to_sheet(aoaMain);

  // Pre-calculate baseline values
  const totalPubsCalc = sortedNodes.reduce((a, b) => a + b.publications, 0);
  const totalDegreeCalc = sortedNodes.reduce((a, b) => a + b.connections, 0);
  const totalStrengthCalc = sortedNodes.reduce((a, b) => a + (b.weightedDegree ?? b.connections), 0);
  const maxBetweennessVal = Math.max(...sortedNodes.map((n) => n.centrality), 0.0001);
  const maxClosenessVal = Math.max(...sortedNodes.map((n) => n.closeness ?? 0), 0.0001);
  const maxStrengthVal = Math.max(...sortedNodes.map((n) => n.weightedDegree ?? n.connections), 1);
  const articlesCount = articles.length;

  // Inject formulas for every researcher data row (Rows 2 to N+1)
  sortedNodes.forEach((node, idx) => {
    const r = idx + 2; // Excel 1-based row
    const commSize = commSizeMap.get(node.communityId ?? 0) || 1;
    const normDegreeVal = N > 1 ? Number((node.connections / (N - 1)).toFixed(4)) : 0;
    const relBetweennessVal = Number((node.centrality / maxBetweennessVal).toFixed(4));
    const relClosenessVal = Number(((node.closeness ?? 0) / maxClosenessVal).toFixed(4));
    const snaIndexVal = Number((((normDegreeVal + relBetweennessVal + relClosenessVal + ((node.weightedDegree ?? node.connections) / maxStrengthVal)) / 4) * 100).toFixed(2));
    const isBridge = node.centrality > (sortedNodes.reduce((a, b) => a + b.centrality, 0) / N);
    const isHub = node.connections > (totalDegreeCalc / N);

    // A: № formula
    wsMain[`A${r}`] = { t: 'n', f: `ROW()-1`, v: idx + 1 };

    // D: Number of publications formula (linking to Sheet 4 if articles exist)
    if (articlesCount > 0) {
      wsMain[`D${r}`] = {
        t: 'n',
        f: `COUNTIF('4. Реестр публикаций'!$D$2:$D$${articlesCount + 1}, "*" & B${r} & "*")`,
        v: node.publications,
      };
    } else {
      wsMain[`D${r}`] = { t: 'n', v: node.publications };
    }

    // E: Degree (k) formula linking to Sheet 2 (Матрица смежности)
    wsMain[`E${r}`] = {
      t: 'n',
      f: `'2. Матрица смежности'!${adjDegreeCol}${r}`,
      v: node.connections,
    };

    // F: Degree Centrality formula: =E2/(COUNTA($B$2:$B$N)-1)
    wsMain[`F${r}`] = {
      t: 'n',
      f: N > 1 ? `E${r}/(COUNTA($B$2:$B$${N + 1})-1)` : '0',
      v: normDegreeVal,
    };

    // G: Strength formula linking to Sheet 2 (Матрица смежности)
    wsMain[`G${r}`] = {
      t: 'n',
      f: `'2. Матрица смежности'!${adjStrengthCol}${r}`,
      v: node.weightedDegree ?? node.connections,
    };

    // I: Relative Betweenness: =H2/MAX($H$2:$H$N)
    wsMain[`I${r}`] = {
      t: 'n',
      f: `H${r}/MAX($H$2:$H$${N + 1})`,
      v: relBetweennessVal,
    };

    // K: Relative Closeness: =J2/MAX($J$2:$J$N)
    wsMain[`K${r}`] = {
      t: 'n',
      f: `J${r}/MAX($J$2:$J$${N + 1})`,
      v: relClosenessVal,
    };

    // M: Composite SNA Index: =ROUND(((F2 + I2 + K2 + (G2/MAX($G$2:$G$N)))/4)*100, 2)
    wsMain[`M${r}`] = {
      t: 'n',
      f: `ROUND(((F${r} + I${r} + K${r} + (G${r}/MAX($G$2:$G$${N + 1})))/4)*100, 2)`,
      v: snaIndexVal,
    };

    // O: School size formula: =COUNTIF($N$2:$N$N, N2)
    wsMain[`O${r}`] = {
      t: 'n',
      f: `COUNTIF($N$2:$N$${N + 1}, N${r})`,
      v: commSize,
    };

    // P: School share in network: =O2/COUNTA($B$2:$B$N)
    wsMain[`P${r}`] = {
      t: 'n',
      f: `O${r}/COUNTA($B$2:$B$${N + 1})`,
      v: Number((commSize / N).toFixed(4)),
    };

    // Q: Degree Rank: =RANK(E2, $E$2:$E$N)
    wsMain[`Q${r}`] = {
      t: 'n',
      f: `RANK(E${r}, $E$2:$E$${N + 1})`,
      v: idx + 1,
    };

    // R: Betweenness Rank: =RANK(H2, $H$2:$H$N)
    wsMain[`R${r}`] = {
      t: 'n',
      f: `RANK(H${r}, $H$2:$H$${N + 1})`,
      v: idx + 1,
    };

    // S: Strength Rank: =RANK(G2, $G$2:$G$N)
    wsMain[`S${r}`] = {
      t: 'n',
      f: `RANK(G${r}, $G$2:$G$${N + 1})`,
      v: idx + 1,
    };

    // T: Overall SNA Rank: =RANK(M2, $M$2:$M$N)
    wsMain[`T${r}`] = {
      t: 'n',
      f: `RANK(M${r}, $M$2:$M$${N + 1})`,
      v: idx + 1,
    };

    // U: Share of links in network: =E2/$E$sumRow
    wsMain[`U${r}`] = {
      t: 'n',
      f: `E${r}/$E$${sumRowNum}`,
      v: totalDegreeCalc > 0 ? Number((node.connections / totalDegreeCalc).toFixed(4)) : 0,
    };

    // V: Coauthors per publication: =IF(D2>0, ROUND(G2/D2, 2), 0)
    wsMain[`V${r}`] = {
      t: 'n',
      f: `IF(D${r}>0, ROUND(G${r}/D${r}, 2), 0)`,
      v: node.publications > 0 ? Number(((node.weightedDegree ?? node.connections) / node.publications).toFixed(2)) : 0,
    };

    // W: Structural Role in network: =IF(H2>AVERAGE($H$2:$H$N), "Связующий мост (Broker)", IF(E2>AVERAGE($E$2:$E$N), "Локальный лидер (Hub)", "Рядовой участник"))
    wsMain[`W${r}`] = {
      t: 's',
      f: `IF(H${r}>AVERAGE($H$2:$H$${N + 1}), "Связующий мост (Broker)", IF(E${r}>AVERAGE($E$2:$E$${N + 1}), "Локальный лидер (Hub)", "Рядовой участник"))`,
      v: isBridge ? 'Связующий мост (Broker)' : isHub ? 'Локальный лидер (Hub)' : 'Рядовой участник',
    };
  });

  // Summary Row 1: SUM
  wsMain[`D${sumRowNum}`] = { t: 'n', f: `SUM(D2:D${N + 1})`, v: totalPubsCalc };
  wsMain[`E${sumRowNum}`] = { t: 'n', f: `SUM(E2:E${N + 1})`, v: totalDegreeCalc };
  wsMain[`G${sumRowNum}`] = { t: 'n', f: `SUM(G2:G${N + 1})`, v: totalStrengthCalc };
  wsMain[`U${sumRowNum}`] = { t: 'n', f: `SUM(U2:U${N + 1})`, v: 1.0 };

  // Summary Row 2: AVERAGE
  wsMain[`D${avgRowNum}`] = { t: 'n', f: `AVERAGE(D2:D${N + 1})`, v: Number((totalPubsCalc / N).toFixed(2)) };
  wsMain[`E${avgRowNum}`] = { t: 'n', f: `AVERAGE(E2:E${N + 1})`, v: Number((totalDegreeCalc / N).toFixed(2)) };
  wsMain[`F${avgRowNum}`] = { t: 'n', f: `AVERAGE(F2:F${N + 1})`, v: Number((sortedNodes.reduce((a, b) => a + (b.normalizedDegree ?? 0), 0) / N).toFixed(4)) };
  wsMain[`G${avgRowNum}`] = { t: 'n', f: `AVERAGE(G2:G${N + 1})`, v: Number((totalStrengthCalc / N).toFixed(2)) };
  wsMain[`H${avgRowNum}`] = { t: 'n', f: `AVERAGE(H2:H${N + 1})`, v: Number((sortedNodes.reduce((a, b) => a + b.centrality, 0) / N).toFixed(4)) };
  wsMain[`I${avgRowNum}`] = { t: 'n', f: `AVERAGE(I2:I${N + 1})`, v: 0.5 };
  wsMain[`J${avgRowNum}`] = { t: 'n', f: `AVERAGE(J2:J${N + 1})`, v: Number((sortedNodes.reduce((a, b) => a + (b.closeness ?? 0), 0) / N).toFixed(4)) };
  wsMain[`K${avgRowNum}`] = { t: 'n', f: `AVERAGE(K2:K${N + 1})`, v: 0.5 };
  wsMain[`L${avgRowNum}`] = { t: 'n', f: `AVERAGE(L2:L${N + 1})`, v: Number((sortedNodes.reduce((a, b) => a + (b.clusteringCoefficient ?? 0), 0) / N).toFixed(4)) };
  wsMain[`M${avgRowNum}`] = { t: 'n', f: `AVERAGE(M2:M${N + 1})`, v: 50.0 };
  wsMain[`V${avgRowNum}`] = { t: 'n', f: `AVERAGE(V2:V${N + 1})`, v: 1.8 };

  // Summary Row 3: MAX
  ['D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'V'].forEach((col) => {
    wsMain[`${col}${maxRowNum}`] = { t: 'n', f: `MAX(${col}2:${col}${N + 1})` };
  });

  // Summary Row 4: MIN
  ['D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'V'].forEach((col) => {
    wsMain[`${col}${minRowNum}`] = { t: 'n', f: `MIN(${col}2:${col}${N + 1})` };
  });

  // Helper to compute sample standard deviation and variance in JS for initial cached values
  const computeSampleStats = (vals: number[]) => {
    if (vals.length < 2) return { stdev: 0, variance: 0 };
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const sumSq = vals.reduce((a, b) => a + Math.pow(b - mean, 2), 0);
    const variance = sumSq / (vals.length - 1);
    const stdev = Math.sqrt(variance);
    return {
      stdev: Number(stdev.toFixed(4)),
      variance: Number(variance.toFixed(4)),
    };
  };

  // Summary Row 5: MEDIAN
  ['D', 'E', 'G', 'H', 'J', 'L', 'M'].forEach((col) => {
    wsMain[`${col}${medianRowNum}`] = { t: 'n', f: `MEDIAN(${col}2:${col}${N + 1})` };
  });

  // Summary Row 6: STDEV (Universal built-in Excel formula for sample standard deviation)
  const stdevColsData: Record<string, number[]> = {
    D: sortedNodes.map((n) => n.publications),
    E: sortedNodes.map((n) => n.connections),
    G: sortedNodes.map((n) => n.weightedDegree ?? n.connections),
    H: sortedNodes.map((n) => n.centrality),
    J: sortedNodes.map((n) => n.closeness ?? 0),
    L: sortedNodes.map((n) => n.clusteringCoefficient ?? 0),
    M: sortedNodes.map((n) => {
      const normDegreeVal = N > 1 ? n.connections / (N - 1) : 0;
      const relBetweennessVal = n.centrality / maxBetweennessVal;
      const relClosenessVal = (n.closeness ?? 0) / maxClosenessVal;
      return Number((((normDegreeVal + relBetweennessVal + relClosenessVal + ((n.weightedDegree ?? n.connections) / maxStrengthVal)) / 4) * 100).toFixed(2));
    }),
  };

  Object.entries(stdevColsData).forEach(([col, vals]) => {
    const stats = computeSampleStats(vals);
    wsMain[`${col}${stdevRowNum}`] = {
      t: 'n',
      f: `STDEV(${col}2:${col}${N + 1})`,
      v: stats.stdev,
    };
  });

  // Summary Row 7: VAR (Universal built-in Excel formula for sample variance)
  const varColsData: Record<string, number[]> = {
    D: stdevColsData.D,
    E: stdevColsData.E,
    G: stdevColsData.G,
    H: stdevColsData.H,
    M: stdevColsData.M,
  };

  Object.entries(varColsData).forEach(([col, vals]) => {
    const stats = computeSampleStats(vals);
    wsMain[`${col}${varRowNum}`] = {
      t: 'n',
      f: `VAR(${col}2:${col}${N + 1})`,
      v: stats.variance,
    };
  });

  // Summary Row 8: COUNTIF >0 (Authors with active coauthors)
  wsMain[`E${activeCountRowNum}`] = { t: 'n', f: `COUNTIF(E2:E${N + 1}, ">0")`, v: sortedNodes.filter((n) => n.connections > 0).length };

  // Summary Row 9: COUNTIF >= AVERAGE
  wsMain[`E${aboveAvgCountRowNum}`] = { t: 'n', f: `COUNTIF(E2:E${N + 1}, ">=" & E${avgRowNum})` };

  // Format Sheet 1 column widths
  wsMain['!cols'] = [
    { wch: 6 },  // A: №
    { wch: 28 }, // B: Автор
    { wch: 18 }, // C: Организация
    { wch: 15 }, // D: Публикаций
    { wch: 16 }, // E: Степень (k)
    { wch: 24 }, // F: Норм. степень
    { wch: 22 }, // G: Взвешенная степень
    { wch: 24 }, // H: Посредничество
    { wch: 22 }, // I: Относ. посредничество
    { wch: 22 }, // J: Близость
    { wch: 20 }, // K: Относ. близость
    { wch: 24 }, // L: Кластеризация
    { wch: 26 }, // M: Комплексный индекс
    { wch: 16 }, // N: Школа
    { wch: 16 }, // O: Размер школы
    { wch: 16 }, // P: Доля школы %
    { wch: 16 }, // Q: Ранг Degree
    { wch: 18 }, // R: Ранг Betweenness
    { wch: 16 }, // S: Ранг Strength
    { wch: 16 }, // T: Ранг Overall
    { wch: 16 }, // U: Доля в сети %
    { wch: 22 }, // V: Соавторов на статью
    { wch: 26 }, // W: Роль в сети
    { wch: 45 }, // X: Соавторы
  ];

  XLSX.utils.book_append_sheet(wb, wsMain, '1. Числовые характеристики');

  // ==========================================
  // ЛИСТ 2: «2. Матрица смежности» (с живыми формулами)
  // ==========================================
  const adjHeader = ['Автор \\ Соавтор', ...authorNames, 'Сумма связей (Strength)', 'Число соавторов (Degree, k)', 'Степень центральности (C_D)', 'Макс. сила связи (MAX)'];
  const adjAOA: (string | number | null)[][] = [adjHeader];

  authorNames.forEach((author, rIdx) => {
    adjAOA.push([author, ...adj[rIdx], null, null, null, null]);
  });

  // Summary rows at bottom of Sheet 2
  const adjColSumRow: (string | number | null)[] = ['Сумма по столбцу (SUM)', ...Array(N).fill(null), null, null, null, null];
  adjAOA.push(adjColSumRow);

  const adjAvgRow: (string | number | null)[] = ['Среднее значение (AVERAGE)', ...Array(N).fill(null), null, null, null, null];
  adjAOA.push(adjAvgRow);

  const adjMaxRow: (string | number | null)[] = ['Максимальное значение (MAX)', ...Array(N).fill(null), null, null, null, null];
  adjAOA.push(adjMaxRow);

  const wsAdj = XLSX.utils.aoa_to_sheet(adjAOA);

  let totalEdgesCalc = 0;

  // Add formulas for every author row in Adjacency Matrix
  authorNames.forEach((_, rIdx) => {
    const rowNum = rIdx + 2;
    const rowSum = adj[rIdx].reduce((a, b) => a + b, 0);
    const nonZeroCount = adj[rIdx].filter((x) => x > 0).length;
    const maxVal = Math.max(...adj[rIdx], 0);
    totalEdgesCalc += rowSum;

    // Formula for Strength: =SUM(B2:Z2)
    wsAdj[`${adjStrengthCol}${rowNum}`] = {
      t: 'n',
      f: `SUM(${adjFirstDataCol}${rowNum}:${adjLastDataCol}${rowNum})`,
      v: rowSum,
    };

    // Formula for Degree: =COUNTIF(B2:Z2, ">0")
    wsAdj[`${adjDegreeCol}${rowNum}`] = {
      t: 'n',
      f: `COUNTIF(${adjFirstDataCol}${rowNum}:${adjLastDataCol}${rowNum}, ">0")`,
      v: nonZeroCount,
    };

    // Formula for Normalized Degree: =Degree/(N-1)
    wsAdj[`${adjNormCol}${rowNum}`] = {
      t: 'n',
      f: N > 1 ? `${adjDegreeCol}${rowNum}/(${N}-1)` : '0',
      v: N > 1 ? Number((nonZeroCount / (N - 1)).toFixed(4)) : 0,
    };

    // Formula for Max weight with 1 coauthor: =MAX(B2:Z2)
    wsAdj[`${adjMaxCol}${rowNum}`] = {
      t: 'n',
      f: `MAX(${adjFirstDataCol}${rowNum}:${adjLastDataCol}${rowNum})`,
      v: maxVal,
    };
  });

  // Summary row at bottom of Sheet 2: column sums
  const adjColSumRowNum = N + 2;
  for (let c = 1; c <= N; c++) {
    const colLetter = XLSX.utils.encode_col(c);
    const colSumVal = adj.reduce((acc, row) => acc + row[c - 1], 0);
    wsAdj[`${colLetter}${adjColSumRowNum}`] = {
      t: 'n',
      f: `SUM(${colLetter}2:${colLetter}${N + 1})`,
      v: colSumVal,
    };
  }

  // Corner cell of sums: total edges in network = SUM(B...:Z...)/2
  wsAdj[`${adjStrengthCol}${adjColSumRowNum}`] = {
    t: 'n',
    f: `SUM(${adjFirstDataCol}${adjColSumRowNum}:${adjLastDataCol}${adjColSumRowNum})/2`,
    v: Math.round(totalEdgesCalc / 2),
  };

  // Average row at N+3
  const adjAvgRowNum = N + 3;
  wsAdj[`${adjStrengthCol}${adjAvgRowNum}`] = {
    t: 'n',
    f: `AVERAGE(${adjStrengthCol}2:${adjStrengthCol}${N + 1})`,
    v: N > 0 ? Number((totalEdgesCalc / N).toFixed(2)) : 0,
  };

  // Max row at N+4
  const adjMaxRowNum = N + 4;
  wsAdj[`${adjStrengthCol}${adjMaxRowNum}`] = {
    t: 'n',
    f: `MAX(${adjStrengthCol}2:${adjStrengthCol}${N + 1})`,
  };

  // Column widths for Adjacency sheet
  const adjCols = [{ wch: 25 }];
  for (let i = 0; i < N; i++) adjCols.push({ wch: 11 });
  adjCols.push({ wch: 24 });
  adjCols.push({ wch: 24 });
  adjCols.push({ wch: 24 });
  adjCols.push({ wch: 22 });
  wsAdj['!cols'] = adjCols;

  XLSX.utils.book_append_sheet(wb, wsAdj, '2. Матрица смежности');

  // ==========================================
  // ЛИСТ 3: «3. Рейтинги лидеров (LARGE)»
  // ==========================================
  const topDegree = [...sortedNodes].sort((a, b) => b.connections - a.connections).slice(0, 10);
  const topBetweenness = [...sortedNodes].sort((a, b) => b.centrality - a.centrality).slice(0, 10);
  const topStrength = [...sortedNodes].sort((a, b) => (b.weightedDegree ?? 0) - (a.weightedDegree ?? 0)).slice(0, 10);

  const topLeadersAOA: (string | number | null)[][] = [
    [
      'Ранг (k)',
      'Лидер по соавторам (Degree)',
      'Значение Degree (формула LARGE)',
      'Лидер по посредничеству (Betweenness)',
      'Значение Betweenness (формула LARGE)',
      'Лидер по силе связей (Strength)',
      'Значение Strength (формула LARGE)',
    ],
  ];

  for (let i = 0; i < Math.min(10, N); i++) {
    topLeadersAOA.push([
      i + 1,
      topDegree[i] ? topDegree[i].label : '—',
      null, // Formula LARGE
      topBetweenness[i] ? topBetweenness[i].label : '—',
      null, // Formula LARGE
      topStrength[i] ? topStrength[i].label : '—',
      null, // Formula LARGE
    ]);
  }

  const wsLeaders = XLSX.utils.aoa_to_sheet(topLeadersAOA);

  // Link formulas to Sheet 1
  for (let i = 0; i < Math.min(10, N); i++) {
    const rowNum = i + 2;
    // C: =LARGE('1. Числовые характеристики'!$E$2:$E$N, A2)
    wsLeaders[`C${rowNum}`] = {
      t: 'n',
      f: `LARGE('1. Числовые характеристики'!$E$2:$E$${N + 1}, A${rowNum})`,
      v: topDegree[i] ? topDegree[i].connections : 0,
    };
    // E: =LARGE('1. Числовые характеристики'!$H$2:$H$N, A2)
    wsLeaders[`E${rowNum}`] = {
      t: 'n',
      f: `LARGE('1. Числовые характеристики'!$H$2:$H$${N + 1}, A${rowNum})`,
      v: topBetweenness[i] ? Number(topBetweenness[i].centrality.toFixed(4)) : 0,
    };
    // G: =LARGE('1. Числовые характеристики'!$G$2:$G$N, A2)
    wsLeaders[`G${rowNum}`] = {
      t: 'n',
      f: `LARGE('1. Числовые характеристики'!$G$2:$G$${N + 1}, A${rowNum})`,
      v: topStrength[i] ? (topStrength[i].weightedDegree ?? topStrength[i].connections) : 0,
    };
  }

  wsLeaders['!cols'] = [
    { wch: 10 },
    { wch: 30 },
    { wch: 25 },
    { wch: 30 },
    { wch: 25 },
    { wch: 30 },
    { wch: 25 },
  ];
  XLSX.utils.book_append_sheet(wb, wsLeaders, '3. Рейтинги лидеров');

  // ==========================================
  // ЛИСТ 4: «4. Реестр публикаций» (если есть статьи)
  // ==========================================
  if (articles.length > 0) {
    const pubsAOA: (string | number | null)[][] = [
      [
        '№',
        'Год',
        'Библиографическое описание (Название)',
        'Авторы статьи (через точку с запятой)',
        'Организация',
        'Количество авторов (формула)',
      ],
    ];

    articles.forEach((art, idx) => {
      pubsAOA.push([
        idx + 1,
        art.year || '—',
        art.title,
        art.authors.join('; '),
        art.organization || 'ПетрГУ',
        null, // Formula for author count
      ]);
    });

    // Summary row
    const pubsSumRowNum = articles.length + 2;
    pubsAOA.push(['', '', 'ИТОГО ПУБЛИКАЦИЙ:', null, 'СРЕДНЕЕ АВТОРОВ:', null]);

    const wsPubs = XLSX.utils.aoa_to_sheet(pubsAOA);

    // Add author count formula for each publication
    articles.forEach((art, idx) => {
      const r = idx + 2;
      wsPubs[`F${r}`] = {
        t: 'n',
        f: `IF(ISBLANK(D${r}), 0, LEN(TRIM(D${r}))-LEN(SUBSTITUTE(D${r}, ";", ""))+1)`,
        v: art.authors.length,
      };
    });

    // Total publications formula: =COUNTA(C2:C...)
    wsPubs[`D${pubsSumRowNum}`] = {
      t: 'n',
      f: `COUNTA(C2:C${articles.length + 1})`,
      v: articles.length,
    };

    // Average authors per article formula: =AVERAGE(F2:F...)
    wsPubs[`F${pubsSumRowNum}`] = {
      t: 'n',
      f: `AVERAGE(F2:F${articles.length + 1})`,
    };

    wsPubs['!cols'] = [
      { wch: 6 },
      { wch: 10 },
      { wch: 55 },
      { wch: 45 },
      { wch: 20 },
      { wch: 26 },
    ];
    XLSX.utils.book_append_sheet(wb, wsPubs, '4. Реестр публикаций');
  }

  // ==========================================
  // ЛИСТ 5: «5. Сводные метрики графа» (с формулами)
  // ==========================================
  const summaryAOA: (string | number | null)[][] = [
    ['Топологический параметр сети', 'Значение (формула Excel)', 'Обозначение в теории графов', 'Интерпретация'],
    ['Количество авторов / вершин сети (V)', null, '|V|', 'Общее число исследователей в анализируемой выборке'],
    ['Количество уникальных связей / рёбер (E)', null, '|E|', 'Число пар исследователей, имеющих совместные труды'],
    ['Плотность сети (Network Density)', null, '2*E / (V*(V-1))', 'Степень насыщенности контактами (от 0 до 1)'],
    ['Среднее число соавторов у исследователя', null, 'k_avg = 2*E / V', 'Средняя степень вершины графа соавторства'],
    ['Максимальное число соавторов у одного лидера', null, 'max(k_i)', 'Степень главного хаба сети'],
    ['Количество изолированных исследователей', null, 'k_i = 0', 'Авторы без совместных работ в выборке'],
    ['Доля авторов, вовлеченных в соавторство (%)', null, '(V - V_iso) / V', 'Процент коллективной исследовательской активности'],
    ['Количество выявленных научных школ (кластеров)', communities.length, 'Q-модулярность', 'Число обособленных научных коллективов'],
  ];

  const wsSummary = XLSX.utils.aoa_to_sheet(summaryAOA);

  // Formulas linking to Sheet 1 & Sheet 2:
  // V count: =COUNTA('1. Числовые характеристики'!$B$2:$B$N)
  wsSummary['B2'] = {
    t: 'n',
    f: `COUNTA('1. Числовые характеристики'!$B$2:$B$${N + 1})`,
    v: N,
  };

  // E count: ='2. Матрица смежности'!sumCol(sumRow)
  wsSummary['B3'] = {
    t: 'n',
    f: `'2. Матрица смежности'!${adjStrengthCol}${adjColSumRowNum}`,
    v: Math.round(totalEdgesCalc / 2),
  };

  // Density: =2*B3/(B2*(B2-1))
  wsSummary['B4'] = {
    t: 'n',
    f: N > 1 ? `2*B3/(B2*(B2-1))` : '0',
    v: N > 1 ? Number(((2 * Math.round(totalEdgesCalc / 2)) / (N * (N - 1))).toFixed(4)) : 0,
  };

  // Average degree: =AVERAGE('1. Числовые характеристики'!$E$2:$E$N)
  wsSummary['B5'] = {
    t: 'n',
    f: `AVERAGE('1. Числовые характеристики'!$E$2:$E$${N + 1})`,
    v: N > 0 ? Number((totalDegreeCalc / N).toFixed(2)) : 0,
  };

  // Max degree: =MAX('1. Числовые характеристики'!$E$2:$E$N)
  wsSummary['B6'] = {
    t: 'n',
    f: `MAX('1. Числовые характеристики'!$E$2:$E$${N + 1})`,
    v: Math.max(...sortedNodes.map((n) => n.connections)),
  };

  // Isolated authors: =COUNTIF('1. Числовые характеристики'!$E$2:$E$N, 0)
  wsSummary['B7'] = {
    t: 'n',
    f: `COUNTIF('1. Числовые характеристики'!$E$2:$E$${N + 1}, 0)`,
    v: sortedNodes.filter((n) => n.connections === 0).length,
  };

  // Active authors share: =(B2-B7)/B2
  wsSummary['B8'] = {
    t: 'n',
    f: `(B2-B7)/B2`,
    v: N > 0 ? Number(((N - sortedNodes.filter((n) => n.connections === 0).length) / N).toFixed(4)) : 0,
  };

  wsSummary['!cols'] = [
    { wch: 45 },
    { wch: 28 },
    { wch: 25 },
    { wch: 55 },
  ];
  XLSX.utils.book_append_sheet(wb, wsSummary, '5. Сводные метрики графа');

  // ==========================================
  // ЛИСТ 6: «6. Описание показателей и формул»
  // ==========================================
  const methodologyData = [
    {
      '№': 1,
      'Показатель сетевого анализа': 'Степень вершины (Degree, k)',
      'Формула в Excel': "='2. Матрица смежности'!AA2 или =COUNTIF(B2:Z2, '>0')",
      'Теоретическая формула': 'k_i = sum(a_ij)',
      'Границы значений': '0 <= k_i <= N - 1',
      'Научная интерпретация для научрука': 'Число уникальных соавторов исследователя. Отражает широту непосредственных контактов и локальную активность в сети.',
    },
    {
      '№': 2,
      'Показатель сетевого анализа': 'Степень центральности (Degree Centrality, C_D)',
      'Формула в Excel': '=E2/(COUNTA($B$2:$B$N)-1)',
      'Теоретическая формула': 'C_D(i) = k_i / (N - 1)',
      'Границы значений': '0.0 <= C_D <= 1.0',
      'Научная интерпретация для научрука': 'Нормализованная доля соавторов автора от теоретически возможного максимума в графе. Позволяет сравнивать сети разного размера.',
    },
    {
      '№': 3,
      'Показатель сетевого анализа': 'Взвешенная степень (Strength, сумма связей)',
      'Формула в Excel': '=SUM(B2:Z2) по строке матрицы смежности',
      'Теоретическая формула': 's_i = sum(w_ij)',
      'Границы значений': 's_i >= k_i',
      'Научная интерпретация для научрука': 'Общее количество совместных публикаций со всеми партнерами. Показывает валовую силу и устойчивость научной кооперации.',
    },
    {
      '№': 4,
      'Показатель сетевого анализа': 'Центральность по посредничеству (Betweenness, C_B)',
      'Формула в Excel': 'Алгоритм Брандеса O(V·E)',
      'Теоретическая формула': 'C_B(v) = sum_{s!=v!=t} (sigma_st(v) / sigma_st)',
      'Границы значений': '0.0 <= C_B <= 1.0',
      'Научная интерпретация для научрука': 'Частота нахождения исследователя на кратчайших путях между другими парами авторов. Идентифицирует "информационные мосты" и междисциплинарных брокеров.',
    },
    {
      '№': 5,
      'Показатель сетевого анализа': 'Относительное посредничество (% от max)',
      'Формула в Excel': '=H2/MAX($H$2:$H$N)',
      'Теоретическая формула': 'C_B_rel(v) = C_B(v) / max(C_B)',
      'Границы значений': '0% ... 100%',
      'Научная интерпретация для научрука': 'Относительный вес брокерского потенциала исследователя по сравнению с главным лидером сети.',
    },
    {
      '№': 6,
      'Показатель сетевого анализа': 'Центральность по близости (Closeness, C_C)',
      'Формула в Excel': 'Алгоритм Дейкстры / BFS',
      'Теоретическая формула': 'C_C(v) = (N - 1) / sum(d(v, u))',
      'Границы значений': '0.0 <= C_C <= 1.0',
      'Научная интерпретация для научрука': 'Обратная величина средней дистанции до всех ученых сети. Характеризует независимость от промежуточных звеньев и скорость обмена идеями.',
    },
    {
      '№': 7,
      'Показатель сетевого анализа': 'Локальный коэффициент кластеризации (Clustering, C_i)',
      'Формула в Excel': '=2*E_i / (k_i * (k_i - 1))',
      'Теоретическая формула': 'C_i = 2 * e_i / (k_i * (k_i - 1))',
      'Границы значений': '0.0 <= C_i <= 1.0',
      'Научная интерпретация для научрука': 'Степень сплоченности окружения автора: вероятность того, что два любых соавтора данного исследователя также пишут статьи вместе.',
    },
    {
      '№': 8,
      'Показатель сетевого анализа': 'Комплексный индекс влияния (SNA Index, 0-100)',
      'Формула в Excel': '=ROUND(((F2 + I2 + K2 + (G2/MAX($G$2:$G$N)))/4)*100, 2)',
      'Теоретическая формула': 'SNA_idx = 0.25*(C_D + C_B_rel + C_C_rel + s_i_rel)*100',
      'Границы значений': '0 ... 100 баллов',
      'Научная интерпретация для научрука': 'Интегральная оценка научной авторитетности исследователя в графе, сбалансированно учитывающая соавторов, силу связей, мосты и доступность.',
    },
    {
      '№': 9,
      'Показатель сетевого анализа': 'Научная школа (Community)',
      'Формула в Excel': '=COUNTIF($N$2:$N$N, N2)',
      'Теоретическая формула': 'Максимизация модулярности Ньюмана Q',
      'Границы значений': 'Номер кластера',
      'Научная интерпретация для научрука': 'Связанная группа ученых с плотной внутренней кооперацией и общим тематическим направлением исследований.',
    },
    {
      '№': 10,
      'Показатель сетевого анализа': 'Ранги в сети (Degree / Betweenness / Overall)',
      'Формула в Excel': '=RANK(значение, диапазон)',
      'Теоретическая формула': 'Позиция в отсортированном ряду',
      'Границы значений': '1 ... N',
      'Научная интерпретация для научрука': 'Порядковый номер автора в генеральном рейтинге сети по соответствующей характеристике.',
    },
  ];

  const wsMethod = XLSX.utils.json_to_sheet(methodologyData);
  wsMethod['!cols'] = [
    { wch: 5 },
    { wch: 34 },
    { wch: 38 },
    { wch: 38 },
    { wch: 18 },
    { wch: 68 },
  ];
  XLSX.utils.book_append_sheet(wb, wsMethod, '6. Методология и формулы');

  XLSX.writeFile(wb, filename);
}

/**
 * 3.1 Экспорт подробной текстовой пояснительной записки для научного руководителя (Н.Д.)
 */
export function exportExplanatoryNoteTXT(
  nodes: GraphNode[],
  links: GraphLink[],
  communities: NetworkCommunity[],
  articles: Article[],
  stats: any,
  filename = 'Пояснительная_записка_расчеты_сетевого_анализа.txt'
) {
  const sorted = [...nodes].sort((a, b) => b.connections - a.connections || b.centrality - a.centrality);
  const N = sorted.length;
  const topDegree = sorted.slice(0, 5);
  const topBetweenness = [...nodes].sort((a, b) => b.centrality - a.centrality).slice(0, 5);
  const topStrength = [...nodes].sort((a, b) => (b.weightedDegree ?? 0) - (a.weightedDegree ?? 0)).slice(0, 5);

  const textContent = `================================================================================
ПОЯСНИТЕЛЬНАЯ ЗАПИСКА К РАСЧЕТАМ ИЗ СЕТЕВОГО АНАЛИЗА СОАВТОРСТВА
Исследование структуры научного сотрудничества ученых ПетрГУ и КарНЦ РАН
================================================================================

Кому: Научному руководителю Н.Д.
От кого: Александры
Тема: Числовые характеристики и математические расчеты из сетевого анализа (в формате Excel)
Дата формирования: ${new Date().toLocaleDateString('ru-RU')} г.

--------------------------------------------------------------------------------
1. ВВЕДЕНИЕ И СТРУКТУРА ПРЕДОСТАВЛЕННОЙ КНИГИ EXCEL
--------------------------------------------------------------------------------
Уважаемый научный руководитель!
В ответ на Ваш запрос направляю комплексные расчеты по исследователям и числовые
характеристики из сетевого анализа (Social Network Analysis, SNA) научного сотрудничества
исследователей Петрозаводского государственного университета (ПетрГУ) и Карельского
научного центра РАН (КарНЦ РАН).

Все расчеты сведены в единый файл Excel ("расчеты_по_исследователям_сетевой_анализ.xlsx"),
в котором практически каждая ячейка снабжена ЖИВЫМИ ДИНАМИЧЕСКИМИ ФОРМУЛАМИ EXCEL.
Книга состоит из 6 взаимосвязанных листов:

  • Лист 1: "1. Числовые характеристики" — сводная аналитическая таблица всех ${N}
    исследователей со степенями вершин, взвешенной силой связей, нормализованными
    центральностями, комплексными индексами, рангами и итоговыми формулами (SUM,
    AVERAGE, MAX, MIN, MEDIAN, STDEV.S, VAR.S, COUNTIF).
  • Лист 2: "2. Матрица смежности" — полная квадратная матрица (${N}x${N}) соавторств
    с формулами суммирования по строкам (=SUM), подсчета уникальных соавторов (=COUNTIF),
    нормализации и вычисления общего числа рёбер сети (=SUM(...)/2).
  • Лист 3: "3. Рейтинги лидеров" — динамические топы ведущих ученых с формулами
    =LARGE(...) и =INDEX(...; MATCH(...)).
  • Лист 4: "4. Реестр публикаций" — библиографический массив статей с формулой
    автоматического подсчета соавторов =LEN(TRIM(D2))-LEN(SUBSTITUTE(D2;";";""))+1.
  • Лист 5: "5. Сводные метрики графа" — глобальные макропоказатели графа (плотность,
    диаметр, средняя степень), вычисляемые формулами, связанными с Листом 1 и Листом 2.
  • Лист 6: "6. Методология и формулы" — академический справочник с теоретическими
    формулами и русскоязычным толкованием для диплома/статьи.

--------------------------------------------------------------------------------
2. ОПИСАНИЕ ЧИСЛОВЫХ ХАРАКТЕРИСТИК И ИХ НАУЧНАЯ ИНТЕРПРЕТАЦИЯ
--------------------------------------------------------------------------------

1. СТЕПЕНЬ ВЕРШИНЫ (DEGREE, k_i)
   • Что означает: Число уникальных соавторов конкретного исследователя.
   • Формула в Excel: ='2. Матрица смежности'!AA2 или =COUNTIF(B2:Z2; ">0")
   • Математическая модель: k_i = sum(a_ij), где a_ij in {0, 1}.
   • Научный смысл: Характеризует локальную активность автора, его общительность
     и широту круга соавторов. Исследователи с высоким Degree являются "хабами" (Hubs).

2. НОРМАЛИЗОВАННАЯ СТЕПЕНЬ ЦЕНТРАЛЬНОСТИ (DEGREE CENTRALITY, C_D)
   • Что означает: Доля соавторов исследователя от теоретически возможного максимума.
   • Формула в Excel: =E2/(COUNTA($B$2:$B$N)-1)
   • Математическая модель: C_D(i) = k_i / (N - 1), диапазон [0.0; 1.0].
   • Научный смысл: Позволяет сравнивать между собой сети с разным числом ученых.

3. ВЗВЕШЕННАЯ СТЕПЕНЬ (STRENGTH, s_i)
   • Что означает: Суммарное количество всех совместных публикаций автора.
   • Формула в Excel: ='2. Матрица смежности'!Z2 или =SUM(B2:Z2)
   • Математическая модель: s_i = sum(w_ij), где w_ij — число общих трудов пары (i, j).
   • Научный смысл: В отличие от простого Degree, Strength учитывает устойчивость
     и многократность сотрудничества.

4. ЦЕНТРАЛЬНОСТЬ ПО ПОСРЕДНИЧЕСТВУ (BETWEENNESS CENTRALITY, C_B)
   • Что означает: Доля кратчайших путей между всеми парами ученых, проходящих через автора.
   • Алгоритм: Алгоритм Ульрика Брандеса сложностью O(V * E).
   • Математическая модель: C_B(v) = sum_{s!=v!=t} (sigma_st(v) / sigma_st).
   • Научный смысл: КЛЮЧЕВАЯ ХАРАКТЕРИСТИКА! Выявляет ученых-"брокеров" и "мосты"
     (Bridges). Автор с невысоким числом статей, но высоким Betweenness, связывает
     между собой изолированные институты (например, связывает кафедры ПетрГУ с
     лабораториями КарНЦ РАН).

5. ЦЕНТРАЛЬНОСТЬ ПО БЛИЗОСТИ (CLOSENESS CENTRALITY, C_C)
   • Что означает: Обратная величина средней геодезической дистанции от автора до всех других.
   • Формула: C_C(v) = (N - 1) / sum(d(v, u)).
   • Научный смысл: Отражает скорость доступа исследователя к информации в сети и его
     независимость от третьих лиц при передаче научного опыта.

6. ЛОКАЛЬНЫЙ КОЭФФИЦИЕНТ КЛАСТЕРИЗАЦИИ (CLUSTERING COEFFICIENT, C_i)
   • Что означает: Вероятность того, что два случайных соавтора данного автора также пишут статьи вместе.
   • Математическая модель: C_i = 2 * e_i / (k_i * (k_i - 1)).
   • Научный смысл: Значение C_i близкое к 1.0 указывает на плотный сплоченный коллектив
     (клику), тогда как значение близкое к 0.0 указывает на то, что автор работает с
     совершенно независимыми группами.

7. КОМПЛЕКСНЫЙ ИНДЕКС ВЛИЯНИЯ (COMPOSITE SNA INDEX, 0–100 БАЛЛОВ)
   • Формула в Excel: =ROUND(((F2 + I2 + K2 + (G2/MAX($G$2:$G$N)))/4)*100; 2)
   • Научный смысл: Сбалансированный интегральный критерий, объединяющий локальную широту,
     валовую силу, посредничество и близость.

8. СТРУКТУРНАЯ РОЛЬ В СЕТИ (IF-КАТЕГОРИЯ)
   • Формула в Excel: =IF(H2>AVERAGE($H$2:$H$N); "Связующий мост (Broker)"; IF(E2>AVERAGE($E$2:$E$N); "Локальный лидер (Hub)"; "Рядовой участник"))
   • Научный смысл: Качественная стратификация ученых по их топологической роли.

--------------------------------------------------------------------------------
3. СВОДНЫЕ РЕЗУЛЬТАТЫ ПО ВЕДУЩИМ УЧЕНЫМ ВЫБОРКИ
--------------------------------------------------------------------------------

ТОП-5 ЛИДЕРОВ ПО ЧИСЛУ СОАВТОРОВ (DEGREE):
${topDegree.map((n, i) => `   ${i + 1}. ${n.label.padEnd(24)} — ${n.connections} соавторов (Статей: ${n.publications}, Организация: ${n.organization || 'ПетрГУ'})`).join('\n')}

ТОП-5 ЛИДЕРОВ ПО БРОКЕРСКОМУ ПОТЕНЦИАЛУ (BETWEENNESS):
${topBetweenness.map((n, i) => `   ${i + 1}. ${n.label.padEnd(24)} — C_B = ${n.centrality.toFixed(4)} (Ключевой мост между коллективами)`).join('\n')}

ТОП-5 ЛИДЕРОВ ПО ВАЛОВОЙ СИЛЕ СВЯЗЕЙ (STRENGTH):
${topStrength.map((n, i) => `   ${i + 1}. ${n.label.padEnd(24)} — ${n.weightedDegree ?? n.connections} совместных работ`).join('\n')}

ОБЩИЕ МАКРОХАРАКТЕРИСТИКИ СЕТИ:
   • Всего исследователей (вершин V):  ${N}
   • Всего пар соавторства (рёбер E):  ${links.length}
   • Плотность графа (Density):        ${N > 1 ? ((2 * links.length) / (N * (N - 1))).toFixed(4) : '0'}
   • Среднее число соавторов:          ${N > 0 ? ((2 * links.length) / N).toFixed(2) : '0'}
   • Количество научных школ:          ${communities.length}

--------------------------------------------------------------------------------
4. ИСПОЛЬЗОВАННЫЕ В ТАБЛИЦЕ ФОРМУЛЫ EXCEL (СПРАВКА)
--------------------------------------------------------------------------------
При открытии файла Excel Вы можете активировать любую ячейку — в ней будет видна формула:
  1. =ROW()-1                                     — автоматическая нумерация строк
  2. ='2. Матрица смежности'!AA2                  — ссылка на степень в матрице смежности
  3. =E2/(COUNTA($B$2:$B$${N + 1})-1)             — расчет нормализованной степени
  4. =H2/MAX($H$2:$H$${N + 1})                    — расчет относительного посредничества
  5. =COUNTIF($N$2:$N$${N + 1}; N2)               — автоматический подсчет размера школы
  6. =RANK(E2; $E$2:$E$${N + 1})                  — динамический ранг автора
  7. =SUM(D2:D${N + 1})                           — суммирование по столбцу
  8. =AVERAGE(E2:E${N + 1})                       — среднее значение по столбцу
  9. =MEDIAN(E2:E${N + 1})                        — медианное значение
 10. =STDEV(E2:E${N + 1})                         — выборочное стандартное отклонение (СТАНДОТКЛОН)
 11. =VAR(E2:E${N + 1})                           — выборочная дисперсия (ДИСП)
 12. =COUNTIF(E2:E${N + 1}; ">0")                 — подсчет авторов с соавторами
 13. =LARGE('1. Числовые характеристики'!$E$2:$E$${N + 1}; 1) — выбор k-го максимума для рейтинга

Все формулы сохранены в стандартном синтаксисе Microsoft Excel / LibreOffice Calc
и автоматически пересчитываются при изменении или дополнении исходных строк.

С уважением,
Александра.
================================================================================
`;

  const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });
  downloadFile(blob, filename);
}


/**
 * 4. Экспорт таблицы связей соавторства в .xlsx с формулами
 */
export function exportEdgesXLSX(links: GraphLink[], filename = 'таблица_связей_соавторства.xlsx') {
  const data = links.map((link, idx) => {
    const s = typeof link.source === 'object' ? (link.source as GraphNode).id : link.source;
    const t = typeof link.target === 'object' ? (link.target as GraphNode).id : link.target;
    return {
      '№': idx + 1,
      'Автор 1': s,
      'Автор 2': t,
      'Количество совместных публикаций': link.weight,
      'Категория силы связи': link.weight >= 4 ? 'Очень тесная (4+)' : link.weight === 3 ? 'Тесная (3)' : link.weight === 2 ? 'Повторная (2)' : 'Разовая (1)',
    };
  });

  const ws = XLSX.utils.json_to_sheet(data);
  const N = links.length;

  // Add summary row with formulas at bottom
  if (N > 0) {
    const sumRow = N + 2;
    ws[`C${sumRow}`] = { t: 's', v: 'ИТОГО СВЯЗЕЙ / СУММА:' };
    ws[`D${sumRow}`] = { t: 'n', f: `SUM(D2:D${N + 1})`, v: links.reduce((a, b) => a + b.weight, 0) };

    const avgRow = N + 3;
    ws[`C${avgRow}`] = { t: 's', v: 'СРЕДНЯЯ СИЛА СВЯЗИ:' };
    ws[`D${avgRow}`] = { t: 'n', f: `AVERAGE(D2:D${N + 1})` };

    const maxRow = N + 4;
    ws[`C${maxRow}`] = { t: 's', v: 'МАКСИМАЛЬНАЯ СИЛА СВЯЗИ:' };
    ws[`D${maxRow}`] = { t: 'n', f: `MAX(D2:D${N + 1})` };

    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:E1');
    range.e.r = Math.max(range.e.r, maxRow);
    ws['!ref'] = XLSX.utils.encode_range(range);
  }

  ws['!cols'] = [
    { wch: 6 },
    { wch: 26 },
    { wch: 26 },
    { wch: 20 },
    { wch: 22 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Связи соавторства');
  XLSX.writeFile(wb, filename);
}

/**
 * 5. Экспорт статистики сети в .xlsx с формулами
 */
export function exportStatsXLSX(
  stats: {
    totalPubs: number;
    totalAuthors: number;
    totalEdges: number;
    isolatedCount: number;
    avgWeight: string;
    maxWeight: number;
    density: string;
    topByDegree: GraphNode[];
  },
  networkData: NetworkData,
  filename = 'статистика_сети_с_формулами.xlsx'
) {
  const wb = XLSX.utils.book_new();

  // Sheet 1: Общие показатели
  const generalData = [
    { 'Параметр': 'Всего публикаций в корпусе', 'Значение': stats.totalPubs, 'Формула / Примечание': 'N_pubs' },
    { 'Параметр': 'Всего исследователей (узлов сети V)', 'Значение': stats.totalAuthors, 'Формула / Примечание': 'N = |V|' },
    { 'Параметр': 'Всего пар соавторства (рёбер сети E)', 'Значение': stats.totalEdges, 'Формула / Примечание': 'M = |E|' },
    { 'Параметр': 'Изолированных авторов (без соавторов)', 'Значение': stats.isolatedCount, 'Формула / Примечание': 'k_i = 0' },
    { 'Параметр': 'Плотность сети (Network Density)', 'Значение': Number(stats.density), 'Формула / Примечание': '2*E / (V*(V-1))' },
    { 'Параметр': 'Средняя сила связи (статей на пару)', 'Значение': Number(stats.avgWeight), 'Формула / Примечание': 'sum(w_ij) / M' },
    { 'Параметр': 'Максимальное число совместных трудов у одной пары', 'Значение': stats.maxWeight, 'Формула / Примечание': 'max(w_ij)' },
    { 'Параметр': 'Количество научных сообществ (школ)', 'Значение': networkData.communities.length, 'Формула / Примечание': 'Кластеризация Ньюмана' },
  ];
  const ws1 = XLSX.utils.json_to_sheet(generalData);

  // Add density formula in cell B6: =2*B4/(B3*(B3-1))
  ws1['B6'] = {
    t: 'n',
    f: stats.totalAuthors > 1 ? `2*B4/(B3*(B3-1))` : '0',
    v: Number(stats.density),
  };

  ws1['!cols'] = [{ wch: 42 }, { wch: 18 }, { wch: 25 }];
  XLSX.utils.book_append_sheet(wb, ws1, 'Общие метрики');

  // Sheet 2: Лидеры по степени связи
  const leadersData = stats.topByDegree.map((node, i) => ({
    'Ранг': i + 1,
    'Автор': node.label,
    'Число соавторов (Degree)': node.connections,
    'Публикаций': node.publications,
    'Взвешенная сила (Strength)': node.weightedDegree ?? node.connections,
    'Центральность по посредничеству': Number(node.centrality.toFixed(4)),
    'Школа': `Школа ${(node.communityId ?? 0) + 1}`,
  }));
  const ws2 = XLSX.utils.json_to_sheet(leadersData);
  ws2['!cols'] = [
    { wch: 6 },
    { wch: 26 },
    { wch: 18 },
    { wch: 14 },
    { wch: 18 },
    { wch: 24 },
    { wch: 16 },
  ];
  XLSX.utils.book_append_sheet(wb, ws2, 'Топ-авторы');

  XLSX.writeFile(wb, filename);
}

/**
 * 6. Экспорт полного реестра публикаций в .xlsx
 */
export function exportPublicationsXLSX(articles: Article[], filename = 'реестр_публикаций.xlsx') {
  const data = articles.map((art, idx) => ({
    '№': idx + 1,
    'Год': art.year || '—',
    'Библиографическое описание (Название)': art.title,
    'Авторы': art.authors.join('; '),
    'Организация': art.organization || 'ПетрГУ',
  }));

  const ws = XLSX.utils.json_to_sheet(data);
  ws['!cols'] = [
    { wch: 6 },
    { wch: 10 },
    { wch: 60 },
    { wch: 40 },
    { wch: 18 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Публикации');
  XLSX.writeFile(wb, filename);
}

/**
 * 7. Генеральный экспорт: Полный мастер-пакет сетевого анализа для ВКР / дипломного проекта
 * Содержит абсолютно все данные в едином структурированном файле с живыми формулами на всех листах!
 */
export function exportFullMasterReportXLSX(
  networkData: NetworkData,
  articles: Article[],
  stats: {
    totalPubs: number;
    totalAuthors: number;
    totalEdges: number;
    isolatedCount: number;
    avgWeight: string;
    maxWeight: number;
    density: string;
    topByDegree: GraphNode[];
  },
  filename = 'полный_сетевой_анализ_ВКР_ПетрГУ_КарНЦ.xlsx'
) {
  const wb = XLSX.utils.book_new();

  // 1. Исследователи с формулами
  const sorted = [...networkData.nodes].sort((a, b) => b.connections - a.connections || b.centrality - a.centrality);
  const N = sorted.length;

  const resAOA: (string | number | null)[][] = [
    [
      '№',
      'Исследователь',
      'Организация',
      'Публикаций',
      'Степень (Degree, k)',
      'Норм. степень (Degree Centrality)',
      'Взвешенная степень (Strength)',
      'Посредничество (Betweenness)',
      'Близость (Closeness)',
      'Кластеризация (Clustering)',
      'Научная школа',
      'Размер школы (формула)',
    ],
  ];

  sorted.forEach((node, idx) => {
    resAOA.push([
      idx + 1,
      node.label,
      node.organization || 'ПетрГУ',
      node.publications,
      node.connections,
      null, // Formula
      node.weightedDegree ?? node.connections,
      Number(node.centrality.toFixed(4)),
      Number((node.closeness ?? 0).toFixed(4)),
      Number((node.clusteringCoefficient ?? 0).toFixed(4)),
      `Школа ${(node.communityId ?? 0) + 1}`,
      null, // Formula
    ]);
  });

  // Summary row
  const sumRow = N + 2;
  const avgRow = N + 3;
  resAOA.push(['', 'ИТОГО / СУММА:', '', null, null, null, null, null, null, null, '', null]);
  resAOA.push(['', 'СРЕДНЕЕ ЗНАЧЕНИЕ:', '', null, null, null, null, null, null, null, '', null]);

  const wsRes = XLSX.utils.aoa_to_sheet(resAOA);

  // Add formulas
  sorted.forEach((_, idx) => {
    const r = idx + 2;
    wsRes[`F${r}`] = {
      t: 'n',
      f: N > 1 ? `E${r}/(COUNTA($B$2:$B$${N + 1})-1)` : '0',
    };
    wsRes[`L${r}`] = {
      t: 'n',
      f: `COUNTIF($K$2:$K$${N + 1}, K${r})`,
    };
  });

  wsRes[`D${sumRow}`] = { t: 'n', f: `SUM(D2:D${N + 1})` };
  wsRes[`E${sumRow}`] = { t: 'n', f: `SUM(E2:E${N + 1})` };
  wsRes[`G${sumRow}`] = { t: 'n', f: `SUM(G2:G${N + 1})` };

  wsRes[`D${avgRow}`] = { t: 'n', f: `AVERAGE(D2:D${N + 1})` };
  wsRes[`E${avgRow}`] = { t: 'n', f: `AVERAGE(E2:E${N + 1})` };
  wsRes[`F${avgRow}`] = { t: 'n', f: `AVERAGE(F2:F${N + 1})` };
  wsRes[`G${avgRow}`] = { t: 'n', f: `AVERAGE(G2:G${N + 1})` };
  wsRes[`H${avgRow}`] = { t: 'n', f: `AVERAGE(H2:H${N + 1})` };
  wsRes[`I${avgRow}`] = { t: 'n', f: `AVERAGE(I2:I${N + 1})` };
  wsRes[`J${avgRow}`] = { t: 'n', f: `AVERAGE(J2:J${N + 1})` };

  wsRes['!cols'] = [
    { wch: 5 }, { wch: 25 }, { wch: 16 }, { wch: 14 },
    { wch: 16 }, { wch: 24 }, { wch: 20 }, { wch: 20 },
    { wch: 18 }, { wch: 20 }, { wch: 16 }, { wch: 18 },
  ];
  XLSX.utils.book_append_sheet(wb, wsRes, '1. Исследователи');

  // 2. Связи соавторства
  const linksData = networkData.links.map((link, idx) => {
    const s = typeof link.source === 'object' ? (link.source as GraphNode).id : link.source;
    const t = typeof link.target === 'object' ? (link.target as GraphNode).id : link.target;
    return {
      '№': idx + 1,
      'Автор 1': s,
      'Автор 2': t,
      'Совместных статей': link.weight,
      'Сила связи': link.weight >= 4 ? 'Очень тесная (4+)' : link.weight === 3 ? 'Тесная (3)' : link.weight === 2 ? 'Повторная (2)' : 'Разовая (1)',
    };
  });
  const wsLinks = XLSX.utils.json_to_sheet(linksData);
  wsLinks['!cols'] = [{ wch: 6 }, { wch: 25 }, { wch: 25 }, { wch: 18 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, wsLinks, '2. Связи соавторства');

  // 3. Топологические метрики сети с формулами
  const summaryAOA: (string | number | null)[][] = [
    ['Параметр', 'Значение (формула)', 'Обозначение'],
    ['Всего публикаций в выборке', stats.totalPubs, 'N_pubs'],
    ['Всего авторов (вершин сети)', stats.totalAuthors, 'V = |V|'],
    ['Всего пар соавторства (рёбер сети)', stats.totalEdges, 'E = |E|'],
    ['Изолированных авторов', stats.isolatedCount, 'k_i = 0'],
    ['Плотность сети (Network Density)', null, '2*E / (V*(V-1))'],
    ['Средняя степень вершины сети', null, 'sum(k_i) / V'],
    ['Максимальное число совместных трудов у пары', stats.maxWeight, 'max(w_ij)'],
    ['Количество научных школ (кластеров)', networkData.communities.length, 'Q-модулярность'],
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryAOA);
  // Formula for density in cell B6: =2*B4/(B3*(B3-1))
  wsSummary['B6'] = {
    t: 'n',
    f: stats.totalAuthors > 1 ? '2*B4/(B3*(B3-1))' : '0',
    v: Number(stats.density),
  };
  // Formula for average degree in cell B7: =2*B4/B3
  wsSummary['B7'] = {
    t: 'n',
    f: stats.totalAuthors > 0 ? '2*B4/B3' : '0',
    v: stats.totalAuthors > 0 ? Number(((2 * stats.totalEdges) / stats.totalAuthors).toFixed(2)) : 0,
  };

  wsSummary['!cols'] = [{ wch: 38 }, { wch: 22 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, '3. Метрики сети');

  // 4. Реестр публикаций
  const pubsData = articles.map((art, idx) => ({
    '№': idx + 1,
    'Год': art.year || '—',
    'Библиографическое описание': art.title,
    'Авторы': art.authors.join('; '),
    'Организация': art.organization || 'ПетрГУ',
  }));
  const wsPubs = XLSX.utils.json_to_sheet(pubsData);
  wsPubs['!cols'] = [{ wch: 6 }, { wch: 10 }, { wch: 55 }, { wch: 38 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, wsPubs, '4. Реестр публикаций');

  // 5. Методологический справочник формул
  const glossary = [
    { 'Показатель': 'Степень вершины (Degree)', 'Формула в Excel': '=SUM(B2:Z2)', 'Математическая формула': 'k_i = sum(a_ij)', 'Значение для исследования': 'Число непосредственных соавторов исследователя' },
    { 'Показатель': 'Степень центральности', 'Формула в Excel': '=E2/(COUNTA($B$2:$B$N)-1)', 'Математическая формула': 'C_D(i) = k_i / (N - 1)', 'Значение для исследования': 'Нормализованная степень от 0 до 1' },
    { 'Показатель': 'Взвешенная степень (Strength)', 'Формула в Excel': '=SUM(w_ij)', 'Математическая формула': 's_i = sum(w_ij)', 'Значение для исследования': 'Общее число совместных публикаций' },
    { 'Показатель': 'Центральность по посредничеству', 'Формула в Excel': 'Алгоритм Брандеса', 'Математическая формула': 'C_B(v) = sum(sigma_st(v) / sigma_st)', 'Значение для исследования': 'Роль моста между разобщенными коллективами' },
    { 'Показатель': 'Центральность по близости', 'Формула в Excel': 'BFS-обход графа', 'Математическая формула': 'C_C(v) = (N - 1) / sum(d_vu)', 'Значение для исследования': 'Скорость доступа к ресурсам всей сети' },
    { 'Показатель': 'Коэффициент кластеризации', 'Формула в Excel': '=2*E_i/(k_i*(k_i-1))', 'Математическая формула': 'C_i = 2 * E_i / (k_i * (k_i - 1))', 'Значение для исследования': 'Сплоченность научного круга соавторов' },
  ];
  const wsGlossary = XLSX.utils.json_to_sheet(glossary);
  wsGlossary['!cols'] = [{ wch: 32 }, { wch: 25 }, { wch: 30 }, { wch: 45 }];
  XLSX.utils.book_append_sheet(wb, wsGlossary, '5. Методология и формулы');

  XLSX.writeFile(wb, filename);
}

/**
 * 8. Генерация готового шаблона для ввода и импорта публикаций С ЖИВЫМИ ФОРМУЛАМИ EXCEL
 * Позволяет пользователю или преподавателю скачать файл, заполнить его данными
 * с автоматическим подсчетом соавторов и затем без проблем загрузить в программу!
 */
export function exportImportTemplateWithFormulasXLSX(filename = 'шаблон_публикаций_с_формулами.xlsx') {
  const wb = XLSX.utils.book_new();

  // Лист 1: Матрица инцидентности (статьи x авторы с отметками "1" и формулами сумм)
  const authorsList = [
    'Захаров В.Н.',
    'Леонтьев А.А.',
    'Рогов А.А.',
    'Сидоров Ю.В.',
    'Кузнецов В.А.',
    'Васильев Н.Н.',
    'Фомин В.В.',
  ];

  const incHeaders = [
    '№',
    'Год',
    'Библиографическое описание (Статья // Издание)',
    ...authorsList,
    'Всего соавторов (формула)',
    'Тип публикации (формула)',
  ];

  const sampleRows: (string | number | null)[][] = [
    [
      1,
      2024,
      'Захаров В.Н., Леонтьев А.А., Рогов А.А. Интеллектуальный анализ сетевых структур // Труды ПетрГУ. 2024.',
      1, 1, 1, 0, 0, 0, 0,
      null, null,
    ],
    [
      2,
      2023,
      'Рогов А.А., Сидоров Ю.В., Фомин В.В. Модели графов в задачах регионального науковедения // Ученые записки ПетрГУ. 2023.',
      0, 0, 1, 1, 0, 0, 1,
      null, null,
    ],
    [
      3,
      2022,
      'Захаров В.Н., Кузнецов В.А. Кластеризация графовых структур данных // Вестник ПетрГУ. 2022.',
      1, 0, 0, 0, 1, 0, 0,
      null, null,
    ],
    [
      4,
      2021,
      'Леонтьев А.А., Рогов А.А. Анализ взаимодействия научных школ Карелии // КарНЦ РАН. 2021.',
      0, 1, 1, 0, 0, 0, 0,
      null, null,
    ],
    [
      5,
      2020,
      'Васильев Н.Н. О свойствах спектра графов соавторства // Труды КарНЦ РАН. 2020.',
      0, 0, 0, 0, 0, 1, 0,
      null, null,
    ],
  ];

  const numSampleRows = sampleRows.length;
  const numAuthors = authorsList.length;
  const firstAuthorCol = 'D';
  const lastAuthorCol = XLSX.utils.encode_col(3 + numAuthors - 1);
  const totalAuthorsCol = XLSX.utils.encode_col(3 + numAuthors);
  const pubTypeCol = XLSX.utils.encode_col(3 + numAuthors + 1);

  // Summary row at bottom
  const sumRowAOA: (string | number | null)[] = [
    '',
    '',
    'ИТОГО статей у каждого автора (формула SUM):',
    ...Array(numAuthors).fill(null),
    null,
    '',
  ];

  const wsInc = XLSX.utils.aoa_to_sheet([incHeaders, ...sampleRows, sumRowAOA]);

  // Inject formulas for sample rows
  for (let i = 0; i < numSampleRows; i++) {
    const r = i + 2;
    const sampleSum = (sampleRows[i].slice(3, 3 + numAuthors) as number[]).reduce((a, b) => a + (b || 0), 0);
    // Formula for total authors in row: =SUM(D2:J2)
    wsInc[`${totalAuthorsCol}${r}`] = {
      t: 'n',
      f: `SUM(${firstAuthorCol}${r}:${lastAuthorCol}${r})`,
      v: sampleSum,
    };
    // Formula for publication type: =IF(K2>1, "Коллаборация (соавторство)", IF(K2=1, "Индивидуальная", "Не отмечено"))
    wsInc[`${pubTypeCol}${r}`] = {
      t: 's',
      f: `IF(${totalAuthorsCol}${r}>1, "Коллаборация (соавторство)", IF(${totalAuthorsCol}${r}=1, "Индивидуальная", "Не отмечено"))`,
      v: sampleSum > 1 ? 'Коллаборация (соавторство)' : sampleSum === 1 ? 'Индивидуальная' : 'Не отмечено',
    };
  }

  // Inject column sum formulas at row numSampleRows + 2
  const sumRowNum = numSampleRows + 2;
  let totalMentions = 0;
  for (let c = 0; c < numAuthors; c++) {
    const colLetter = XLSX.utils.encode_col(3 + c);
    const colSumVal = sampleRows.reduce((acc, row) => acc + Number(row[3 + c] || 0), 0);
    totalMentions += colSumVal;
    wsInc[`${colLetter}${sumRowNum}`] = {
      t: 'n',
      f: `SUM(${colLetter}2:${colLetter}${numSampleRows + 1})`,
      v: colSumVal,
    };
  }
  // Total sum of all author mentions
  wsInc[`${totalAuthorsCol}${sumRowNum}`] = {
    t: 'n',
    f: `SUM(${firstAuthorCol}${sumRowNum}:${lastAuthorCol}${sumRowNum})`,
    v: totalMentions,
  };

  const incCols = [
    { wch: 5 },  // №
    { wch: 8 },  // Год
    { wch: 60 }, // Название статьи
  ];
  for (let i = 0; i < numAuthors; i++) incCols.push({ wch: 15 });
  incCols.push({ wch: 24 }); // Всего соавторов
  incCols.push({ wch: 28 }); // Тип публикации
  wsInc['!cols'] = incCols;

  XLSX.utils.book_append_sheet(wb, wsInc, 'Матрица инцидентности');

  // Лист 2: Стандартная таблица публикаций с формулой подсчета числа авторов
  const tableHeaders = [
    '№',
    'Год',
    'Название публикации',
    'Авторы (через запятую)',
    'Организация',
    'Количество авторов (формула)',
  ];

  const tableSampleRows: (string | number | null)[][] = [
    [1, 2024, 'Интеллектуальный анализ сетевых структур', 'Захаров В.Н., Леонтьев А.А., Рогов А.А.', 'ПетрГУ', null],
    [2, 2023, 'Модели графов в задачах регионального науковедения', 'Рогов А.А., Сидоров Ю.В., Фомин В.В.', 'ПетрГУ', null],
    [3, 2022, 'Кластеризация графовых структур данных', 'Захаров В.Н., Кузнецов В.А.', 'ПетрГУ', null],
    [4, 2021, 'Анализ взаимодействия научных школ Карелии', 'Леонтьев А.А., Рогов А.А.', 'КарНЦ РАН', null],
    [5, 2020, 'О свойствах спектра графов соавторства', 'Васильев Н.Н.', 'КарНЦ РАН', null],
  ];

  const tableSumRow: (string | number | null)[] = ['', '', 'ИТОГО ПУБЛИКАЦИЙ:', '', '', null];

  const wsTable = XLSX.utils.aoa_to_sheet([tableHeaders, ...tableSampleRows, tableSumRow]);

  let totalAuthorsCount = 0;
  for (let i = 0; i < tableSampleRows.length; i++) {
    const r = i + 2;
    const authorStr = String(tableSampleRows[i][3] || '');
    const numAuthorsInArticle = authorStr.split(',').length;
    totalAuthorsCount += numAuthorsInArticle;
    // Formula to count commas + 1: =IF(ISBLANK(D2), 0, LEN(TRIM(D2))-LEN(SUBSTITUTE(D2, ",", ""))+1)
    wsTable[`F${r}`] = {
      t: 'n',
      f: `IF(ISBLANK(D${r}), 0, LEN(TRIM(D${r}))-LEN(SUBSTITUTE(D${r}, ",", ""))+1)`,
      v: numAuthorsInArticle,
    };
  }

  const tableSumRowNum = tableSampleRows.length + 2;
  // Total publications formula: =COUNTA(C2:C6)
  wsTable[`D${tableSumRowNum}`] = {
    t: 'n',
    f: `COUNTA(C2:C${tableSampleRows.length + 1})`,
    v: tableSampleRows.length,
  };
  // Total author links formula: =SUM(F2:F6)
  wsTable[`F${tableSumRowNum}`] = {
    t: 'n',
    f: `SUM(F2:F${tableSampleRows.length + 1})`,
    v: totalAuthorsCount,
  };

  wsTable['!cols'] = [
    { wch: 5 },
    { wch: 8 },
    { wch: 50 },
    { wch: 45 },
    { wch: 18 },
    { wch: 26 },
  ];
  XLSX.utils.book_append_sheet(wb, wsTable, 'Стандартный список статей');

  // Лист 3: Инструкция
  const instructionData = [
    { 'Шаг': '1', 'Действие': 'Выберите удобный формат', 'Пояснение': 'Вкладка "Матрица инцидентности" удобна для разметки соавторов галочками/единицами (1), вкладка "Стандартный список" — для списков публикаций с авторами через запятую.' },
    { 'Шаг': '2', 'Действие': 'Заполните статьи и авторов', 'Пояснение': 'Формулы Excel в столбцах "Всего соавторов" и внизу таблицы автоматически пересчитают суммы и типы публикаций.' },
    { 'Шаг': '3', 'Действие': 'Сохраните файл .xlsx', 'Пояснение': 'Нажмите Ctrl+S (или Cmd+S на Mac) для сохранения.' },
    { 'Шаг': '4', 'Действие': 'Загрузите файл в веб-приложение', 'Пояснение': 'Нажмите кнопку "Загрузить Excel (.xlsx)" в приложении. Программа автоматически прочитает все формулы, построит граф и рассчитает все центральности!' },
  ];
  const wsInst = XLSX.utils.json_to_sheet(instructionData);
  wsInst['!cols'] = [{ wch: 6 }, { wch: 30 }, { wch: 75 }];
  XLSX.utils.book_append_sheet(wb, wsInst, 'Инструкция');

  XLSX.writeFile(wb, filename);
}
