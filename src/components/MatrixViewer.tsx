import React, { useState, useMemo } from 'react';
import { Article, GraphNode } from '../types';
import { exportAdjacencyMatrixXLSX, exportAdjacencyMatrixCSV } from '../utils/exporter';
import { FileSpreadsheet, Download, Search, Info, Grid, HelpCircle } from 'lucide-react';

interface MatrixViewerProps {
  articles: Article[];
  nodes: GraphNode[];
}

export const MatrixViewer: React.FC<MatrixViewerProps> = ({ articles, nodes }) => {
  const [matrixType, setMatrixType] = useState<'adjacency' | 'incidence'>('adjacency');
  const [authorSearch, setAuthorSearch] = useState<string>('');
  const [hoveredCell, setHoveredCell] = useState<{ row: number; col: number; val: number } | null>(null);
  const [showAuthorLegend, setShowAuthorLegend] = useState<boolean>(false);

  // Author names list
  const allAuthorNames = useMemo(() => nodes.map((n) => n.id), [nodes]);

  // Filtered author names if search is active
  const filteredIndices = useMemo(() => {
    if (!authorSearch.trim()) return allAuthorNames.map((_, i) => i);
    const q = authorSearch.toLowerCase().trim();
    return allAuthorNames
      .map((name, i) => (name.toLowerCase().includes(q) ? i : -1))
      .filter((i) => i !== -1);
  }, [allAuthorNames, authorSearch]);

  // Adjacency Matrix calculation
  const adjMatrix: number[][] = useMemo(() => {
    const matrix: number[][] = Array(allAuthorNames.length)
      .fill(0)
      .map(() => Array(allAuthorNames.length).fill(0));

    articles.forEach((art) => {
      const list = art.authors.map((a) => a.trim()).filter(Boolean);
      for (let i = 0; i < list.length; i++) {
        for (let j = 0; j < list.length; j++) {
          if (i === j) continue;
          const idx1 = allAuthorNames.indexOf(list[i]);
          const idx2 = allAuthorNames.indexOf(list[j]);
          if (idx1 !== -1 && idx2 !== -1) {
            matrix[idx1][idx2] += 1;
          }
        }
      }
    });
    return matrix;
  }, [allAuthorNames, articles]);

  // Incidence Matrix calculation (Authors x Articles)
  const incMatrix: number[][] = useMemo(() => {
    const matrix: number[][] = Array(allAuthorNames.length)
      .fill(0)
      .map(() => Array(articles.length).fill(0));

    articles.forEach((art, artIdx) => {
      art.authors.forEach((author) => {
        const authIdx = allAuthorNames.indexOf(author.trim());
        if (authIdx !== -1) {
          matrix[authIdx][artIdx] = 1;
        }
      });
    });
    return matrix;
  }, [allAuthorNames, articles]);

  const handleExportXLSX = () => {
    exportAdjacencyMatrixXLSX(nodes, articles);
  };

  const handleExportCSV = () => {
    exportAdjacencyMatrixCSV(nodes, articles);
  };

  return (
    <div className="p-6 space-y-5">
      {/* Top Header Bar */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-2 border-b border-slate-200">
        <div>
          <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Grid className="w-5 h-5 text-indigo-600" />
            <span>Матрицы сетевого взаимодействия авторов</span>
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Топологическое описание научных связей коллективов ПетрГУ и КарНЦ РАН ({allAuthorNames.length} исследователей, {articles.length} публикаций)
          </p>
        </div>

        {/* Matrix Type Switcher & Exports */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="bg-slate-100 p-1 rounded-xl flex items-center text-xs font-semibold">
            <button
              type="button"
              onClick={() => setMatrixType('adjacency')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                matrixType === 'adjacency'
                  ? 'bg-white text-indigo-700 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Матрица смежности A ({allAuthorNames.length}×{allAuthorNames.length})
            </button>
            <button
              type="button"
              onClick={() => setMatrixType('incidence')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                matrixType === 'incidence'
                  ? 'bg-white text-indigo-700 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Матрица инцидентности B ({allAuthorNames.length}×{articles.length})
            </button>
          </div>

          <button
            type="button"
            onClick={handleExportXLSX}
            className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-800 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition cursor-pointer"
            title="Экспортировать матрицу в формате Excel (.xlsx)"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            <span>XLSX</span>
          </button>

          <button
            type="button"
            onClick={handleExportCSV}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition cursor-pointer"
            title="Экспортировать матрицу в формате CSV"
          >
            <Download className="w-3.5 h-3.5 text-slate-600" />
            <span>CSV</span>
          </button>
        </div>
      </div>

      {/* Formula & Properties Callout */}
      <div className="bg-indigo-50/70 border border-indigo-200 rounded-xl p-3.5 text-xs text-indigo-950 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
        <div className="space-y-1">
          <div className="font-semibold flex items-center gap-1.5">
            <Info className="w-4 h-4 text-indigo-600 shrink-0" />
            <span>Свойства матрицы смежности научного соавторства:</span>
          </div>
          <p className="text-[11.5px] text-indigo-800">
            • Элемент <span className="font-mono font-bold">A[i, j]</span> равен количеству совместных статей авторов <span className="font-mono">i</span> и <span className="font-mono">j</span>.<br />
            • Главная диагональ строго равна нулю (<span className="font-mono">A[i, i] = 0</span>, без петель). Матрица симметрична (<span className="font-mono">A[i, j] = A[j, i]</span>).
          </p>
        </div>

        <div className="bg-white px-3 py-2 rounded-lg border border-indigo-200 text-center shrink-0 shadow-2xs">
          <span className="text-[10px] text-slate-500 uppercase font-bold block">Связь проекций:</span>
          <span className="font-mono font-bold text-xs text-indigo-700">
            A = B · B<sup>T</sup> − diag(B · B<sup>T</sup>)
          </span>
        </div>
      </div>

      {/* Filter and Search Controls within Matrix */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={authorSearch}
            onChange={(e) => setAuthorSearch(e.target.value)}
            placeholder="Фильтр авторов в матрице..."
            className="w-full pl-9 pr-8 py-1.5 bg-white border border-slate-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs"
          />
          {authorSearch && (
            <button
              onClick={() => setAuthorSearch('')}
              className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-700 text-xs font-bold"
            >
              ✕
            </button>
          )}
        </div>

        <div className="flex items-center gap-3 text-xs text-slate-600">
          {hoveredCell && (
            <span className="bg-indigo-100 text-indigo-900 px-3 py-1 rounded-full font-medium animate-fadeIn">
              <strong>{allAuthorNames[hoveredCell.row]}</strong> ⟷ <strong>{allAuthorNames[hoveredCell.col]}</strong>: {hoveredCell.val} {hoveredCell.val === 1 ? 'статья' : 'статьи'}
            </span>
          )}

          <button
            type="button"
            onClick={() => setShowAuthorLegend(!showAuthorLegend)}
            className="text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1 hover:underline cursor-pointer"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>{showAuthorLegend ? 'Скрыть справочник кодов' : 'Справочник кодов авторов'}</span>
          </button>
        </div>
      </div>

      {/* Collapsible Author Codes Legend Drawer */}
      {showAuthorLegend && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs">
          <h4 className="font-bold text-slate-800 mb-2.5 flex items-center justify-between">
            <span>Идентификационные индексы исследователей (A1...A{allAuthorNames.length})</span>
            <span className="text-[11px] text-slate-400 font-normal">Соответствуют номерам строк и столбцов</span>
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 max-h-48 overflow-y-auto pr-1">
            {allAuthorNames.map((name, i) => (
              <div key={name} className="flex items-center gap-2 bg-white px-2.5 py-1.5 rounded-lg border border-slate-200">
                <span className="font-mono font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded text-[10px]">
                  A{i + 1}
                </span>
                <span className="font-medium text-slate-800 truncate" title={name}>
                  {name}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Matrix Table with sticky headers & heatmap styling */}
      <div className="overflow-x-auto max-h-[500px] border border-slate-200 rounded-xl shadow-inner bg-white relative">
        {matrixType === 'adjacency' ? (
          <table className="min-w-full text-[11px] text-center border-collapse">
            <thead className="bg-slate-100 sticky top-0 z-20 border-b border-slate-300 shadow-xs">
              <tr>
                <th className="p-2.5 border-r border-slate-300 text-left font-bold text-slate-700 bg-slate-200 sticky left-0 z-30 min-w-[210px]">
                  Исследователь \ Исследователь
                </th>
                {filteredIndices.map((i) => {
                  const name = allAuthorNames[i];
                  return (
                    <th
                      key={name}
                      className="p-2 font-mono font-semibold text-slate-700 border-r border-slate-200 min-w-[58px]"
                      title={`${name} (A${i + 1})`}
                    >
                      A{i + 1}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredIndices.map((rIdx) => {
                const rowName = allAuthorNames[rIdx];
                return (
                  <tr key={rowName} className="hover:bg-indigo-50/50 transition">
                    <td className="p-2.5 text-left font-medium text-slate-800 bg-slate-50/90 border-r border-slate-300 sticky left-0 z-10 whitespace-nowrap">
                      <span className="font-mono text-indigo-600 font-bold mr-1.5 bg-indigo-50 px-1.5 py-0.5 rounded text-[10px]">
                        A{rIdx + 1}
                      </span>
                      <span>{rowName}</span>
                    </td>
                    {filteredIndices.map((cIdx) => {
                      const colName = allAuthorNames[cIdx];
                      const val = adjMatrix[rIdx][cIdx];
                      const isDiagonal = rIdx === cIdx;

                      let cellBg = '';
                      let cellText = 'text-slate-300';

                      if (isDiagonal) {
                        cellBg = 'bg-slate-100 text-slate-400 font-medium';
                      } else if (val >= 4) {
                        cellBg = 'bg-[#0f172a] text-white font-bold shadow-xs';
                        cellText = 'text-white';
                      } else if (val === 3) {
                        cellBg = 'bg-[#1d4ed8] text-white font-bold';
                        cellText = 'text-white';
                      } else if (val === 2) {
                        cellBg = 'bg-[#3b82f6] text-white font-semibold';
                        cellText = 'text-white';
                      } else if (val === 1) {
                        cellBg = 'bg-[#93c5fd]/50 text-indigo-950 font-semibold';
                        cellText = 'text-indigo-950';
                      }

                      return (
                        <td
                          key={`${rowName}-${colName}`}
                          onMouseEnter={() => !isDiagonal && setHoveredCell({ row: rIdx, col: cIdx, val })}
                          onMouseLeave={() => setHoveredCell(null)}
                          className={`p-2 font-mono transition-colors border-r border-slate-100 ${cellBg} ${cellText}`}
                          title={`${rowName} ⟷ ${colName}: ${val} совместных статей`}
                        >
                          {val}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <table className="min-w-full text-[11px] text-center border-collapse">
            <thead className="bg-slate-100 sticky top-0 z-20 border-b border-slate-300 shadow-xs">
              <tr>
                <th className="p-2.5 border-r border-slate-300 text-left font-bold text-slate-700 bg-slate-200 sticky left-0 z-30 min-w-[210px]">
                  Автор \ Публикация
                </th>
                {articles.map((art, aIdx) => (
                  <th
                    key={art.id}
                    className="p-2 font-mono font-semibold text-slate-700 border-r border-slate-200 min-w-[55px]"
                    title={`${art.title} (${art.year})`}
                  >
                    П{aIdx + 1}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredIndices.map((rIdx) => {
                const rowName = allAuthorNames[rIdx];
                return (
                  <tr key={rowName} className="hover:bg-indigo-50/50 transition">
                    <td className="p-2.5 text-left font-medium text-slate-800 bg-slate-50/90 border-r border-slate-300 sticky left-0 z-10 whitespace-nowrap">
                      <span className="font-mono text-indigo-600 font-bold mr-1.5 bg-indigo-50 px-1.5 py-0.5 rounded text-[10px]">
                        A{rIdx + 1}
                      </span>
                      <span>{rowName}</span>
                    </td>
                    {articles.map((art, artIdx) => {
                      const val = incMatrix[rIdx][artIdx];
                      return (
                        <td
                          key={`${rowName}-${art.id}`}
                          className={`p-2 font-mono border-r border-slate-100 ${
                            val === 1 ? 'font-bold bg-indigo-600 text-white' : 'text-slate-300'
                          }`}
                          title={`${rowName} — ${art.title}`}
                        >
                          {val}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
