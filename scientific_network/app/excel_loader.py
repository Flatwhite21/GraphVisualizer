"""
Модуль загрузки и первичной обработки Excel-файлов (.xlsx).
Поддерживает:
1. Матричный формат с отметками '1' в колонках авторов (формат ПетрГУ и КарНЦ РАН).
2. Стандартный табличный формат (колонки 'Год', 'Название', 'Авторы', 'Организация').
3. Извлечение авторов и года непосредственно из библиографического описания.
"""

import re
from typing import List, Dict, Tuple, Optional
import pandas as pd
from app.author_parser import parse_authors_string, clean_author_name


class ExcelLoadError(Exception):
    """Исключение при ошибках загрузки или структуры Excel-файла."""
    pass


def get_excel_sheet_names(file_path: str) -> List[str]:
    """
    Возвращает список листов Excel-файла.
    """
    try:
        excel_file = pd.ExcelFile(file_path, engine="openpyxl")
        return excel_file.sheet_names
    except Exception as e:
        raise ExcelLoadError(f"Не удалось прочитать Excel-файл: {e}")


def parse_citation_text(citation: str) -> Tuple[List[str], str, int]:
    """
    Извлекает список авторов, заглавие и год из академического библиографического описания.
    Пример: 'Захаров В.Н., Леонтьев А.А. ПРОГРАММНАЯ СИСТЕМА... // Труды ПетрГУ. 2000.'
    """
    if not citation or pd.isna(citation):
        return [], "Без названия", 0

    text = str(citation).strip()
    
    # 1. Поиск года (4 цифры)
    year_match = re.findall(r"\b(19\d\d|20[0-3]\d)\b", text)
    year = int(year_match[-1]) if year_match else 0

    # 2. Выделение части до знака '//'
    before_slash = text.split("//")[0].strip()

    # 3. Поиск инициалов авторов вида 'Фамилия И.О.' или 'Фамилия И. О.'
    author_regex = r"([А-ЯЁ][а-яё]+(?:-[А-ЯЁ][а-яё]+)?\s+[А-ЯЁ]\.\s?[А-ЯЁ]\.?|[А-ЯЁ]\.\s?[А-ЯЁ]\.?\s+[А-ЯЁ][а-яё]+)"
    matches = re.findall(author_regex, before_slash)

    authors = [clean_author_name(m) for m in matches if clean_author_name(m)]
    
    # Название — всё, что идет после последнего автора до '//'
    title = before_slash
    if authors:
        last_auth = matches[-1]
        last_pos = before_slash.rfind(last_auth)
        if last_pos != -1:
            title = before_slash[last_pos + len(last_auth):].strip(" ,.–—\t")

    if not title:
        title = before_slash if len(before_slash) < 120 else before_slash[:120] + "..."

    return authors, title, year


def load_publications_excel(
    file_path: str,
    sheet_name: Optional[str] = None,
    column_mapping: Optional[Dict[str, str]] = None,
    delimiter: Optional[str] = None
) -> Tuple[pd.DataFrame, Dict[str, str]]:
    """
    Загружает публикации из XLSX файла и формирует стандартизированный DataFrame.
    """
    try:
        excel_file = pd.ExcelFile(file_path, engine="openpyxl")
        if not sheet_name:
            sheet_name = excel_file.sheet_names[0]

        # Загружаем сначала без заголовков, чтобы проанализировать структуру
        df_raw = pd.read_excel(excel_file, sheet_name=sheet_name, header=None)
    except Exception as e:
        raise ExcelLoadError(f"Ошибка при открытии таблицы: {e}")

    if df_raw.empty:
        raise ExcelLoadError("Выбранный лист Excel пуст.")

    # 1. Проверяем, является ли таблица матрицей инцидентности (формат из скриншота)
    # Ищем строку с именами авторов (обычно строка 0 или 1)
    matrix_header_row = -1
    year_col_idx = -1
    citation_col_idx = -1
    author_columns: List[Tuple[int, str]] = []

    for r_idx in range(min(5, len(df_raw))):
        row_vals = df_raw.iloc[r_idx].fillna("").astype(str).tolist()
        potential_authors = []
        found_year = -1
        found_cit = -1

        for c_idx, val in enumerate(row_vals):
            val_clean = val.strip()
            v_lower = val_clean.lower()
            if v_lower in ("год", "year"):
                found_year = c_idx
            elif "название" in v_lower or "статья" in v_lower or (found_year != -1 and c_idx == found_year + 1):
                found_cit = c_idx
            elif len(val_clean) >= 3 and re.search(r"[А-ЯЁ][а-яё]+", val_clean):
                potential_authors.append((c_idx, clean_author_name(val_clean)))

        if len(potential_authors) >= 3:
            matrix_header_row = r_idx
            year_col_idx = found_year if found_year != -1 else 1
            citation_col_idx = found_cit if found_cit != -1 else 2
            author_columns = potential_authors
            break

    # ЕСЛИ ОБНАРУЖЕН МАТРИЧНЫЙ ФОРМАТ (как на скриншоте пользователя):
    if matrix_header_row != -1:
        records = []
        for r_idx in range(matrix_header_row + 1, len(df_raw)):
            row = df_raw.iloc[r_idx]
            citation_val = str(row.get(citation_col_idx, "")).strip()
            year_val = row.get(year_col_idx, 0)
            try:
                year_num = int(year_val)
            except:
                year_num = 0

            if not citation_val or citation_val.lower() == "nan":
                continue

            # Собираем авторов с отметкой '1'
            marked_authors = []
            for c_idx, auth_name in author_columns:
                cell = str(row.get(c_idx, "")).strip()
                if cell in ("1", "1.0", "+", "x", "X"):
                    marked_authors.append(auth_name)

            # Если в ячейках не было '1', пробуем извлечь авторов из текста цитаты
            parsed_authors, parsed_title, parsed_year = parse_citation_text(citation_val)
            final_authors = marked_authors if marked_authors else parsed_authors
            final_year = year_num if year_num > 1900 else (parsed_year if parsed_year > 1900 else 2024)

            # Определяем организацию
            org = "ПетрГУ"
            cit_lower = citation_val.lower()
            if "карнц" in cit_lower or "ияли" in cit_lower or "ран" in cit_lower:
                org = "КарНЦ РАН"
                if "петргу" in cit_lower:
                    org = "ПетрГУ / КарНЦ РАН"

            records.append({
                "Год": final_year,
                "Библиографическое описание": citation_val,
                "Авторы": "; ".join(final_authors),
                "Организация": org,
                "_parsed_authors": final_authors if final_authors else ["Не указан"],
                "_title": citation_val,
                "_year": final_year,
                "_organization": org
            })

        df_processed = pd.DataFrame(records)
        used_mapping = {
            "year": "Год",
            "title": "Библиографическое описание",
            "authors": "Авторы",
            "organization": "Организация"
        }
        return df_processed, used_mapping

    # 2. СТАНДАРТНЫЙ ФОРМАТ ТАБЛИЦЫ:
    # Загружаем с первой строки как заголовок
    df_std = pd.read_excel(excel_file, sheet_name=sheet_name)
    used_mapping = column_mapping if column_mapping else {}
    if not used_mapping:
        from app.excel_loader import detect_columns
        used_mapping = detect_columns(list(df_std.columns))

    authors_col = used_mapping.get("authors")
    title_col = used_mapping.get("title")
    year_col = used_mapping.get("year")
    org_col = used_mapping.get("organization")

    if not authors_col or authors_col not in df_std.columns:
        # Пробуем разобрать авторов из колонки с названием/описанием
        if title_col and title_col in df_std.columns:
            authors_col = title_col
            df_std["_parsed_authors"] = df_std[title_col].apply(
                lambda x: parse_citation_text(x)[0]
            )
        else:
            raise ExcelLoadError(
                "Не удалось определить столбец с авторами публикаций. "
                "Проверьте, что в файле присутствуют колонки 'Авторы' или библиографическое описание."
            )
    else:
        df_std["_parsed_authors"] = df_std[authors_col].apply(
            lambda x: parse_authors_string(x, delimiter=delimiter)
        )

    if title_col and title_col in df_std.columns:
        df_std["_title"] = df_std[title_col].fillna("Без названия").astype(str)
    else:
        df_std["_title"] = [f"Публикация #{i+1}" for i in range(len(df_std))]

    if year_col and year_col in df_std.columns:
        df_std["_year"] = pd.to_numeric(df_std[year_col], errors="coerce").fillna(0).astype(int)
    else:
        df_std["_year"] = 2024

    if org_col and org_col in df_std.columns:
        df_std["_organization"] = df_std[org_col].fillna("ПетрГУ").astype(str)
    else:
        df_std["_organization"] = "ПетрГУ"

    return df_std, used_mapping
