import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Article, GraphNode } from './types';
import { INITIAL_ARTICLES, buildNetwork, exportToGraphML, exportToEdgeListCSV } from './utils/networkAnalysis';
import { parseExcelFile, ParseResult } from './utils/excelParser';
import { NetworkGraph } from './components/NetworkGraph';
import { ArticleModal } from './components/ArticleModal';
import { MatrixViewer } from './components/MatrixViewer';
import { ArticlesList } from './components/ArticlesList';
import {
  exportAdjacencyMatrixXLSX,
  exportResearchersXLSX,
  exportEdgesXLSX,
  exportStatsXLSX,
  exportPublicationsXLSX,
  exportFullMasterReportXLSX,
  exportImportTemplateWithFormulasXLSX,
  exportExplanatoryNoteTXT,
} from './utils/exporter';
import {
  Share2,
  Grid,
  FileText,
  Users,
  BarChart3,
  Calendar,
  Building,
  Filter,
  Search,
  Upload,
  Download,
  Plus,
  RefreshCw,
  Award,
  Layers,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
} from 'lucide-react';

const STORAGE_KEY = 'scientific_network_articles_v5';

export const App: React.FC = () => {
  const [articles, setArticles] = useState<Article[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // Fallback to initial sample
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

  // Filters state
  const [minYear, setMinYear] = useState<number>(2000);
  const [maxYear, setMaxYear] = useState<number>(2026);
  const [minWeight, setMinWeight] = useState<number>(1);
  const [orgFilter, setOrgFilter] = useState<string>('all');
  const [searchAuthor, setSearchAuthor] = useState<string>('');
  const [authorsTableSearch, setAuthorsTableSearch] = useState<string>('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Persistence
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(articles));
    } catch {
      // ignore
    }
  }, [articles]);

  // Filtered articles based on year and organization
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

  // Construct network graph data
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

  // Selected Author dossier details
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

  // Analytics & Statistics
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

    const topByBetweenness = [...networkData.nodes]
      .sort((a, b) => b.centrality - a.centrality || b.connections - a.connections)
      .slice(0, 10);

    // Publication dynamics by 5-year periods
    const periods = [
      { label: '2000–2005', count: 0 },
      { label: '2006–2010', count: 0 },
      { label: '2011–2015', count: 0 },
      { label: '2016–2020', count: 0 },
      { label: '2021–2026', count: 0 },
    ];
    filteredArticles.forEach((a) => {
      if (a.year >= 2000 && a.year <= 2005) periods[0].count++;
      else if (a.year >= 2006 && a.year <= 2010) periods[1].count++;
      else if (a.year >= 2011 && a.year <= 2015) periods[2].count++;
      else if (a.year >= 2016 && a.year <= 2020) periods[3].count++;
      else if (a.year >= 2021 && a.year <= 2026) periods[4].count++;
    });

    return {
      totalPubs,
      totalAuthors,
      totalEdges,
      isolatedCount,
      avgWeight: avgWeight.toFixed(2),
      maxWeight,
      density: density.toFixed(4),
      topByDegree,
      topByBetweenness,
      periods,
    };
  }, [filteredArticles, networkData]);

  // Excel file upload handler
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
            ? 'матрица инцидентности'
            : 'табличный список';

        const formulaText = result.hasFormulas ? ' — формулы Excel успешно вычислены' : '';

        setImportNotice({
          msg: `Успешно импортировано ${result.articles.length} публикаций из "${file.name}" (${formatDesc}${formulaText}). Граф и метрики SNA обновлены.`,
          type: 'success',
        });
        setTimeout(() => setImportNotice(null), 7000);
      } else {
        setImportNotice({
          msg: 'В файле не найдено строк с публикациями. Проверьте структуру колонок.',
          type: 'error',
        });
      }
    } catch {
      setImportNotice({
        msg: 'Не удалось прочитать Excel-файл. Убедитесь, что файл имеет расширение .xlsx.',
        type: 'error',
      });
    }

    if (e.target) e.target.value = '';
  };

  // Add article manually
  const handleAddArticle = (title: string, authors: string[], year: number, organization = 'ПетрГУ') => {
    const newArt: Article = {
      id: `art_${Date.now()}`,
      title,
      authors,
      year,
      organization,
    };
    setArticles((prev) => [newArt, ...prev]);
    setSimulationTrigger((t) => t + 1);
    setImportNotice({
      msg: `Публикация «${title.substring(0, 45)}...» добавлена в сеть соавторства.`,
      type: 'success',
    });
    setTimeout(() => setImportNotice(null), 5000);
  };

  // Delete article
  const handleDeleteArticle = (id: string) => {
    setArticles((prev) => prev.filter((a) => a.id !== id));
    setSimulationTrigger((t) => t + 1);
  };

  // Reset to sample initial articles
  const handleResetToDefault = () => {
    if (window.confirm('Сбросить текущий корпус к исходному набору публикаций ПетрГУ и КарНЦ РАН?')) {
      setArticles(INITIAL_ARTICLES);
      setSelectedAuthorId(null);
      setMinYear(2000);
      setMaxYear(2026);
      setMinWeight(1);
      setOrgFilter('all');
      setSearchAuthor('');
      setSimulationTrigger((t) => t + 1);
      setImportNotice({
        msg: 'Данные сброшены к исходному демонстрационному корпусу.',
        type: 'success',
      });
      setTimeout(() => setImportNotice(null), 4000);
    }
  };

  // Reset filters
  const isFiltered = minYear !== 2000 || maxYear !== 2026 || minWeight !== 1 || orgFilter !== 'all' || searchAuthor.trim() !== '';
  const handleResetFilters = () => {
    setMinYear(2000);
    setMaxYear(2026);
    setMinWeight(1);
    setOrgFilter('all');
    setSearchAuthor('');
  };

  // Export handlers
  const handleExportGraphML = () => {
    const xml = exportToGraphML(networkData);
    const blob = new Blob([xml], { type: 'application/xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'граф_соавторства.graphml';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportCSV = () => {
    const csv = exportToEdgeListCSV(networkData);
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'таблица_связей_соавторства.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="py-6 px-4 md:px-8">
      <div className="app-wrapper space-y-5">
        {/* Hidden File Input for Excel Import */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileUpload}
          accept=".xlsx,.xls"
          style={{ display: 'none' }}
        />

        {/* Top Header Banner */}
        <div className="glass-panel">
          <div className="header-banner">
            <div>
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-white/15 backdrop-blur-md flex items-center justify-center text-white border border-white/20 shadow-inner">
                  <Share2 className="w-5 h-5 text-indigo-100" />
                </div>
                <div>
                  <h1 className="text-xl md:text-2xl font-extrabold tracking-tight text-white flex items-center gap-2">
                    Сетевой анализ научных связей авторов
                  </h1>
                  <p className="text-xs md:text-sm text-indigo-100 font-medium opacity-90">
                    Исследование соавторства и научных школ ПетрГУ и КарНЦ РАН (2000–2026 гг.)
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2.5 flex-wrap">
              <button
                type="button"
                onClick={() => setIsModalOpen(true)}
                className="px-3.5 py-2 bg-white/20 hover:bg-white/30 text-white rounded-xl text-xs font-semibold backdrop-blur-md border border-white/30 flex items-center gap-1.5 transition cursor-pointer shadow-xs"
              >
                <Plus className="w-4 h-4" />
                <span>Добавить публикацию</span>
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-3.5 py-2 bg-white text-indigo-900 hover:bg-indigo-50 rounded-xl text-xs font-bold shadow-md flex items-center gap-1.5 transition cursor-pointer"
                title="Загрузить Excel-файл (.xlsx) с публикациями. Поддерживаются файлы с формулами!"
              >
                <Upload className="w-4 h-4 text-indigo-600" />
                <span>Загрузить Excel (.xlsx)</span>
              </button>

              <button
                type="button"
                onClick={() => exportResearchersXLSX(networkData.nodes, networkData.links, networkData.communities, filteredArticles)}
                className="px-3.5 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold shadow-md flex items-center gap-1.5 transition cursor-pointer"
                title="Скачать расчеты по исследователям в Excel с живыми формулами: SUM, AVERAGE, MAX, MIN, RANK, Degree Centrality"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-100" />
                <span>Расчеты для научрука (.xlsx с формулами)</span>
              </button>

              <button
                type="button"
                onClick={() => exportExplanatoryNoteTXT(networkData.nodes, networkData.links, networkData.communities, filteredArticles, stats)}
                className="px-3.5 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold shadow-md flex items-center gap-1.5 transition cursor-pointer"
                title="Скачать подробную пояснительную записку с расшифровкой числовых характеристик и формул (.txt)"
              >
                <FileText className="w-4 h-4 text-amber-100" />
                <span>Пояснительная записка (.txt)</span>
              </button>

              <button
                type="button"
                onClick={() => exportFullMasterReportXLSX(networkData, filteredArticles, stats)}
                className="px-3 py-2 bg-white/15 hover:bg-white/25 text-white rounded-xl text-xs font-semibold backdrop-blur-md border border-white/30 flex items-center gap-1.5 transition cursor-pointer"
                title="Скачать полный мастер-отчет со всеми расчетами и формулами на всех листах"
              >
                <Download className="w-4 h-4 text-indigo-200" />
                <span>Мастер-отчет (.xlsx)</span>
              </button>

              <button
                type="button"
                onClick={() => exportImportTemplateWithFormulasXLSX()}
                className="px-3 py-2 bg-indigo-950/40 hover:bg-indigo-950/60 text-indigo-200 rounded-xl text-xs font-medium border border-indigo-400/30 flex items-center gap-1.5 transition cursor-pointer"
                title="Скачать готовый шаблон Excel с автоматическими формулами для последующего импорта"
              >
                <FileSpreadsheet className="w-4 h-4 text-indigo-300" />
                <span>Шаблон с формулами (.xlsx)</span>
              </button>
            </div>
          </div>

          {/* Flash Notification Banner */}
          {importNotice && (
            <div
              className={`px-5 py-2.5 text-xs font-semibold flex items-center justify-between transition-all ${
                importNotice.type === 'success'
                  ? 'bg-emerald-50 text-emerald-900 border-b border-emerald-200'
                  : 'bg-rose-50 text-rose-900 border-b border-rose-200'
              }`}
            >
              <div className="flex items-center gap-2">
                {importNotice.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                )}
                <span>{importNotice.msg}</span>
              </div>
              <button
                type="button"
                onClick={() => setImportNotice(null)}
                className="text-slate-400 hover:text-slate-700 font-bold ml-4 text-sm"
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
              <Share2 className="w-4 h-4 text-indigo-600" />
              <span>Сетевой граф</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('matrix')}
              className={`nav-tab-button ${activeTab === 'matrix' ? 'active' : ''}`}
            >
              <Grid className="w-4 h-4 text-indigo-600" />
              <span>Матрица смежности</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('raw')}
              className={`nav-tab-button ${activeTab === 'raw' ? 'active' : ''}`}
            >
              <FileText className="w-4 h-4 text-indigo-600" />
              <span>Реестр публикаций ({filteredArticles.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('authors')}
              className={`nav-tab-button ${activeTab === 'authors' ? 'active' : ''}`}
            >
              <Users className="w-4 h-4 text-indigo-600" />
              <span>Исследователи ({networkData.nodes.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('stats')}
              className={`nav-tab-button ${activeTab === 'stats' ? 'active' : ''}`}
            >
              <BarChart3 className="w-4 h-4 text-indigo-600" />
              <span>Аналитика и статистика</span>
            </button>
          </div>

          {/* ELEGANT, CLEAN, NON-OVERLAPPING FILTER BAR */}
          <div className="bg-slate-50 border-b border-slate-200 px-5 py-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-3">
              {/* Left Group: Period Filter with Quick Preset Buttons */}
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-1.5 font-semibold text-slate-700">
                  <Calendar className="w-4 h-4 text-indigo-600" />
                  <span>Период:</span>
                </div>

                {/* Number Inputs: from / to */}
                <div className="flex items-center gap-1 bg-white border border-slate-300 rounded-lg px-2 py-1 shadow-2xs">
                  <span className="text-[11px] text-slate-400">с</span>
                  <input
                    type="number"
                    min="1980"
                    max="2030"
                    value={minYear}
                    onChange={(e) => setMinYear(Number(e.target.value))}
                    className="w-13 text-center font-bold text-slate-800 outline-none text-xs"
                  />
                  <span className="text-slate-300">—</span>
                  <span className="text-[11px] text-slate-400">по</span>
                  <input
                    type="number"
                    min="1980"
                    max="2030"
                    value={maxYear}
                    onChange={(e) => setMaxYear(Number(e.target.value))}
                    className="w-13 text-center font-bold text-slate-800 outline-none text-xs"
                  />
                </div>

                {/* Quick Period Buttons Group (Styled with clear borders & active states) */}
                <div className="flex items-center gap-1 bg-slate-200/80 p-0.5 rounded-lg border border-slate-300">
                  <button
                    type="button"
                    onClick={() => {
                      setMinYear(2000);
                      setMaxYear(2026);
                    }}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition cursor-pointer ${
                      minYear === 2000 && maxYear === 2026
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'text-slate-700 hover:text-indigo-700 hover:bg-slate-100'
                    }`}
                  >
                    Все годы
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMinYear(2000);
                      setMaxYear(2010);
                    }}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition cursor-pointer ${
                      minYear === 2000 && maxYear === 2010
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'text-slate-700 hover:text-indigo-700 hover:bg-slate-100'
                    }`}
                  >
                    2000–2010
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMinYear(2011);
                      setMaxYear(2020);
                    }}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition cursor-pointer ${
                      minYear === 2011 && maxYear === 2020
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'text-slate-700 hover:text-indigo-700 hover:bg-slate-100'
                    }`}
                  >
                    2011–2020
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMinYear(2021);
                      setMaxYear(2026);
                    }}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition cursor-pointer ${
                      minYear === 2021 && maxYear === 2026
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'text-slate-700 hover:text-indigo-700 hover:bg-slate-100'
                    }`}
                  >
                    2021–2026
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMinYear(2026);
                      setMaxYear(2026);
                    }}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition cursor-pointer ${
                      minYear === 2026 && maxYear === 2026
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'text-slate-700 hover:text-indigo-700 hover:bg-slate-100'
                    }`}
                  >
                    2026 г.
                  </button>
                </div>
              </div>

              {/* Right Group: Organization & Min Connections & Search */}
              <div className="flex items-center gap-3 flex-wrap">
                {/* Organization selector */}
                <div className="flex items-center gap-1.5">
                  <Building className="w-4 h-4 text-slate-500" />
                  <span className="font-semibold text-slate-700">Организация:</span>
                  <select
                    value={orgFilter}
                    onChange={(e) => setOrgFilter(e.target.value)}
                    className="bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-xs text-slate-800 outline-none shadow-2xs font-semibold cursor-pointer"
                  >
                    <option value="all">Все организации</option>
                    <option value="petrsu">ПетрГУ</option>
                    <option value="krc">КарНЦ РАН</option>
                  </select>
                </div>

                {/* Minimum connections selector */}
                <div className="flex items-center gap-1.5">
                  <Filter className="w-4 h-4 text-slate-500" />
                  <span className="font-semibold text-slate-700">Мин. связей:</span>
                  <select
                    value={minWeight}
                    onChange={(e) => setMinWeight(Number(e.target.value))}
                    className="bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-xs text-slate-800 outline-none shadow-2xs font-semibold cursor-pointer"
                  >
                    <option value={1}>1+ статья</option>
                    <option value={2}>2+ статьи</option>
                    <option value={3}>3+ статьи</option>
                    <option value={4}>4+ статьи</option>
                  </select>
                </div>

                {/* Author Search Field */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
                  <input
                    type="text"
                    placeholder="Поиск исследователя..."
                    value={searchAuthor}
                    onChange={(e) => setSearchAuthor(e.target.value)}
                    className="bg-white border border-slate-300 rounded-lg pl-8 pr-7 py-1 text-xs w-48 text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs font-medium"
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

                {/* Reset Filters button if any are active */}
                {isFiltered && (
                  <button
                    type="button"
                    onClick={handleResetFilters}
                    className="text-xs font-semibold text-rose-600 hover:text-rose-800 flex items-center gap-1 cursor-pointer bg-rose-50 px-2 py-1 rounded-lg border border-rose-200"
                    title="Сбросить все фильтры"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Сбросить</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* MAIN TAB CONTENT */}
          <div className="min-h-[580px]">
            {/* TAB 1: Network Graph */}
            {activeTab === 'graph' && (
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
            )}

            {/* TAB 2: Adjacency Matrix */}
            {activeTab === 'matrix' && (
              <MatrixViewer articles={filteredArticles} nodes={networkData.nodes} />
            )}

            {/* TAB 3: Publications Registry */}
            {activeTab === 'raw' && (
              <ArticlesList
                articles={filteredArticles}
                selectedAuthorId={selectedAuthorId}
                onSelectAuthor={(auth) => {
                  setSelectedAuthorId(auth);
                  if (auth) setActiveTab('graph');
                }}
                onDeleteArticle={handleDeleteArticle}
                onOpenAddModal={() => setIsModalOpen(true)}
                onUploadExcelClick={() => fileInputRef.current?.click()}
              />
            )}

            {/* TAB 4: Authors Directory & Centrality Rankings */}
            {activeTab === 'authors' && (
              <div className="p-6 space-y-4">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-2 border-b border-slate-200">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                      <Users className="w-5 h-5 text-indigo-600" />
                      <span>Исследователи сети ({networkData.nodes.length})</span>
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Числовые характеристики из сетевого анализа: степени вершин, посредничество (Betweenness), близость (Closeness) и кластеризация
                    </p>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => exportResearchersXLSX(networkData.nodes, networkData.links, networkData.communities, filteredArticles)}
                      className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 transition cursor-pointer shadow-xs"
                      title="Скачать числовые характеристики исследователей из сетевого анализа с живыми формулами (для научного руководителя)"
                    >
                      <FileSpreadsheet className="w-4 h-4 text-emerald-100" />
                      <span>Расчеты для научрука (.xlsx)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => exportExplanatoryNoteTXT(networkData.nodes, networkData.links, networkData.communities, filteredArticles, stats)}
                      className="px-3.5 py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 transition cursor-pointer shadow-xs"
                      title="Скачать пояснительную записку с описанием значений и формул (.txt)"
                    >
                      <FileText className="w-4 h-4 text-amber-100" />
                      <span>Пояснительная записка (.txt)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => exportFullMasterReportXLSX(networkData, filteredArticles, stats)}
                      className="px-3 py-2 bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition cursor-pointer"
                      title="Скачать единый мастер-отчет со всеми листами (исследователи, связи, матрица, реестр)"
                    >
                      <Download className="w-3.5 h-3.5 text-slate-600" />
                      <span>Мастер-отчет (.xlsx)</span>
                    </button>
                  </div>
                </div>

                {/* Search input for authors table */}
                <div className="w-full sm:w-80 relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={authorsTableSearch}
                    onChange={(e) => setAuthorsTableSearch(e.target.value)}
                    placeholder="Поиск исследователя по имени..."
                    className="w-full pl-9 pr-8 py-1.5 bg-white border border-slate-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs"
                  />
                  {authorsTableSearch && (
                    <button
                      onClick={() => setAuthorsTableSearch('')}
                      className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-700 text-xs font-bold"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Table */}
                <div className="overflow-x-auto max-h-[520px] border border-slate-200 rounded-xl shadow-inner bg-white">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0 z-10 border-b border-slate-200">
                      <tr>
                        <th className="p-3 w-12 text-center border-r border-slate-200">№</th>
                        <th className="p-3 border-r border-slate-200 min-w-[190px]">Исследователь (Автор)</th>
                        <th className="p-3 text-center border-r border-slate-200 w-28">Организация</th>
                        <th className="p-3 text-center border-r border-slate-200 w-20">Статей</th>
                        <th className="p-3 text-center border-r border-slate-200 w-28">Соавторов (Degree)</th>
                        <th className="p-3 text-center border-r border-slate-200 w-28">Сила связи (Strength)</th>
                        <th className="p-3 text-center border-r border-slate-200 w-32">Посредничество (Betweenness)</th>
                        <th className="p-3 text-center border-r border-slate-200 w-28">Близость (Closeness)</th>
                        <th className="p-3 text-center border-r border-slate-200 w-28">Кластеризация</th>
                        <th className="p-3 text-center border-r border-slate-200 w-28">Научная школа</th>
                        <th className="p-3 text-right w-24">Действие</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {[...networkData.nodes]
                        .filter((a) =>
                          !authorsTableSearch.trim() ||
                          a.label.toLowerCase().includes(authorsTableSearch.toLowerCase().trim())
                        )
                        .sort((a, b) => b.connections - a.connections || b.publications - a.publications)
                        .map((author, index) => (
                          <tr
                            key={author.id}
                            className={`hover:bg-indigo-50/50 transition cursor-pointer ${
                              selectedAuthorId === author.id ? 'bg-indigo-50 font-bold' : ''
                            }`}
                            onClick={() => {
                              setSelectedAuthorId(author.id);
                              setActiveTab('graph');
                            }}
                          >
                            <td className="p-3 text-center text-slate-400 font-mono border-r border-slate-100 font-medium">
                              {index + 1}
                            </td>
                            <td className="p-3 font-semibold text-slate-900 border-r border-slate-100 flex items-center gap-2">
                              <span className="w-7 h-7 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-600 text-white flex items-center justify-center text-[10.5px] font-bold shadow-2xs">
                                {author.label.charAt(0)}
                              </span>
                              <span>{author.label}</span>
                            </td>
                            <td className="p-3 text-center border-r border-slate-100">
                              <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                (author.organization || '').includes('КарНЦ')
                                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                  : 'bg-indigo-50 text-indigo-800 border border-indigo-200'
                              }`}>
                                {author.organization || 'ПетрГУ'}
                              </span>
                            </td>
                            <td className="p-3 text-center font-bold text-slate-700 border-r border-slate-100">
                              {author.publications}
                            </td>
                            <td className="p-3 text-center font-bold text-indigo-700 border-r border-slate-100">
                              <span className="bg-indigo-50 text-indigo-800 px-2.5 py-0.5 rounded-full">
                                {author.connections}
                              </span>
                            </td>
                            <td className="p-3 text-center font-bold text-purple-700 border-r border-slate-100">
                              {author.weightedDegree ?? author.connections}
                            </td>
                            <td className="p-3 text-center font-mono text-slate-700 border-r border-slate-100 font-semibold">
                              {author.centrality.toFixed(4)}
                            </td>
                            <td className="p-3 text-center font-mono text-slate-600 border-r border-slate-100">
                              {(author.closeness ?? 0).toFixed(4)}
                            </td>
                            <td className="p-3 text-center font-mono text-slate-600 border-r border-slate-100">
                              {(author.clusteringCoefficient ?? 0).toFixed(4)}
                            </td>
                            <td className="p-3 text-center border-r border-slate-100">
                              <span className="inline-block px-2.5 py-0.5 rounded-full text-[10.5px] font-semibold bg-slate-100 text-slate-700">
                                Школа {(author.communityId ?? 0) + 1}
                              </span>
                            </td>
                            <td className="p-3 text-right">
                              <button
                                type="button"
                                className="text-indigo-600 hover:text-indigo-900 font-bold text-xs flex items-center gap-1 justify-end ml-auto cursor-pointer"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedAuthorId(author.id);
                                  setActiveTab('graph');
                                }}
                              >
                                <span>В граф</span>
                                <ArrowRight className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB 5: Statistics & Analytics Dashboard */}
            {activeTab === 'stats' && (
              <div className="p-6 space-y-6">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-2 border-b border-slate-200">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                      <BarChart3 className="w-5 h-5 text-indigo-600" />
                      <span>Аналитика и метрики научного сотрудничества</span>
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Комплексный сетевой анализ структуры публикационной активности ПетрГУ и КарНЦ РАН
                    </p>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => exportStatsXLSX(stats, networkData)}
                      className="px-3.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-800 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition cursor-pointer"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Скачать отчет по статистике (.xlsx)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => exportFullMasterReportXLSX(networkData, filteredArticles, stats)}
                      className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 transition cursor-pointer shadow-xs"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Мастер-отчет (.xlsx)</span>
                    </button>
                  </div>
                </div>

                {/* 4 Primary KPI Metric Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-gradient-to-br from-indigo-50 to-white border border-indigo-100 rounded-xl p-4 shadow-xs">
                    <span className="text-[11px] font-bold text-indigo-600 uppercase tracking-wider block">
                      Всего публикаций
                    </span>
                    <div className="text-2xl font-black text-slate-900 mt-1">{stats.totalPubs}</div>
                    <span className="text-[11px] text-slate-500">учетных статей в выборке</span>
                  </div>

                  <div className="bg-gradient-to-br from-purple-50 to-white border border-purple-100 rounded-xl p-4 shadow-xs">
                    <span className="text-[11px] font-bold text-purple-600 uppercase tracking-wider block">
                      Исследователей в сети
                    </span>
                    <div className="text-2xl font-black text-slate-900 mt-1">{stats.totalAuthors}</div>
                    <span className="text-[11px] text-slate-500">уникальных авторов</span>
                  </div>

                  <div className="bg-gradient-to-br from-blue-50 to-white border border-blue-100 rounded-xl p-4 shadow-xs">
                    <span className="text-[11px] font-bold text-blue-600 uppercase tracking-wider block">
                      Связей соавторства
                    </span>
                    <div className="text-2xl font-black text-slate-900 mt-1">{stats.totalEdges}</div>
                    <span className="text-[11px] text-slate-500">пар сотрудничества</span>
                  </div>

                  <div className="bg-gradient-to-br from-emerald-50 to-white border border-emerald-100 rounded-xl p-4 shadow-xs">
                    <span className="text-[11px] font-bold text-emerald-600 uppercase tracking-wider block">
                      Научных сообществ
                    </span>
                    <div className="text-2xl font-black text-slate-900 mt-1">{networkData.communities.length}</div>
                    <span className="text-[11px] text-slate-500">кластеров (научных школ)</span>
                  </div>
                </div>

                {/* 4 Secondary Topological Metrics */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
                    <span className="text-xs text-slate-500 font-medium">Плотность сети (Density):</span>
                    <div className="text-xl font-bold text-indigo-700 mt-1 font-mono">{stats.density}</div>
                    <span className="text-[10.5px] text-slate-400">доля фактических связей к возможным</span>
                  </div>

                  <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
                    <span className="text-xs text-slate-500 font-medium">Средняя сила связи (статей/пару):</span>
                    <div className="text-xl font-bold text-slate-900 mt-1">{stats.avgWeight}</div>
                    <span className="text-[10.5px] text-slate-400">среднее число совместных публикаций</span>
                  </div>

                  <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
                    <span className="text-xs text-slate-500 font-medium">Максимум совместных трудов у пары:</span>
                    <div className="text-xl font-bold text-emerald-600 mt-1">{stats.maxWeight}</div>
                    <span className="text-[10.5px] text-slate-400">наиболее тесное соавторство</span>
                  </div>

                  <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
                    <span className="text-xs text-slate-500 font-medium">Изолированных авторов:</span>
                    <div className="text-xl font-bold text-slate-700 mt-1">{stats.isolatedCount}</div>
                    <span className="text-[10.5px] text-slate-400">без зарегистрированных соавторов</span>
                  </div>
                </div>

                {/* Two Column Layout: Top Degree vs Top Betweenness */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  {/* Degree Leaders */}
                  <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-3">
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center justify-between pb-2 border-b border-slate-100">
                      <span className="flex items-center gap-1.5">
                        <Award className="w-4 h-4 text-indigo-600" />
                        Топ-10 по числу соавторов (Степень вершины)
                      </span>
                    </h4>
                    <div className="space-y-2">
                      {stats.topByDegree.map((item, idx) => (
                        <div
                          key={item.id}
                          onClick={() => {
                            setSelectedAuthorId(item.id);
                            setActiveTab('graph');
                          }}
                          className="flex items-center justify-between bg-slate-50 hover:bg-indigo-50 border border-slate-200/80 px-3.5 py-2 rounded-lg text-xs cursor-pointer transition"
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-indigo-600 text-xs w-5">{idx + 1}.</span>
                            <span className="font-semibold text-slate-800">{item.label}</span>
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

                  {/* Betweenness Centrality Leaders */}
                  <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-3">
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center justify-between pb-2 border-b border-slate-100">
                      <span className="flex items-center gap-1.5">
                        <Layers className="w-4 h-4 text-purple-600" />
                        Топ-10 по центральности посредничества (Betweenness)
                      </span>
                    </h4>
                    <div className="space-y-2">
                      {stats.topByBetweenness.map((item, idx) => (
                        <div
                          key={item.id}
                          onClick={() => {
                            setSelectedAuthorId(item.id);
                            setActiveTab('graph');
                          }}
                          className="flex items-center justify-between bg-slate-50 hover:bg-purple-50 border border-slate-200/80 px-3.5 py-2 rounded-lg text-xs cursor-pointer transition"
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-purple-600 text-xs w-5">{idx + 1}.</span>
                            <span className="font-semibold text-slate-800">{item.label}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-purple-700 bg-purple-100 font-bold px-2 py-0.5 rounded text-[11px]">
                              {item.centrality.toFixed(4)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Dynamics by period */}
                <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-3">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider pb-2 border-b border-slate-100 flex items-center gap-1.5">
                    <Calendar className="w-4 h-4 text-indigo-600" />
                    <span>Динамика публикационной активности по периодам</span>
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-2">
                    {stats.periods.map((p) => (
                      <div key={p.label} className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
                        <span className="text-[11px] font-semibold text-slate-600 block">{p.label}</span>
                        <div className="text-xl font-black text-indigo-700 mt-1">{p.count}</div>
                        <span className="text-[10px] text-slate-400">публикаций</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* BOTTOM SECTION: Two-column Layout for Graph Tab or Global Sidebar */}
        <div className="main-grid">
          {/* Left panel: Quick explanation of academic rules */}
          <div className="glass-panel p-5 space-y-4">
            <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2 pb-2 border-b border-slate-100">
              <Award className="w-4 h-4 text-indigo-600" />
              <span>Методология и научные стандарты сетевого анализа</span>
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-slate-600 leading-relaxed">
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/80 space-y-1.5">
                <div className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-500" />
                  <span>Визуализация рёбер</span>
                </div>
                <p className="text-[11.5px]">
                  Строго фиксированная толщина (<strong>2.2px</strong>). Сила соавторства выражается исключительно последовательным цветовым градиентом от светло-голубого к глубокому тёмно-синему.
                </p>
              </div>

              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/80 space-y-1.5">
                <div className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-indigo-500" />
                  <span>Свойства матрицы A</span>
                </div>
                <p className="text-[11.5px]">
                  Матрица смежности формируется по формуле <strong>A = B · B<sup>T</sup> − diag</strong>. Главная диагональ строго равна нулю, петли исключены, симметрия доказана.
                </p>
              </div>

              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/80 space-y-1.5">
                <div className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-purple-500" />
                  <span>Научные школы</span>
                </div>
                <p className="text-[11.5px]">
                  Автоматическая кластеризация графа на независимые научные сообщества исследователей (научные школы) с возможностью раздельного анализа и подсветки.
                </p>
              </div>
            </div>
          </div>

          {/* Right Column: Author Dossier & Communities Sidebar */}
          <div className="sidebar-column">
            {/* Selected Author Details Card */}
            <div className="side-panel">
              <h3>
                <span className="flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-indigo-600" />
                  <span>Досье исследователя</span>
                </span>
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
                    <div className="w-11 h-11 rounded-full bg-gradient-to-tr from-indigo-600 to-purple-600 text-white flex items-center justify-center font-bold text-base shadow-sm">
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
                  <span>Кликните на исследователя в графе или таблице для просмотра соавторов и публикаций</span>
                </div>
              )}
            </div>

            {/* Scientific Schools / Communities */}
            <div className="side-panel">
              <h3>
                <span className="flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-indigo-600" />
                  <span>Научные школы</span>
                </span>
                <button
                  type="button"
                  onClick={() => setColorByCommunity(!colorByCommunity)}
                  className={`text-[11px] px-2.5 py-0.5 rounded-md font-semibold transition cursor-pointer ${
                    colorByCommunity ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {colorByCommunity ? 'Цвета Вкл' : 'Подкрасить'}
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
                      <span className="text-[10px] bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded font-bold">
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

            {/* Export & Controls for Diploma/Thesis */}
            <div className="side-panel">
              <h3>
                <span className="flex items-center gap-1.5">
                  <Download className="w-4 h-4 text-indigo-600" />
                  <span>Экспорт отчетов</span>
                </span>
              </h3>
              <div className="space-y-2 text-xs">
                <button
                  type="button"
                  onClick={() => exportResearchersXLSX(networkData.nodes, networkData.links, networkData.communities)}
                  className="w-full py-2 px-3 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg text-indigo-900 font-semibold flex items-center justify-between transition cursor-pointer shadow-xs"
                  title="3 листа: Метрики SNA, Формулы и методология, ТОП лидеры"
                >
                  <span className="flex items-center gap-1.5">
                    <FileSpreadsheet className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                    <span className="text-left leading-tight">Расчеты исследователей (для научрука)</span>
                  </span>
                  <span className="text-[10px] bg-indigo-200 text-indigo-800 px-1 py-0.5 rounded font-mono font-bold">.xlsx</span>
                </button>

                <button
                  type="button"
                  onClick={() => exportFullMasterReportXLSX(networkData, filteredArticles, stats)}
                  className="w-full py-1.5 px-3 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg text-emerald-900 font-medium flex items-center justify-between transition cursor-pointer"
                  title="5 листов: Исследователи, Ребра сети, Метрики топологии, Реестр статей, Глоссарий"
                >
                  <span className="flex items-center gap-1.5">
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>Мастер-отчет (.xlsx)</span>
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => exportAdjacencyMatrixXLSX(networkData.nodes, filteredArticles)}
                  className="w-full py-1.5 px-3 bg-slate-50 hover:bg-indigo-50 border border-slate-200 rounded-lg text-slate-700 font-medium flex items-center justify-between transition cursor-pointer"
                >
                  <span>Матрица смежности (.xlsx)</span>
                  <FileSpreadsheet className="w-3.5 h-3.5 text-slate-500" />
                </button>

                <button
                  type="button"
                  onClick={() => exportEdgesXLSX(networkData.links)}
                  className="w-full py-1.5 px-3 bg-slate-50 hover:bg-indigo-50 border border-slate-200 rounded-lg text-slate-700 font-medium flex items-center justify-between transition cursor-pointer"
                >
                  <span>Таблица связей (.xlsx)</span>
                  <FileSpreadsheet className="w-3.5 h-3.5 text-slate-500" />
                </button>

                <button
                  type="button"
                  onClick={handleExportGraphML}
                  className="w-full py-1.5 px-3 bg-slate-50 hover:bg-indigo-50 border border-slate-200 rounded-lg text-slate-700 font-medium flex items-center justify-between transition cursor-pointer"
                >
                  <span>Сеть в GraphML (для Gephi)</span>
                  <Share2 className="w-3.5 h-3.5 text-indigo-600" />
                </button>

                <button
                  type="button"
                  onClick={() => exportImportTemplateWithFormulasXLSX()}
                  className="w-full py-1.5 px-3 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-lg text-purple-900 font-medium flex items-center justify-between transition cursor-pointer"
                  title="Скачать готовый образец для заполнения публикаций и соавторов с автоматическими формулами Excel"
                >
                  <span className="flex items-center gap-1.5">
                    <FileSpreadsheet className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                    <span>Шаблон с формулами (.xlsx)</span>
                  </span>
                  <span className="text-[10px] bg-purple-200 text-purple-800 px-1 py-0.5 rounded font-mono font-bold">.xlsx</span>
                </button>

                <button
                  type="button"
                  onClick={handleResetToDefault}
                  className="text-[11px] text-slate-400 hover:text-slate-600 transition pt-2 block text-center w-full cursor-pointer hover:underline"
                >
                  Сброс к исходному набору статей
                </button>
              </div>
            </div>
          </div>
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
