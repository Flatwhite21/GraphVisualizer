import React, { useState } from 'react';
import { Article } from '../types';

interface ArticlesListProps {
  articles: Article[];
  selectedAuthorId: string | null;
  onSelectAuthor: (author: string | null) => void;
  onDeleteArticle?: (id: string) => void;
}

export const ArticlesList: React.FC<ArticlesListProps> = ({
  articles,
  selectedAuthorId,
  onSelectAuthor,
  onDeleteArticle,
}) => {
  const [search, setSearch] = useState('');

  const filteredArticles = articles.filter((art) => {
    const matchesSearch =
      art.title.toLowerCase().includes(search.toLowerCase()) ||
      art.authors.some((a) => a.toLowerCase().includes(search.toLowerCase())) ||
      String(art.year).includes(search);

    const matchesAuthor = selectedAuthorId
      ? art.authors.includes(selectedAuthorId)
      : true;

    return matchesSearch && matchesAuthor;
  });

  return (
    <div className="p-6 space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-72">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по названию или автору..."
            className="w-full pl-3 pr-3 py-1.5 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-[#667eea]"
          />
        </div>

        {selectedAuthorId && (
          <div className="flex items-center gap-2 bg-indigo-50 text-indigo-800 px-3 py-1 rounded-full text-xs">
            <span>Фильтр по автору: <strong>{selectedAuthorId}</strong></span>
            <button
              onClick={() => onSelectAuthor(null)}
              className="text-indigo-600 hover:text-indigo-900 font-bold ml-1 cursor-pointer"
            >
              &times;
            </button>
          </div>
        )}
      </div>

      <div className="divide-y divide-gray-100 max-h-[500px] overflow-y-auto pr-1">
        {filteredArticles.length === 0 ? (
          <div className="py-12 text-center text-gray-500 text-sm">
            Публикации не найдены
          </div>
        ) : (
          filteredArticles.map((art) => (
            <div key={art.id} className="py-3.5 hover:bg-gray-50/80 px-2 rounded-lg transition">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1.5 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="bg-[#667eea]/15 text-[#667eea] font-semibold text-[11px] px-2 py-0.5 rounded">
                      {art.year} г.
                    </span>
                    <h4 className="text-sm font-semibold text-gray-900 leading-snug">
                      {art.title}
                    </h4>
                  </div>
                  <div className="flex flex-wrap gap-1.5 items-center pt-0.5">
                    <span className="text-[11px] text-gray-500">Авторы:</span>
                    {art.authors.map((author) => {
                      const isSelected = selectedAuthorId === author;
                      return (
                        <button
                          key={author}
                          type="button"
                          onClick={() => onSelectAuthor(isSelected ? null : author)}
                          className={`text-[11px] px-2 py-0.5 rounded-md transition cursor-pointer ${
                            isSelected
                              ? 'bg-[#667eea] text-white font-medium'
                              : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                          }`}
                        >
                          {author}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {onDeleteArticle && (
                  <button
                    type="button"
                    onClick={() => onDeleteArticle(art.id)}
                    title="Удалить статью"
                    className="text-gray-400 hover:text-red-500 p-1 text-xs transition cursor-pointer"
                  >
                    🗑️
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
