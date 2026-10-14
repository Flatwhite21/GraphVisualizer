"""
Тесты для модуля матрицы смежности matrix_builder.py.
"""

import networkx as nx
from app.matrix_builder import build_adjacency_matrix, validate_adjacency_matrix


def test_matrix_two_authors_one_paper():
    G = nx.Graph()
    G.add_edge("Иванов И.И.", "Петров П.П.", weight=1)

    df_matrix = build_adjacency_matrix(G, author_list=["Иванов И.И.", "Петров П.П."])

    assert df_matrix.shape == (2, 2)
    assert df_matrix.loc["Иванов И.И.", "Иванов И.И."] == 0
    assert df_matrix.loc["Петров П.П.", "Петров П.П."] == 0
    assert df_matrix.loc["Иванов И.И.", "Петров П.П."] == 1
    assert df_matrix.loc["Петров П.П.", "Иванов И.И."] == 1
    assert validate_adjacency_matrix(df_matrix) is True


def test_matrix_three_papers():
    G = nx.Graph()
    G.add_edge("Иванов И.И.", "Петров П.П.", weight=3)

    df_matrix = build_adjacency_matrix(G, author_list=["Иванов И.И.", "Петров П.П."])

    assert df_matrix.loc["Иванов И.И.", "Петров П.П."] == 3
    assert df_matrix.loc["Петров П.П.", "Иванов И.И."] == 3
    assert df_matrix.loc["Иванов И.И.", "Иванов И.И."] == 0


def test_matrix_symmetry_and_diagonal():
    G = nx.Graph()
    G.add_edge("A", "B", weight=2)
    G.add_edge("B", "C", weight=4)
    G.add_node("D")  # Изолированный автор

    df_matrix = build_adjacency_matrix(G)

    # Проверка симметрии A == A.T
    assert (df_matrix.values == df_matrix.values.T).all()
    # Главная диагональ строго нули
    for i in range(len(df_matrix)):
        assert df_matrix.iloc[i, i] == 0
    # Изолированная вершина имеет нули
    assert df_matrix.loc["D"].sum() == 0
    assert validate_adjacency_matrix(df_matrix) is True
