import React, { useState } from 'react';
import { Article, GraphNode } from '../types';

interface MatrixViewerProps {
  articles: Article[];
  nodes: GraphNode[];
}

export const MatrixViewer: React.FC<MatrixViewerProps> = ({ articles, nodes }) => {
  const [matrixType, setMatrixType] = useState<'adjacency' | 'incidence'>('adjacency');

  // Adjacency Matrix calculation
  const authorNames = nodes.map((n) => n.id);
  const adjMatrix: number[][] = Array(authorNames.length)
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
          adjMatrix[idx1][idx2] += 1;
        }
      }
    }
  });

  // Incidence Matrix calculation (Authors x Articles)
  const incMatrix: number[][] = Array(authorNames.length)
    .fill(0)
    .map(() => Array(articles.length).fill(0));

  articles.forEach((art, artIdx) => {
    art.authors.forEach((author) => {
      const authIdx = authorNames.indexOf(author.trim());
      if (authIdx !== -1) {
        incMatrix[authIdx][artIdx] = 1;
      }
    });
  });

  return (
    <div className="p-6 space-y-5">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h3 className="text-base font-bold text-gray-800">
            📐 Алгебраическое представление сети
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Матрицы инцидентности и смежности, используемые в сетевом анализе (PetrSU & KarRC RAS)
          </p>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setMatrixType('adjacency')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
              matrixType === 'adjacency'
                ? 'bg-[#667eea] text-white shadow-xs'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Матрица смежности A ({authorNames.length}×{authorNames.length})
          </button>
          <button
            type="button"
            onClick={() => setMatrixType('incidence')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
              matrixType === 'incidence'
                ? 'bg-[#667eea] text-white shadow-xs'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Матрица инцидентности B ({authorNames.length}×{articles.length})
          </button>
        </div>
      </div>

      {/* Formula hint */}
      <div className="bg-indigo-50/70 border border-indigo-100 rounded-lg p-3 text-xs text-indigo-900 flex items-center justify-between">
        <div>
          <strong>Математическая связь проекции двудольного графа:</strong>{' '}
          <span className="font-mono bg-white px-2 py-0.5 rounded border border-indigo-200 text-indigo-800">
            A = B · B<sup>T</sup> - diag(B · B<sup>T</sup>)
          </span>
          <span className="text-indigo-700 ml-2">
            (где элемент a<sub>ij</sub> равен числу совместных публикаций авторов i и j)
          </span>
        </div>
      </div>

      {/* Matrix Table */}
      <div className="overflow-x-auto max-h-[460px] border border-gray-200 rounded-lg shadow-inner bg-white">
        {matrixType === 'adjacency' ? (
          <table className="min-w-full text-[11px] text-center border-collapse">
            <thead className="bg-gray-50 sticky top-0 z-10 border-b border-gray-200">
              <tr>
                <th className="p-2 border-r border-gray-200 text-left font-bold text-gray-600 bg-gray-100">
                  Автор / Автор
                </th>
                {authorNames.map((name, i) => (
                  <th key={name} className="p-2 font-semibold text-gray-700 min-w-[70px] truncate" title={name}>
                    A{i + 1}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {authorNames.map((rowName, rIdx) => (
                <tr key={rowName} className="hover:bg-indigo-50/30 border-b border-gray-100">
                  <td className="p-2 text-left font-medium text-gray-800 bg-gray-50/70 border-r border-gray-200 whitespace-nowrap">
                    <span className="text-gray-400 font-mono mr-1">A{rIdx + 1}.</span> {rowName}
                  </td>
                  {authorNames.map((colName, cIdx) => {
                    const val = adjMatrix[rIdx][cIdx];
                    const isDiagonal = rIdx === cIdx;
                    return (
                      <td
                        key={`${rowName}-${colName}`}
                        className={`p-2 font-mono ${
                          isDiagonal
                            ? 'bg-gray-100 text-gray-400'
                            : val > 0
                            ? 'font-bold text-indigo-700 bg-indigo-50/60'
                            : 'text-gray-300'
                        }`}
                      >
                        {val}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="min-w-full text-[11px] text-center border-collapse">
            <thead className="bg-gray-50 sticky top-0 z-10 border-b border-gray-200">
              <tr>
                <th className="p-2 border-r border-gray-200 text-left font-bold text-gray-600 bg-gray-100">
                  Автор \ Публикация
                </th>
                {articles.map((art, aIdx) => (
                  <th key={art.id} className="p-2 font-semibold text-gray-700 min-w-[65px] truncate" title={`${art.title} (${art.year})`}>
                    П{aIdx + 1}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {authorNames.map((rowName, rIdx) => (
                <tr key={rowName} className="hover:bg-indigo-50/30 border-b border-gray-100">
                  <td className="p-2 text-left font-medium text-gray-800 bg-gray-50/70 border-r border-gray-200 whitespace-nowrap">
                    {rowName}
                  </td>
                  {articles.map((art, artIdx) => {
                    const val = incMatrix[rIdx][artIdx];
                    return (
                      <td
                        key={`${rowName}-${art.id}`}
                        className={`p-2 font-mono ${
                          val === 1 ? 'font-bold text-indigo-700 bg-indigo-50/80' : 'text-gray-300'
                        }`}
                      >
                        {val}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
