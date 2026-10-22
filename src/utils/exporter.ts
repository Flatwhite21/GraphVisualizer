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
 * 1. Экспорт матрицы смежности в .xlsx
 */
export function exportAdjacencyMatrixXLSX(nodes: GraphNode[], articles: Article[], filename = 'матрица_смежности.xlsx') {
  const authorNames = nodes.map((n) => n.id);
  const matrix: (string | number)[][] = [];

  // Header row
  matrix.push(['Автор \\ Соавтор', ...authorNames]);

  // Compute adjacency
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

  // Rows
  authorNames.forEach((author, rIdx) => {
    matrix.push([author, ...adj[rIdx]]);
  });

  const ws = XLSX.utils.aoa_to_sheet(matrix);
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
 * Сформировано специально для научного руководителя и диплома.
 */
export function exportResearchersXLSX(
  nodes: GraphNode[],
  links: GraphLink[] = [],
  communities: NetworkCommunity[] = [],
  filename = 'расчеты_по_исследователям_сетевой_анализ.xlsx'
) {
  const wb = XLSX.utils.book_new();

  // Helper map for direct coauthors of each author
  const coauthorsMap = new Map<string, string[]>();
  nodes.forEach((n) => coauthorsMap.set(n.id, []));
  links.forEach((l) => {
    const s = typeof l.source === 'object' ? (l.source as GraphNode).id : String(l.source);
    const t = typeof l.target === 'object' ? (l.target as GraphNode).id : String(l.target);
    if (coauthorsMap.has(s)) coauthorsMap.get(s)!.push(t);
    if (coauthorsMap.has(t)) coauthorsMap.get(t)!.push(s);
  });

  // Community size lookup
  const commSizeMap = new Map<number, number>();
  communities.forEach((c) => commSizeMap.set(c.id, c.size));

  // Sort nodes by degree descending, then betweenness
  const sortedNodes = [...nodes].sort((a, b) => b.connections - a.connections || b.centrality - a.centrality);

  // Лист 1: Сводная таблица числовых характеристик
  const mainSheetData = sortedNodes.map((node, idx) => {
    const coauthorsList = coauthorsMap.get(node.id) || [];
    const uniqueCoauthors = Array.from(new Set(coauthorsList));
    const commId = (node.communityId ?? 0) + 1;
    const commSize = commSizeMap.get(node.communityId ?? 0) || 1;

    return {
      '№': idx + 1,
      'Исследователь (Автор)': node.label,
      'Организация (Аффилиация)': node.organization || 'ПетрГУ',
      'Число публикаций (N_pubs)': node.publications,
      'Степень вершины (Degree, k)': node.connections,
      'Нормализованная степень (Degree Centrality)': Number((node.normalizedDegree ?? 0).toFixed(4)),
      'Взвешенная степень (Strength, сумма связей)': node.weightedDegree ?? node.connections,
      'Центральность по посредничеству (Betweenness Centrality)': Number(node.centrality.toFixed(4)),
      'Центральность по близости (Closeness Centrality)': Number((node.closeness ?? 0).toFixed(4)),
      'Локальный коэф. кластеризации (Clustering Coeff)': Number((node.clusteringCoefficient ?? 0).toFixed(4)),
      'Научная школа (Кластер)': `Школа ${commId}`,
      'Размер школы (кол-во авторов)': commSize,
      'Список прямых соавторов': uniqueCoauthors.join('; '),
    };
  });

  const wsMain = XLSX.utils.json_to_sheet(mainSheetData);

  // Column width formatting
  wsMain['!cols'] = [
    { wch: 5 },  // №
    { wch: 26 }, // Исследователь
    { wch: 18 }, // Организация
    { wch: 14 }, // Публикаций
    { wch: 16 }, // Степень (Degree)
    { wch: 22 }, // Норм. степень
    { wch: 22 }, // Взвешенная степень
    { wch: 26 }, // Посредничество
    { wch: 24 }, // Близость
    { wch: 24 }, // Кластеризация
    { wch: 18 }, // Школа
    { wch: 16 }, // Размер школы
    { wch: 45 }, // Список соавторов
  ];
  XLSX.utils.book_append_sheet(wb, wsMain, 'Числовые характеристики');

  // Лист 2: Методологическое описание метрик для отчета/диплома
  const methodologyData = [
    {
      'Метрика / Показатель': 'Степень вершины (Degree, k)',
      'Формула / Определение': 'k_i = sum(a_ij)',
      'Научная интерпретация в анализе': 'Количество непосредственных уникальных соавторов исследователя. Характеризует локальную активность и широту сотрудничества.',
    },
    {
      'Метрика / Показатель': 'Степень центральности (Degree Centrality)',
      'Формула / Определение': 'C_D(i) = k_i / (N - 1)',
      'Научная интерпретация в анализе': 'Нормализованная степень вершины относительно максимально возможного числа соавторов в сети.',
    },
    {
      'Метрика / Показатель': 'Взвешенная степень (Strength / Weighted Degree)',
      'Формула / Определение': 's_i = sum(w_ij)',
      'Научная интерпретация в анализе': 'Суммарное количество совместных публикаций со всеми партнерами. Показывает валовую силу соавторских связей.',
    },
    {
      'Метрика / Показатель': 'Центральность по посредничеству (Betweenness Centrality)',
      'Формула / Определение': 'C_B(v) = sum(sigma_st(v) / sigma_st), алгоритм Брандеса',
      'Научная интерпретация в анализе': 'Показывает, насколько часто исследователь оказывается на кратчайших путях между другими авторами. Выявляет ключевых "информационных посредников" и "мосты" между научными коллективами.',
    },
    {
      'Метрика / Показатель': 'Центральность по близости (Closeness Centrality)',
      'Формула / Определение': 'C_C(v) = (N - 1) / sum(d(v, u))',
      'Научная интерпретация в анализе': 'Обратная величина средней дистанции до всех остальных исследователей. Характеризует скорость распространения научного знания.',
    },
    {
      'Метрика / Показатель': 'Локальный коэффициент кластеризации (Clustering Coefficient)',
      'Формула / Определение': 'C_i = 2 * E_i / (k_i * (k_i - 1))',
      'Научная интерпретация в анализе': 'Доля существующих связей между соавторами автора от максимально возможных. Высокое значение указывает на замкнутый сплоченный коллектив (клику).',
    },
    {
      'Метрика / Показатель': 'Научная школа (Community)',
      'Формула / Определение': 'Алгоритм максимизации модулярности Ньюмана',
      'Научная интерпретация в анализе': 'Плотная связная группа ученых, тесно сотрудничающих внутри своего направления (научной школы) и имеющих сравнительно меньше внешних связей.',
    },
  ];

  const wsMethod = XLSX.utils.json_to_sheet(methodologyData);
  wsMethod['!cols'] = [
    { wch: 32 },
    { wch: 38 },
    { wch: 65 },
  ];
  XLSX.utils.book_append_sheet(wb, wsMethod, 'Методология и формулы');

  // Лист 3: Топ-лидеры по разным метрикам
  const topDegree = [...nodes].sort((a, b) => b.connections - a.connections).slice(0, 10);
  const topBetweenness = [...nodes].sort((a, b) => b.centrality - a.centrality).slice(0, 10);
  const topStrength = [...nodes].sort((a, b) => (b.weightedDegree ?? 0) - (a.weightedDegree ?? 0)).slice(0, 10);

  const topLeadersData: Record<string, string | number>[] = [];
  for (let i = 0; i < 10; i++) {
    topLeadersData.push({
      'Ранг': i + 1,
      'Лидер по соавторам (Degree)': topDegree[i] ? `${topDegree[i].label} (${topDegree[i].connections} соавт.)` : '—',
      'Лидер по посредничеству (Betweenness)': topBetweenness[i] ? `${topBetweenness[i].label} (${topBetweenness[i].centrality.toFixed(4)})` : '—',
      'Лидер по силе связей (Strength)': topStrength[i] ? `${topStrength[i].label} (${topStrength[i].weightedDegree ?? topStrength[i].connections} публ.)` : '—',
    });
  }

  const wsLeaders = XLSX.utils.json_to_sheet(topLeadersData);
  wsLeaders['!cols'] = [
    { wch: 6 },
    { wch: 34 },
    { wch: 36 },
    { wch: 34 },
  ];
  XLSX.utils.book_append_sheet(wb, wsLeaders, 'Рейтинги лидеров');

  XLSX.writeFile(wb, filename);
}

/**
 * 4. Экспорт таблицы связей соавторства в .xlsx
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
 * 5. Экспорт статистики сети в .xlsx
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
  filename = 'статистика_сети.xlsx'
) {
  const wb = XLSX.utils.book_new();

  // Sheet 1: Общие показатели
  const generalData = [
    { 'Параметр': 'Всего публикаций в корпусе', 'Значение': stats.totalPubs },
    { 'Параметр': 'Всего исследователей (узлов сети)', 'Значение': stats.totalAuthors },
    { 'Параметр': 'Всего пар соавторства (рёбер сети)', 'Значение': stats.totalEdges },
    { 'Параметр': 'Изолированных авторов (без соавторов)', 'Значение': stats.isolatedCount },
    { 'Параметр': 'Плотность сети (Network Density)', 'Значение': stats.density },
    { 'Параметр': 'Средняя сила связи (статей на пару)', 'Значение': stats.avgWeight },
    { 'Параметр': 'Максимальное число совместных трудов у одной пары', 'Значение': stats.maxWeight },
    { 'Параметр': 'Количество научных сообществ (школ)', 'Значение': networkData.communities.length },
  ];
  const ws1 = XLSX.utils.json_to_sheet(generalData);
  ws1['!cols'] = [{ wch: 42 }, { wch: 18 }];
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
 * Содержит абсолютно все данные в едином структурированном файле с 6 вкладками!
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

  // 1. Исследователи
  const researchersData = [...networkData.nodes]
    .sort((a, b) => b.connections - a.connections || b.centrality - a.centrality)
    .map((node, idx) => ({
      '№': idx + 1,
      'Исследователь': node.label,
      'Организация': node.organization || 'ПетрГУ',
      'Публикаций': node.publications,
      'Степень (Degree, соавторов)': node.connections,
      'Норм. степень (Degree Centrality)': Number((node.normalizedDegree ?? 0).toFixed(4)),
      'Взвешенная степень (Strength)': node.weightedDegree ?? node.connections,
      'Посредничество (Betweenness)': Number(node.centrality.toFixed(4)),
      'Близость (Closeness)': Number((node.closeness ?? 0).toFixed(4)),
      'Кластеризация (Clustering Coeff)': Number((node.clusteringCoefficient ?? 0).toFixed(4)),
      'Научная школа': `Школа ${(node.communityId ?? 0) + 1}`,
    }));
  const wsRes = XLSX.utils.json_to_sheet(researchersData);
  wsRes['!cols'] = [
    { wch: 5 }, { wch: 25 }, { wch: 16 }, { wch: 14 },
    { wch: 16 }, { wch: 20 }, { wch: 20 }, { wch: 20 },
    { wch: 18 }, { wch: 20 }, { wch: 16 },
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

  // 3. Топологические метрики сети
  const summaryData = [
    { 'Параметр': 'Всего публикаций', 'Значение': stats.totalPubs },
    { 'Параметр': 'Всего авторов (вершин)', 'Значение': stats.totalAuthors },
    { 'Параметр': 'Всего пар соавторства (рёбер)', 'Значение': stats.totalEdges },
    { 'Параметр': 'Изолированных авторов', 'Значение': stats.isolatedCount },
    { 'Параметр': 'Плотность сети (Density)', 'Значение': stats.density },
    { 'Параметр': 'Средняя сила связи (статей на пару)', 'Значение': stats.avgWeight },
    { 'Параметр': 'Максимум совместных трудов у пары', 'Значение': stats.maxWeight },
    { 'Параметр': 'Количество научных школ', 'Значение': networkData.communities.length },
  ];
  const wsSummary = XLSX.utils.json_to_sheet(summaryData);
  wsSummary['!cols'] = [{ wch: 38 }, { wch: 16 }];
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
    { 'Показатель': 'Степень вершины (Degree)', 'Формула': 'k_i = sum(a_ij)', 'Значение для исследования': 'Число непосредственных соавторов исследователя' },
    { 'Показатель': 'Степень центральности', 'Формула': 'C_D(i) = k_i / (N - 1)', 'Значение для исследования': 'Нормализованная степень от 0 до 1' },
    { 'Показатель': 'Взвешенная степень (Strength)', 'Формула': 's_i = sum(w_ij)', 'Значение для исследования': 'Общее число совместных публикаций' },
    { 'Показатель': 'Центральность по посредничеству', 'Формула': 'C_B(v) (алгоритм Брандеса)', 'Значение для исследования': 'Роль моста между разобщенными коллективами' },
    { 'Показатель': 'Центральность по близости', 'Формула': 'C_C(v) = (N - 1) / sum(d_vu)', 'Значение для исследования': 'Скорость доступа к ресурсам всей сети' },
    { 'Показатель': 'Коэффициент кластеризации', 'Формула': 'C_i = 2 * E_i / (k_i * (k_i - 1))', 'Значение для исследования': 'Сплоченность научного круга соавторов' },
  ];
  const wsGlossary = XLSX.utils.json_to_sheet(glossary);
  wsGlossary['!cols'] = [{ wch: 32 }, { wch: 30 }, { wch: 45 }];
  XLSX.utils.book_append_sheet(wb, wsGlossary, '5. Методология и формулы');

  XLSX.writeFile(wb, filename);
}
