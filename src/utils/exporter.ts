import * as XLSX from 'xlsx';
import { Article, GraphNode, GraphLink, NetworkData } from '../types';

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
 * 3. Экспорт списка исследователей в .xlsx
 */
export function exportResearchersXLSX(nodes: GraphNode[], filename = 'список_исследователей.xlsx') {
  const data = nodes.map((node, idx) => ({
    '№': idx + 1,
    'Исследователь': node.label,
    'Публикаций': node.publications,
    'Соавторов (Степень вершины)': node.connections,
    'Центральность по посредничеству (Betweenness)': Number(node.centrality.toFixed(4)),
    'Научная школа (Кластер)': (node.communityId ?? 0) + 1,
  }));

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Исследователи');
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
    };
  });

  const ws = XLSX.utils.json_to_sheet(data);
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
    { 'Параметр': 'Всего публикаций', 'Значение': stats.totalPubs },
    { 'Параметр': 'Всего исследователей (узлов)', 'Значение': stats.totalAuthors },
    { 'Параметр': 'Всего пар соавторства (рёбер)', 'Значение': stats.totalEdges },
    { 'Параметр': 'Изолированных авторов (без соавторов)', 'Значение': stats.isolatedCount },
    { 'Параметр': 'Плотность сети (Density)', 'Значение': stats.density },
    { 'Параметр': 'Средняя сила связи (статей на пару)', 'Значение': stats.avgWeight },
    { 'Параметр': 'Максимальное соавторство у одной пары', 'Значение': stats.maxWeight },
    { 'Параметр': 'Количество научных сообществ (школ)', 'Значение': networkData.communities.length },
  ];
  const ws1 = XLSX.utils.json_to_sheet(generalData);
  XLSX.utils.book_append_sheet(wb, ws1, 'Общие метрики');

  // Sheet 2: Лидеры по степени связи
  const leadersData = stats.topByDegree.map((node, i) => ({
    'Ранг': i + 1,
    'Автор': node.label,
    'Число соавторов (Degree)': node.connections,
    'Публикаций': node.publications,
    'Центральность по посредничеству': Number(node.centrality.toFixed(4)),
    'Школа': (node.communityId ?? 0) + 1,
  }));
  const ws2 = XLSX.utils.json_to_sheet(leadersData);
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
    'Организация': art.organization || '',
  }));

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Публикации');
  XLSX.writeFile(wb, filename);
}
