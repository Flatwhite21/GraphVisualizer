"""
Тесты для модуля разбора авторов author_parser.py.
"""

from app.author_parser import parse_authors_string, clean_author_name


def test_parse_semicolon_delimited():
    raw = "Иванов И.И.; Петров П.П.; Сидоров А.А."
    result = parse_authors_string(raw)
    assert result == ["Иванов И.И.", "Петров П.П.", "Сидоров А.А."]


def test_parse_comma_delimited():
    raw = "Иванов И.И., Петров П.П., Сидоров А.А."
    result = parse_authors_string(raw)
    assert result == ["Иванов И.И.", "Петров П.П.", "Сидоров А.А."]


def test_whitespace_and_empty_items():
    raw = "  Иванов И.И.  ; ;  Петров П.П. ;   "
    result = parse_authors_string(raw)
    assert result == ["Иванов И.И.", "Петров П.П."]


def test_deduplication_within_single_publication():
    raw = "Иванов И.И.; Петров П.П.; Иванов И.И."
    result = parse_authors_string(raw)
    assert result == ["Иванов И.И.", "Петров П.П."]
    assert len(result) == 2


def test_empty_and_nan_values():
    assert parse_authors_string(None) == []
    assert parse_authors_string("") == []
    assert parse_authors_string("nan") == []
    assert parse_authors_string("-") == []


def test_cyrillic_and_latin_preserved():
    raw = "Smith J.; Бородкин Л.И.; Müller K."
    result = parse_authors_string(raw)
    assert "Smith J." in result
    assert "Бородкин Л.И." in result
    assert "Müller K." in result
