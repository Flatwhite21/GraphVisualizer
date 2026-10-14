"""
Тесты для построения и фильтрации графа graph_builder.py.
"""

import pandas as pd
from app.graph_builder import CoauthorshipGraphBuilder


def test_two_authors_one_paper():
    builder = CoauthorshipGraphBuilder()
    df = pd.DataFrame([
        {"_parsed_authors": ["Иванов И.И.", "Петров П.П."], "_title": "Статья 1", "_year": 2022}
    ])
    G = builder.build_from_dataframe(df)

    assert G.number_of_nodes() == 2
    assert G.number_of_edges() == 1
    assert G["Иванов И.И."]["Петров П.П."]["weight"] == 1


def test_two_authors_three_papers():
    builder = CoauthorshipGraphBuilder()
    df = pd.DataFrame([
        {"_parsed_authors": ["Иванов И.И.", "Петров П.П."], "_title": "Статья 1", "_year": 2022},
        {"_parsed_authors": ["Иванов И.И.", "Петров П.П."], "_title": "Статья 2", "_year": 2023},
        {"_parsed_authors": ["Иванов И.И.", "Петров П.П."], "_title": "Статья 3", "_year": 2024},
    ])
    G = builder.build_from_dataframe(df)

    assert G.number_of_nodes() == 2
    assert G.number_of_edges() == 1
    assert G["Иванов И.И."]["Петров П.П."]["weight"] == 3


def test_three_coauthors_form_triangle():
    builder = CoauthorshipGraphBuilder()
    df = pd.DataFrame([
        {"_parsed_authors": ["A", "B", "C"], "_title": "Трио", "_year": 2024}
    ])
    G = builder.build_from_dataframe(df)

    assert G.number_of_nodes() == 3
    assert G.number_of_edges() == 3  # (A,B), (B,C), (A,C)
    assert G.has_edge("A", "B")
    assert G.has_edge("B", "C")
    assert G.has_edge("A", "C")


def test_author_without_coauthors_is_isolated():
    builder = CoauthorshipGraphBuilder()
    df = pd.DataFrame([
        {"_parsed_authors": ["Одиночный А.А."], "_title": "Монография", "_year": 2021}
    ])
    G = builder.build_from_dataframe(df)

    assert G.number_of_nodes() == 1
    assert G.number_of_edges() == 0
    assert G.has_node("Одиночный А.А.")


def test_year_filtering():
    builder = CoauthorshipGraphBuilder()
    df = pd.DataFrame([
        {"_parsed_authors": ["A", "B"], "_title": "Старая статья", "_year": 2005},
        {"_parsed_authors": ["A", "B"], "_title": "Новая статья", "_year": 2024},
    ])
    builder.build_from_dataframe(df)
    
    # Фильтруем только от 2020 года
    filtered = builder.apply_filters(min_year=2020)
    assert filtered["A"]["B"]["weight"] == 1
