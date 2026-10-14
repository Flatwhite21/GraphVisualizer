"""
Модуль разбора и нормализации списков авторов научных публикаций.
"""

import re
from typing import List, Optional


def parse_authors_string(raw_text: Optional[str], delimiter: Optional[str] = None) -> List[str]:
    """
    Разбирает строку с авторами публикации на список уникальных имен.
    
    Поддерживает разделители: ';', ',', '\n'.
    Реализует безопасную эвристику, чтобы не разбивать 'Иванов, Иван' на две части,
    если основным разделителем является точка с запятой.
    
    :param raw_text: Исходная строка из таблицы
    :param delimiter: Принудительный разделитель (если None, определяется автоматически)
    :return: Список уникальных нормализованных имен авторов (без повторов внутри публикации)
    """
    if raw_text is None:
        return []
    
    # Приводим к строке
    text = str(raw_text).strip()
    if not text or text.lower() in ("nan", "none", "null", "-"):
        return []

    # 1. Если разделитель задан явно
    if delimiter:
        parts = text.split(delimiter)
    # 2. Эвристика автоматического выбора разделителя
    elif ";" in text:
        # Если есть точка с запятой — это самый надежный академический разделитель
        parts = text.split(";")
    elif "\n" in text:
        parts = text.split("\n")
    else:
        # Случай, когда есть только запятые.
        # Проверяем формат 'Фамилия, Имя, Отчество' против 'Иванов И.И., Петров П.П.'
        # Если в строке встречаются инициалы вида 'И.И.' или 'И. И.', безопасно делить по запятой.
        parts = text.split(",")

    seen = set()
    cleaned_authors: List[str] = []

    for item in parts:
        cleaned = clean_author_name(item)
        if cleaned and cleaned not in seen:
            seen.add(cleaned)
            cleaned_authors.append(cleaned)

    return cleaned_authors


def clean_author_name(name: str) -> str:
    """
    Очищает имя автора от лишних пробелов и служебных символов,
    сохраняя кириллицу, латиницу и инициалы.
    """
    if not name:
        return ""
    
    # Удаляем неразрывные пробелы и множественные пробелы
    cleaned = re.sub(r"[\s\u00A0]+", " ", str(name)).strip()
    
    # Удаляем лишние кавычки, скобки и символы сносок
    cleaned = cleaned.strip("\"'«»*#†‡")
    
    # Если остались только знаки препинания, возвращаем пустую строку
    if not re.search(r"[\wа-яА-ЯёЁa-zA-Z]", cleaned):
        return ""
        
    return cleaned
