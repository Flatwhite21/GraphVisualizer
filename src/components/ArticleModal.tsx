import React, { useState } from 'react';
import { PlusCircle, X, BookOpen, Users, Calendar, Building } from 'lucide-react';

interface ArticleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddArticle: (title: string, authors: string[], year: number, organization?: string) => void;
}

export const ArticleModal: React.FC<ArticleModalProps> = ({
  isOpen,
  onClose,
  onAddArticle,
}) => {
  const [title, setTitle] = useState('');
  const [authorsText, setAuthorsText] = useState('');
  const [year, setYear] = useState(2026);
  const [organization, setOrganization] = useState('ПетрГУ');
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Пожалуйста, укажите название публикации');
      return;
    }

    const parsedAuthors = authorsText
      .split(/[,;\n]/)
      .map((a) => a.trim())
      .filter((a) => a.length > 0);

    if (parsedAuthors.length === 0) {
      setError('Укажите хотя бы одного автора');
      return;
    }

    onAddArticle(
      title.trim(),
      parsedAuthors,
      Number(year) || 2026,
      organization.trim() || 'ПетрГУ'
    );
    setTitle('');
    setAuthorsText('');
    setYear(2026);
    setError('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200">
        <div className="bg-gradient-to-r from-indigo-700 via-indigo-600 to-purple-700 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PlusCircle className="w-5 h-5 text-indigo-200" />
            <h2 className="text-base font-bold">Добавить публикацию в корпус</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          {error && (
            <div className="bg-rose-50 text-rose-700 text-xs p-3 rounded-lg border border-rose-200">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5 text-indigo-600" />
              <span>Библиографическое описание / Название</span>
            </label>
            <textarea
              rows={2}
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Например: Методы цифровой гуманитаристики и сетевого анализа"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-indigo-600" />
              <span>Авторы публикации (через точку с запятой или запятую)</span>
            </label>
            <textarea
              rows={2}
              required
              value={authorsText}
              onChange={(e) => setAuthorsText(e.target.value)}
              placeholder="Иванов И. И.; Петров П. П.; Сидоров А. А."
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <p className="text-[11px] text-slate-400 mt-1">
              Разделители: «;» или «,». Лишние пробелы и дубликаты удаляются автоматически.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-indigo-600" />
                <span>Год издания</span>
              </label>
              <input
                type="number"
                min="1980"
                max="2030"
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                <Building className="w-3.5 h-3.5 text-indigo-600" />
                <span>Организация</span>
              </label>
              <select
                value={organization}
                onChange={(e) => setOrganization(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
              >
                <option value="ПетрГУ">ПетрГУ</option>
                <option value="КарНЦ РАН">КарНЦ РАН</option>
                <option value="СПбГУ">СПбГУ</option>
                <option value="МГУ">МГУ</option>
                <option value="Другая">Другая организация</option>
              </select>
            </div>
          </div>

          <div className="flex gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 px-4 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 font-medium transition cursor-pointer"
            >
              Отмена
            </button>
            <button
              type="submit"
              className="flex-1 py-2 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold transition shadow-xs cursor-pointer"
            >
              Добавить в сеть
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
