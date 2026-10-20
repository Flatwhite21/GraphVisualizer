import React, { useState, useMemo } from 'react';
import { Article } from '../types';
import { exportPublicationsXLSX } from '../utils/exporter';
import { Search, FileSpreadsheet, Plus, Trash2, BookOpen, Building, Calendar, Filter } from 'lucide-react';

interface ArticlesListProps {
  articles: Article[];
  selectedAuthorId: string | null;
  onSelectAuthor: (author: string | null) => void;
  onDeleteArticle?: (id: string) => void;
  onOpenAddModal?: () => void;
  onUploadExcelClick?: () => void;
}

export const ArticlesList: React.FC<ArticlesListProps> = ({
  articles,
  selectedAuthorId,
  onSelectAuthor,
  onDeleteArticle,
  onOpenAddModal,
  onUploadExcelClick,
}) => {
  const [search, setSearch] = useState('');
  const [selectedOrg, setSelectedOrg] = useState<string>('all');
  const [selectedYear, setSelectedYear] = useState<string>('all');

  // Extract unique years
  const availableYears = useMemo(() => {
    const years = Array.from(new Set(articles.map((a) => a.year).filter((y) => y > 0))).sort((a, b) => b - a);
    return years;
  }, [articles]);

  const filteredArticles = useMemo(() => {
    return articles.filter((art) => {
      const q = search.toLowerCase().trim();
      const matchesSearch =
        !q ||
        art.title.toLowerCase().includes(q) ||
        art.authors.some((a) => a.toLowerCase().includes(q)) ||
        String(art.year).includes(q) ||
        (art.organization && art.organization.toLowerCase().includes(q));

      const matchesAuthor = selectedAuthorId ? art.authors.includes(selectedAuthorId) : true;

      const matchesOrg =
        selectedOrg === 'all'
          ? true
          : selectedOrg === 'petrsu'
          ? (art.organization || '').toLowerCase().includes('петргу')
          : (art.organization || '').toLowerCase().includes('карнц') ||
            (art.organization || '').toLowerCase().includes('ран');

      const matchesYear = selectedYear === 'all' ? true : String(art.year) === selectedYear;

      return matchesSearch && matchesAuthor && matchesOrg && matchesYear;
    });
  }, [articles, search, selectedAuthorId, selectedOrg, selectedYear]);

  const handleExportXLSX = () => {
    exportPublicationsXLSX(filteredArticles);
  };

  return (
    <div className="p-6 space-y-5">
      {/* Header bar */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-2 border-b border-slate-200">
        <div>
          <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-indigo-600" />
            <span>Реестр научных публикаций</span>
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-800">
              {filteredArticles.length} из {articles.length}
            </span>
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Библиографический массив публикаций исследователей ПетрГУ и КарНЦ РАН (2000–2026 гг.)
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {onOpenAddModal && (
            <button
              type="button"
              onClick={onOpenAddModal}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 transition cursor-pointer shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Добавить статью</span>
            </button>
          )}

          {onUploadExcelClick && (
            <button
              type="button"
              onClick={onUploadExcelClick}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg flex items-center gap-1.5 border border-slate-300 transition cursor-pointer"
            >
              <span>Загрузить XLSX</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleExportXLSX}
            className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-800 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition cursor-pointer"
            title="Экспортировать текущий список публикаций в Excel (.xlsx)"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            <span>Экспорт в XLSX</span>
          </button>
        </div>
      </div>

      {/* Filter and search bar */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
        {/* Search */}
        <div className="relative w-full sm:w-80">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по названию, автору или году..."
            className="w-full pl-9 pr-8 py-1.5 bg-white border border-slate-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-700 text-xs font-bold"
            >
              ✕
            </button>
          )}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Org filter */}
          <div className="flex items-center gap-1.5">
            <Building className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={selectedOrg}
              onChange={(e) => setSelectedOrg(e.target.value)}
              className="bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-xs text-slate-800 outline-none shadow-2xs cursor-pointer font-medium"
            >
              <option value="all">Все организации</option>
              <option value="petrsu">ПетрГУ</option>
              <option value="krc">КарНЦ РАН</option>
            </select>
          </div>

          {/* Year filter */}
          <div className="flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-xs text-slate-800 outline-none shadow-2xs cursor-pointer font-medium"
            >
              <option value="all">Все годы</option>
              {availableYears.map((yr) => (
                <option key={yr} value={String(yr)}>
                  {yr} год
                </option>
              ))}
            </select>
          </div>

          {/* Selected Author pill if active */}
          {selectedAuthorId && (
            <div className="flex items-center gap-1.5 bg-indigo-100 text-indigo-900 px-3 py-1 rounded-full text-xs font-semibold shadow-2xs">
              <span>Автор: {selectedAuthorId}</span>
              <button
                type="button"
                onClick={() => onSelectAuthor(null)}
                className="text-indigo-600 hover:text-indigo-900 ml-1 font-bold"
              >
                ✕
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Publications Table */}
      <div className="overflow-x-auto border border-slate-200 rounded-xl shadow-inner bg-white max-h-[520px]">
        <table className="w-full text-xs text-left border-collapse">
          <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0 z-10 border-b border-slate-200">
            <tr>
              <th className="p-3 w-12 text-center border-r border-slate-200">№</th>
              <th className="p-3 w-20 text-center border-r border-slate-200">Год</th>
              <th className="p-3 border-r border-slate-200 min-w-[320px]">Библиографическое описание</th>
              <th className="p-3 border-r border-slate-200 min-w-[220px]">Авторы публикации</th>
              <th className="p-3 w-32 text-center border-r border-slate-200">Организация</th>
              {onDeleteArticle && <th className="p-3 w-16 text-center">Удалить</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredArticles.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-12 text-center text-slate-400">
                  Публикации не найдены по текущим критериям фильтра
                </td>
              </tr>
            ) : (
              filteredArticles.map((art, idx) => (
                <tr key={art.id} className="hover:bg-indigo-50/40 transition">
                  <td className="p-3 text-center text-slate-400 font-mono font-medium border-r border-slate-100">
                    {idx + 1}
                  </td>
                  <td className="p-3 text-center font-bold text-indigo-700 border-r border-slate-100">
                    {art.year || '—'}
                  </td>
                  <td className="p-3 font-medium text-slate-900 border-r border-slate-100 leading-snug">
                    {art.title}
                  </td>
                  <td className="p-3 border-r border-slate-100">
                    <div className="flex flex-wrap gap-1">
                      {art.authors.map((auth) => {
                        const isSelected = selectedAuthorId === auth;
                        return (
                          <button
                            key={auth}
                            type="button"
                            onClick={() => onSelectAuthor(isSelected ? null : auth)}
                            className={`px-2 py-0.5 rounded text-[11px] font-medium transition cursor-pointer ${
                              isSelected
                                ? 'bg-indigo-600 text-white font-bold'
                                : 'bg-slate-100 hover:bg-indigo-100 text-slate-700 hover:text-indigo-800'
                            }`}
                            title="Фильтровать по этому автору"
                          >
                            {auth}
                          </button>
                        );
                      })}
                    </div>
                  </td>
                  <td className="p-3 text-center border-r border-slate-100">
                    <span
                      className={`inline-block px-2.5 py-0.5 rounded-full text-[10.5px] font-semibold ${
                        (art.organization || '').toLowerCase().includes('карнц') ||
                        (art.organization || '').toLowerCase().includes('ран')
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          : 'bg-indigo-100 text-indigo-800 border border-indigo-200'
                      }`}
                    >
                      {art.organization || 'ПетрГУ'}
                    </span>
                  </td>
                  {onDeleteArticle && (
                    <td className="p-3 text-center">
                      <button
                        type="button"
                        onClick={() => onDeleteArticle(art.id)}
                        className="p-1 text-slate-400 hover:text-rose-600 transition cursor-pointer"
                        title="Удалить публикацию"
                      >
                        <Trash2 className="w-4 h-4 mx-auto" />
                      </button>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
