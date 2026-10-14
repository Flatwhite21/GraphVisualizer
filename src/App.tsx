import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Article, GraphNode } from './types';
import { INITIAL_ARTICLES, buildNetwork, exportToGraphML, exportToEdgeListCSV } from './utils/networkAnalysis';
import { parseExcelFile, ParseResult } from './utils/excelParser';
import { NetworkGraph } from './components/NetworkGraph';
import { ArticleModal } from './components/ArticleModal';
import { MatrixViewer } from './components/MatrixViewer';

const STORAGE_KEY = 'scientific_network_articles_v4';

export const App: React.FC = () => {
  const [articles, setArticles] = useState<Article[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // Fallback
    }
    return INITIAL_ARTICLES;
  });

  const [selectedAuthorId, setSelectedAuthorId] = useState<string | null>(null);
  const [showLabels, setShowLabels] = useState(true);
  const [colorByCommunity, setColorByCommunity] = useState(false);
  const [simulationTrigger, setSimulationTrigger] = useState(0);
  const [activeTab, setActiveTab] = useState<'graph' | 'matrix' | 'raw' | 'authors' | 'stats'>('graph');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [importNotice, setImportNotice] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  // Фильтры
  const [minYear, setMinYear] = useState<number>(2000);
  const [maxYear, setMaxYear] = useState<number>(2026);
  const [minWeight, setMinWeight] = useState<number>(1);
  const [orgFilter, setOrgFilter] = useState<string>('all');
  const [searchAuthor, setSearchAuthor] = useState<string>('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Сохранение в LocalStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(articles));
    } catch {
      // ignore
    }
  }, [articles]);

  // Фильтрация статей
  const filteredArticles = useMemo(() => {
    return articles.filter((art) => {
      if (minYear && art.year > 0 && art.year < minYear) return false;
      if (maxYear && art.year > 0 && art.year > maxYear) return false;
      if (orgFilter !== 'all') {
        const artOrg = (art.organization || '').toLowerCase();
        if (orgFilter === 'petrsu' && !artOrg.includes('петргу')) return false;
        if (orgFilter === 'krc' && !(artOrg.includes('карнц') || artOrg.includes('ияли') || artOrg.includes('ран'))) return false;
      }
      return true;
    });
  }, [articles, minYear, maxYear, orgFilter]);

  // Построение графа
  const networkData = useMemo(() => {
    const data = buildNetwork(filteredArticles);

    if (minWeight > 1 || searchAuthor.trim()) {
      let validLinks = data.links.filter((l) => l.weight >= minWeight);

      if (searchAuthor.trim()) {
        const query = searchAuthor.trim().toLowerCase();
        const matchedNodes = new Set(
          data.nodes
            .filter((n) => n.label.toLowerCase().includes(query))
            .map((n) => n.id)
        );

        const neighbors = new Set<string>();
        validLinks.forEach((l) => {
          const s = typeof l.source === 'object' ? (l.source as GraphNode).id : l.source;
          const t = typeof l.target === 'object' ? (l.target as GraphNode).id : l.target;
          if (matchedNodes.has(s)) neighbors.add(t);
          if (matchedNodes.has(t)) neighbors.add(s);
        });

        const allowed = new Set([...matchedNodes, ...neighbors]);
        validLinks = validLinks.filter((l) => {
          const s = typeof l.source === 'object' ? (l.source as GraphNode).id : l.source;
          const t = typeof l.target === 'object' ? (l.target as GraphNode).id : l.target;
          return allowed.has(s) && allowed.has(t);
        });

        const activeNodes = data.nodes.filter((n) => allowed.has(n.id));
        return {
          ...data,
          nodes: activeNodes,
          links: validLinks,
        };
      }

      return {
        ...data,
        links: validLinks,
      };
    }

    return data;
  }, [filteredArticles, minWeight, searchAuthor]);

  // Данные выбранного автора
  const selectedAuthorInfo = useMemo(() => {
    if (!selectedAuthorId) return null;
    const node = networkData.nodes.find((n) => n.id === selectedAuthorId);
    if (!node) return null;

    const collaborators: string[] = [];
    networkData.links.forEach((l) => {
      const s = typeof l.source === 'object' ? (l.source as GraphNode).id : l.source;
      const t = typeof l.target === 'object' ? (l.target as GraphNode).id : l.target;
      if (s === selectedAuthorId) collaborators.push(t);
      if (t === selectedAuthorId) collaborators.push(s);
    });

    const uniqueCollabs = Array.from(new Set(collaborators));
    const authorArticles = filteredArticles.filter((a) => a.authors.includes(selectedAuthorId));

    return {
      node,
      collaborators: uniqueCollabs,
      articles: authorArticles,
    };
  }, [selectedAuthorId, networkData, filteredArticles]);

  // Статистика
  const stats = useMemo(() => {
    const totalPubs = filteredArticles.length;
    const totalAuthors = networkData.nodes.length;
    const totalEdges = networkData.links.length;

    const isolatedCount = networkData.nodes.filter((n) => {
      return !networkData.links.some((l) => {
        const s = typeof l.source === 'object' ? (l.source as GraphNode).id : l.source;
        const t = typeof l.target === 'object' ? (l.target as GraphNode).id : l.target;
        return s === n.id || t === n.id;
      });
    }).length;

    const weights = networkData.links.map((l) => l.weight);
    const avgWeight = weights.length > 0 ? weights.reduce((a, b) => a + b, 0) / weights.length : 0;
    const maxWeight = weights.length > 0 ? Math.max(...weights) : 0;
    const density = totalAuthors > 1 ? (2 * totalEdges) / (totalAuthors * (totalAuthors - 1)) : 0;

    const topByDegree = [...networkData.nodes]
      .sort((a, b) => b.connections - a.connections || b.publications - a.publications)
      .slice(0, 10);

    return {
      totalPubs,
      totalAuthors,
      totalEdges,
      isolatedCount,
      avgWeight: avgWeight.toFixed(2),
      maxWeight,
      density: density.toFixed(4),
      topByDegree,
    };
  }, [filteredArticles, networkData]);

  // Загрузка Excel файла
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const result: ParseResult = await parseExcelFile(file);
      if (result.articles.length > 0) {
        setArticles(result.articles);
        setSelectedAuthorId(null);
        setSimulationTrigger((t) => t + 1);

        const formatDesc =
          result.detectedFormat === 'matrix_incidence'
            ? 'формат матрицы инцидентности (с отметками соавторов)'
            : 'стандартный табличный формат';

        setImportNotice({
          msg: `Загружено ${result.articles.length} публикаций из "${file.name}" (${formatDesc}).`,
          type: 'success',
        });
        setTimeout(() => setImportNotice(null), 6000);
      } else {
        setImportNotice({
          msg: 'В файле не найдено строк с публикациями. Проверьте структуру файла.',
          type: 'error',
        });
      }
    } catch (err) {
      setImportNotice({
        msg: `Ошибка чтения Excel: ${(err as Error).message}`,
        type: 'error',
      });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleAddArticle = (title: string, authors: string[], year: number) => {
    const newArticle: Article = {
      id: `manual_${Date.now()}`,
      title,
      authors,
      year,
      organization: 'ПетрГУ',
    };
    setArticles((prev) => [newArticle, ...prev]);
  };

  const handleResetToDefault = () => {
    if (window.confirm('Сбросить базу публикаций к исходной выборке ПетрГУ и КарНЦ РАН?')) {
      setArticles(INITIAL_ARTICLES);
      setSelectedAuthorId(null);
      setMinYear(2000);
      setMaxYear(2026);
      setMinWeight(1);
      setOrgFilter('all');
      setSearchAuthor('');
      setSimulationTrigger((t) => t + 1);
      setImportNotice(null);
    }
  };

  const handleExportCSV = () => {
    const csv = exportToEdgeListCSV(networkData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'coauthorship_edges_petrsu_krc.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportGraphML = () => {
    const xml = exportToGraphML(networkData);
    const blob = new Blob([xml], { type: 'application/xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'coauthorship_network_petrsu_krc.graphml';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="app-wrapper">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        accept=".xlsx,.xls,.csv"
        className="hidden"
        style={{ display: 'none' }}
      />

      <div className="main-grid">
        {/* Left Column: Main Application Card */}
        <div className="glass-panel">
          {/* Header Banner */}
          <div className="header-banner">
            <div>
              <h1>
                {/* <span>🌐</span> */}
                <span>Анализ научных сетей авторов</span>
              </h1>
              <p>
                Сетевой анализ взаимодействия исследователей ПетрГУ и КарНЦ РАН через соавторство (2000–2026 гг.)
              </p>
            </div>

            <div className="flex items-center gap-2.5 flex-wrap">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="btn-primary"
                title="Загрузить Excel-файл (.xlsx) с публикациями"
              >
                {/* 📥 Загрузить Excel (.xlsx) */}
                Загрузить Excel (.xlsx)
              </button>
              {/* <button
                type="button"
                onClick={() => setIsModalOpen(true)}
                className="btn-secondary"
                title="Добавить публикацию вручную"
              >
                ➕ Добавить
              </button> */}
            </div>
          </div>

          {/* Import Notification Banner */}
          {importNotice && (
            <div
              className={`px-5 py-3 text-xs flex justify-between items-center border-b transition-all ${
                importNotice.type === 'success'
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : 'bg-rose-50 text-rose-800 border-rose-200'
              }`}
            >
              <span className="font-medium">
                {importNotice.type === 'success' ? '✅' : '⚠️'} {importNotice.msg}
              </span>
              <button
                type="button"
                onClick={() => setImportNotice(null)}
                className="font-bold opacity-70 hover:opacity-100 cursor-pointer ml-3"
              >
                &times;
              </button>
            </div>
          )}

          {/* Navigation Tabs */}
          <div className="tabs-navigation">
            <button
              type="button"
              onClick={() => setActiveTab('graph')}
              className={`nav-tab-button ${activeTab === 'graph' ? 'active' : ''}`}
            >
              {/* <span>🕸️</span> */}
              <span>Сетевой граф</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('matrix')}
              className={`nav-tab-button ${activeTab === 'matrix' ? 'active' : ''}`}
            >
              {/* <span>📊</span> */}
              <span>Матрица смежности</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('raw')}
              className={`nav-tab-button ${activeTab === 'raw' ? 'active' : ''}`}
            >
              {/* <span>📄</span> */}
              <span>Реестр публикаций ({filteredArticles.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('authors')}
              className={`nav-tab-button ${activeTab === 'authors' ? 'active' : ''}`}
            >
              {/* <span>👥</span> */}
              <span>Исследователи ({networkData.nodes.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('stats')}
              className={`nav-tab-button ${activeTab === 'stats' ? 'active' : ''}`}
            >
              {/* <span>📈</span> */}
              <span>Аналитика и статистика</span>
            </button>
          </div>

          {/* Filter Bar under Tabs */}
          <div className="bg-slate-50/90 border-b border-slate-200 px-5 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
            {/* Year Range Filter */}
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-700">Период:</span>
              <div className="flex items-center gap-1.5 bg-white border border-slate-300 rounded-lg px-2 py-1 shadow-xs">
                <input
                  type="number"
                  min="1980"
                  max="2030"
                  value={minYear}
                  onChange={(e) => setMinYear(Number(e.target.value))}
                  className="w-14 text-center font-semibold text-slate-800 outline-none"
                />
                <span className="text-slate-400">—</span>
                <input
                  type="number"
                  min="1980"
                  max="2030"
                  value={maxYear}
                  onChange={(e) => setMaxYear(Number(e.target.value))}
                  className="w-14 text-center font-semibold text-slate-800 outline-none"
                />
              </div>

              {/* Quick Period Badges */}
              <div className="hidden sm:flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => { setMinYear(2000); setMaxYear(2026); }}
                  className="px-2 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded text-[11px] font-medium transition cursor-pointer"
                >
                  Все годы
                </button>
                <button
                  type="button"
                  onClick={() => { setMinYear(2000); setMaxYear(2010); }}
                  className="px-2 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded text-[11px] font-medium transition cursor-pointer"
                >
                  2000–2010
                </button>
                <button
                  type="button"
                  onClick={() => { setMinYear(2021); setMaxYear(2026); }}
                  className="px-2 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded text-[11px] font-medium transition cursor-pointer"
                >
                  2021–2026
                </button>
                <button
                  type="button"
                  onClick={() => { setMinYear(2026); setMaxYear(2026); }}
                  className="px-2 py-1 bg-indigo-100 hover:bg-indigo-200 text-indigo-800 font-bold rounded text-[11px] transition cursor-pointer"
                >
                  2026 г.
                </button>
              </div>
            </div>

            {/* Organization filter & Search */}
            <div className="flex items-center gap-2.5 flex-wrap">
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-slate-700">Организация:</span>
                <select
                  value={orgFilter}
                  onChange={(e) => setOrgFilter(e.target.value)}
                  className="bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-xs text-slate-800 outline-none shadow-xs font-medium cursor-pointer"
                >
                  <option value="all">Все организации</option>
                  <option value="petrsu">ПетрГУ</option>
                  <option value="krc">КарНЦ РАН</option>
                </select>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-slate-700">Мин. связей:</span>
                <select
                  value={minWeight}
                  onChange={(e) => setMinWeight(Number(e.target.value))}
                  className="bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs text-slate-800 outline-none shadow-xs font-medium cursor-pointer"
                >
                  <option value={1}>1+ статья</option>
                  <option value={2}>2+ статьи</option>
                  <option value={3}>3+ статьи</option>
                  <option value={4}>4+ статьи</option>
                </select>
              </div>

              {/* Author Search Input */}
              <div className="relative">
                <input
                  type="text"
                  placeholder="🔍 Поиск исследователя..."
                  value={searchAuthor}
                  onChange={(e) => setSearchAuthor(e.target.value)}
                  className="bg-white border border-slate-300 rounded-lg pl-2.5 pr-6 py-1 text-xs w-44 text-slate-800 outline-none focus:ring-1 focus:ring-indigo-500 shadow-xs"
                />
                {searchAuthor && (
                  <button
                    onClick={() => setSearchAuthor('')}
                    className="absolute right-2 top-1 text-slate-400 hover:text-slate-700 font-bold text-xs"
                  >
                    &times;
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* TAB 1: Network Graph */}
          {activeTab === 'graph' && (
            <div>
              <NetworkGraph
                nodes={networkData.nodes}
                links={networkData.links}
                communities={networkData.communities}
                selectedAuthorId={selectedAuthorId}
                onSelectAuthor={setSelectedAuthorId}
                showLabels={showLabels}
                colorByCommunity={colorByCommunity}
                simulationTrigger={simulationTrigger}
              />
            </div>
          )}

          {/* TAB 2: Adjacency Matrix */}
          {activeTab === 'matrix' && (
            <MatrixViewer articles={filteredArticles} nodes={networkData.nodes} />
          )}

          {/* TAB 3: Publication Catalogue (Matching Excel format from image.png) */}
          {activeTab === 'raw' && (
            <div className="p-6 space-y-4">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Реестр публикаций ({filteredArticles.length})
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Отображение в формате учетной таблицы ПетрГУ и КарНЦ РАН (Год, Библиографическое описание, Авторы)
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="btn-primary"
                  >
                    {/* 📥 Загрузить другой .xlsx */}
                    Загрузить другой .xlsx
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto max-h-[520px] border border-slate-200 rounded-xl shadow-inner bg-white">
                <table className="w-full text-xs text-left border-collapse">
                  <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0 border-b border-slate-200 shadow-xs">
                    <tr>
                      <th className="p-3 w-12 text-center border-r border-slate-200">№</th>
                      <th className="p-3 w-20 text-center border-r border-slate-200">Год</th>
                      <th className="p-3 border-r border-slate-200">Библиографическое описание статьи / издания</th>
                      <th className="p-3 w-64 border-r border-slate-200">Выявленные соавторы</th>
                      <th className="p-3 w-36 text-center">Организация</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredArticles.map((art, idx) => (
                      <tr key={art.id} className="hover:bg-slate-50/80 transition">
                        <td className="p-3 text-center text-slate-400 font-mono border-r border-slate-100 font-medium">
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
                            {art.authors.map((auth) => (
                              <button
                                key={auth}
                                type="button"
                                onClick={() => {
                                  setSelectedAuthorId(auth);
                                  setActiveTab('graph');
                                }}
                                className="px-1.5 py-0.5 bg-slate-100 hover:bg-indigo-100 text-slate-700 hover:text-indigo-800 rounded text-[11px] font-medium transition cursor-pointer"
                              >
                                {auth}
                              </button>
                            ))}
                          </div>
                        </td>
                        <td className="p-3 text-center">
                          <span
                            className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                              (art.organization || '').includes('КарНЦ')
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-indigo-100 text-indigo-800'
                            }`}
                          >
                            {art.organization || 'ПетрГУ'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 4: Authors Directory & Ranking */}
          {activeTab === 'authors' && (
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Уникальные исследователи сети ({networkData.nodes.length})
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Ранжирование по числу соавторов (степени вершины) и центральности по посредничеству
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto max-h-[520px] border border-slate-200 rounded-xl shadow-inner bg-white">
                <table className="w-full text-xs text-left border-collapse">
                  <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0 border-b border-slate-200">
                    <tr>
                      <th className="p-3 w-12 text-center border-r border-slate-200">№</th>
                      <th className="p-3 border-r border-slate-200">Исследователь (Автор)</th>
                      <th className="p-3 text-center border-r border-slate-200">Публикаций</th>
                      <th className="p-3 text-center border-r border-slate-200">Соавторов (Degree)</th>
                      <th className="p-3 text-center border-r border-slate-200">Центральность (Betweenness)</th>
                      <th className="p-3 text-center border-r border-slate-200">Научная школа</th>
                      <th className="p-3 text-right">Действие</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {[...networkData.nodes]
                      .sort((a, b) => b.connections - a.connections || b.publications - a.publications)
                      .map((author, index) => (
                        <tr
                          key={author.id}
                          className={`hover:bg-indigo-50/40 transition cursor-pointer ${
                            selectedAuthorId === author.id ? 'bg-indigo-50 font-bold' : ''
                          }`}
                          onClick={() => {
                            setSelectedAuthorId(author.id);
                            setActiveTab('graph');
                          }}
                        >
                          <td className="p-3 text-center text-slate-400 font-mono border-r border-slate-100">
                            {index + 1}
                          </td>
                          <td className="p-3 font-semibold text-slate-900 border-r border-slate-100 flex items-center gap-2">
                            <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-[10px] font-bold">
                              {author.label.charAt(0)}
                            </span>
                            <span>{author.label}</span>
                          </td>
                          <td className="p-3 text-center font-semibold text-slate-700 border-r border-slate-100">
                            {author.publications}
                          </td>
                          <td className="p-3 text-center font-bold text-indigo-700 border-r border-slate-100">
                            {author.connections}
                          </td>
                          <td className="p-3 text-center font-mono text-slate-600 border-r border-slate-100 font-medium">
                            {author.centrality.toFixed(3)}
                          </td>
                          <td className="p-3 text-center border-r border-slate-100">
                            <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-700">
                              Школа {(author.communityId ?? 0) + 1}
                            </span>
                          </td>
                          <td className="p-3 text-right">
                            <button
                              type="button"
                              className="text-indigo-600 hover:text-indigo-900 font-bold text-[11px] hover:underline cursor-pointer"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedAuthorId(author.id);
                                setActiveTab('graph');
                              }}
                            >
                              В граф →
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 5: Statistics & Analytics */}
          {activeTab === 'stats' && (
            <div className="p-6 space-y-6">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Сетевые метрики и топология научного сотрудничества
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Аналитические показатели по корпусу публикаций ПетрГУ и КарНЦ РАН за 2000–2026 гг.
                </p>
              </div>

              {/* 4 Cards Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4 text-center shadow-xs">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Публикаций</span>
                  <div className="text-2xl font-black text-slate-900 mt-1">{stats.totalPubs}</div>
                  <span className="text-[10px] text-slate-400">за период {minYear}–{maxYear}</span>
                </div>
                <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4 text-center shadow-xs">
                  <span className="text-[11px] font-bold text-indigo-400 uppercase tracking-wider">Исследователей</span>
                  <div className="text-2xl font-black text-indigo-600 mt-1">{stats.totalAuthors}</div>
                  <span className="text-[10px] text-indigo-400">вершин в графе</span>
                </div>
                <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4 text-center shadow-xs">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Связей соавторства</span>
                  <div className="text-2xl font-black text-slate-900 mt-1">{stats.totalEdges}</div>
                  <span className="text-[10px] text-slate-400">рёбер в графе</span>
                </div>
                <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4 text-center shadow-xs">
                  <span className="text-[11px] font-bold text-amber-500 uppercase tracking-wider">Изолированных</span>
                  <div className="text-2xl font-black text-amber-600 mt-1">{stats.isolatedCount}</div>
                  <span className="text-[10px] text-amber-500">без соавторов</span>
                </div>
              </div>

              {/* 3 Detail Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
                  <span className="text-xs text-slate-500 font-medium">Среднее число статей на пару соавторов:</span>
                  <div className="text-xl font-bold text-slate-900 mt-1">{stats.avgWeight}</div>
                  <span className="text-[11px] text-slate-400">сила типовой связи</span>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
                  <span className="text-xs text-slate-500 font-medium">Максимум совместных трудов у пары:</span>
                  <div className="text-xl font-bold text-slate-900 mt-1">{stats.maxWeight}</div>
                  <span className="text-[11px] text-slate-400">наиболее тесное соавторство</span>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
                  <span className="text-xs text-slate-500 font-medium">Плотность сети (Network Density):</span>
                  <div className="text-xl font-bold text-indigo-600 mt-1 font-mono">{stats.density}</div>
                  <span className="text-[11px] text-slate-400">степень связности графа</span>
                </div>
              </div>

              {/* Degree Leaders */}
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">
                  Топ-10 исследователей по широте связей (Степень вершины / Degree)
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {stats.topByDegree.map((item, idx) => (
                    <div
                      key={item.id}
                      onClick={() => {
                        setSelectedAuthorId(item.id);
                        setActiveTab('graph');
                      }}
                      className="flex items-center justify-between bg-slate-50 hover:bg-indigo-50 border border-slate-200 px-3.5 py-2 rounded-lg text-xs cursor-pointer transition"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-indigo-600 text-[11px] w-5">{idx + 1}.</span>
                        <span className="font-medium text-slate-800">{item.label}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-slate-500">{item.publications} публ.</span>
                        <span className="bg-indigo-100 text-indigo-800 font-bold px-2 py-0.5 rounded text-[11px]">
                          {item.connections} соавт.
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Sidebar */}
        <div className="sidebar-column">
          {/* Network Quick Stats */}
          <div className="side-panel">
            <h3>
              {/* <span>📊 Показатели сети</span> */}
              <span>Показатели сети</span>
              <span className="text-[11px] font-normal text-slate-400">{filteredArticles.length} статей</span>
            </h3>
            <div className="stat-row">
              <span className="text-slate-600">Авторов в сети:</span>
              <span className="stat-num">{networkData.nodes.length}</span>
            </div>
            <div className="stat-row">
              <span className="text-slate-600">Связей соавторства:</span>
              <span className="stat-num">{networkData.links.length}</span>
            </div>
            <div className="stat-row">
              <span className="text-slate-600">Плотность сети:</span>
              <span className="stat-num font-mono">{stats.density}</span>
            </div>
            <div className="stat-row">
              <span className="text-slate-600">Средн. сила связи:</span>
              <span className="stat-num">{stats.avgWeight}</span>
            </div>
            <div className="stat-row">
              <span className="text-slate-600">Научных сообществ:</span>
              <span className="stat-num">{networkData.communities.length}</span>
            </div>
          </div>

          {/* Selected Author Details Card */}
          <div className="side-panel">
            <h3>
              {/* <span>👤 Автор</span> */}
              <span>Автор</span>
              {selectedAuthorId && (
                <button
                  type="button"
                  onClick={() => setSelectedAuthorId(null)}
                  className="text-[11px] font-semibold text-rose-500 hover:text-rose-700 cursor-pointer"
                >
                  Снять выбор ✕
                </button>
              )}
            </h3>

            {selectedAuthorInfo ? (
              <div className="space-y-3.5">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-full bg-gradient-to-tr from-[#667eea] to-[#764ba2] text-white flex items-center justify-center font-bold text-base shadow-sm">
                    {selectedAuthorInfo.node.label.charAt(0)}
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900 text-sm leading-tight">
                      {selectedAuthorInfo.node.label}
                    </h4>
                    <span className="inline-block mt-0.5 px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 text-indigo-700">
                      Школа {(selectedAuthorInfo.node.communityId ?? 0) + 1}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-1.5 text-center bg-slate-50 rounded-xl p-2 border border-slate-100">
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-bold">Публикаций</span>
                    <div className="text-sm font-bold text-slate-800">{selectedAuthorInfo.node.publications}</div>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-bold">Соавторов</span>
                    <div className="text-sm font-bold text-indigo-600">{selectedAuthorInfo.node.connections}</div>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-bold">Центр-ть</span>
                    <div className="text-sm font-bold text-slate-800 font-mono">
                      {selectedAuthorInfo.node.centrality.toFixed(3)}
                    </div>
                  </div>
                </div>

                {/* Collaborators list */}
                {selectedAuthorInfo.collaborators.length > 0 && (
                  <div>
                    <span className="text-[11px] font-bold text-slate-600 block mb-1.5">
                      Соавторы ({selectedAuthorInfo.collaborators.length}):
                    </span>
                    <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto pr-1">
                      {selectedAuthorInfo.collaborators.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setSelectedAuthorId(c)}
                          className="px-2 py-0.5 bg-slate-100 hover:bg-indigo-100 text-slate-700 hover:text-indigo-800 rounded text-[11px] font-medium transition cursor-pointer"
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Publications list */}
                {selectedAuthorInfo.articles.length > 0 && (
                  <div>
                    <span className="text-[11px] font-bold text-slate-600 block mb-1">
                      Статьи исследователя:
                    </span>
                    <ul className="text-[11px] text-slate-600 space-y-1.5 max-h-32 overflow-y-auto pr-1 list-disc list-inside">
                      {selectedAuthorInfo.articles.map((art) => (
                        <li key={art.id} className="leading-snug">
                          <strong>{art.year}:</strong> {art.title}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <div className="py-6 text-center text-slate-400 text-xs">
                {/* <span>👈 Кликните на узел в графе, чтобы открыть досье исследователя и его соавторов</span> */}
                <span>Кликните на узел в графе, чтобы открыть досье исследователя и его соавторов</span>
              </div>
            )}
          </div>

          {/* Scientific Schools / Communities */}
          <div className="side-panel">
            <h3>
              {/* <span>🔗 Научные школы</span> */}
              <span>Научные школы</span>
              <button
                type="button"
                onClick={() => setColorByCommunity(!colorByCommunity)}
                className={`text-[11px] px-2 py-0.5 rounded font-medium transition cursor-pointer ${
                  colorByCommunity ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {colorByCommunity ? 'Цвета ВКЛ' : 'Подкрасить'}
              </button>
            </h3>

            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {networkData.communities.map((comm) => (
                <div
                  key={comm.id}
                  onClick={() => {
                    if (comm.members.length > 0) {
                      setSelectedAuthorId(comm.members[0]);
                    }
                  }}
                  className="p-2.5 rounded-xl border border-slate-200/80 bg-slate-50 hover:bg-indigo-50 transition cursor-pointer"
                  style={{ borderLeftColor: comm.color, borderLeftWidth: 4 }}
                >
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-bold text-slate-800 text-xs" style={{ color: comm.color }}>
                      Школа {comm.id + 1}
                    </span>
                    <span className="text-[10px] bg-slate-200 text-slate-700 px-1.5 py-0.2 rounded font-bold">
                      {comm.size} авт.
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 truncate">
                    {comm.members.join(', ')}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Export & Controls
          <div className="side-panel">
            <h3>
              <span>💾 Экспорт для ВКР</span>
            </h3>
            <div className="space-y-2">
              <button
                type="button"
                onClick={handleExportCSV}
                className="btn-secondary w-full justify-between"
              >
                <span>Таблица связей (.csv)</span>
                <span>📄</span>
              </button>
              <button
                type="button"
                onClick={handleExportGraphML}
                className="btn-secondary w-full justify-between"
              >
                <span>Граф в GraphML (.xml для Gephi)</span>
                <span>🌐</span>
              </button>
              <button
                type="button"
                onClick={handleResetToDefault}
                className="text-[11px] text-slate-400 hover:text-slate-600 transition pt-2 block text-center w-full cursor-pointer"
              >
                Сброс к исходному набору статей
              </button>
            </div>
          </div> */}
        </div>
      </div>

      {/* Add Article Modal */}
      <ArticleModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onAddArticle={handleAddArticle}
      />
    </div>
  );
};

export default App;
