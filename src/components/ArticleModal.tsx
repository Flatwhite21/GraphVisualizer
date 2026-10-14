import React, { useState } from 'react';

interface ArticleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddArticle: (title: string, authors: string[], year: number) => void;
}

export const ArticleModal: React.FC<ArticleModalProps> = ({
  isOpen,
  onClose,
  onAddArticle,
}) => {
  const [title, setTitle] = useState('');
  const [authorsText, setAuthorsText] = useState('');
  const [year, setYear] = useState(new Date().getFullYear());
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

    onAddArticle(title.trim(), parsedAuthors, Number(year) || new Date().getFullYear());
    setTitle('');
    setAuthorsText('');
    setYear(new Date().getFullYear());
    setError('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full overflow-hidden border border-gray-100">
        <div className="bg-gradient-to-r from-[#667eea] to-[#764ba2] text-white px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">➕ Добавить новую публикацию</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-white/80 hover:text-white text-xl leading-none font-semibold cursor-pointer"
          >
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 text-red-700 text-xs p-3 rounded-md border border-red-200">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
              Название статьи / книги
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Например: Методы сетевого анализа в исторической науке"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#667eea] focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
              Авторы (через запятую)
            </label>
            <textarea
              rows={3}
              required
              value={authorsText}
              onChange={(e) => setAuthorsText(e.target.value)}
              placeholder="Например: Бородкин Л.И., Гарскова И.М., Владимиров В.Н."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#667eea] focus:border-transparent"
            />
            <p className="text-[11px] text-gray-500 mt-1">
              Соавторство свяжет авторов ребром в сети, рассчитывая силу связи по числу совместных трудов.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
              Год публикации
            </label>
            <input
              type="number"
              min="1900"
              max="2030"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#667eea] focus:border-transparent"
            />
          </div>

          <div className="flex gap-3 pt-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 px-4 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm font-medium transition cursor-pointer"
            >
              Отмена
            </button>
            <button
              type="submit"
              className="flex-1 py-2.5 px-4 rounded-lg bg-gradient-to-r from-[#667eea] to-[#764ba2] hover:opacity-95 text-white text-sm font-medium transition shadow-md cursor-pointer"
            >
              Добавить в сеть
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
