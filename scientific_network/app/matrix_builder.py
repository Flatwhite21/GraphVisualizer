"""
Модуль формирования матрицы смежности графа соавторства.
"""

from typing import List, Optional
import networkx as nx
import pandas as pd
import numpy as np


def build_adjacency_matrix(
    graph: nx.Graph,
    author_list: Optional[List[str]] = None
) -> pd.DataFrame:
    """
    Строит симметричную матрицу смежности графа соавторства с нулями на диагонали.
    
    :param graph: Взвешенный граф NetworkX
    :param author_list: Упорядоченный список авторов. Если None, берутся все вершины графа.
    :return: pandas.DataFrame, где строки и столбцы соответствуют авторам,
             а ячейки [i, j] содержат целое число совместных публикаций (вес ребра).
    """
    if author_list is None:
        nodes = sorted(list(graph.nodes()))
    else:
        nodes = list(author_list)

    n = len(nodes)
    if n == 0:
        return pd.DataFrame()

    node_to_idx = {node: i for i, node in enumerate(nodes)}
    matrix = np.zeros((n, n), dtype=int)

    for u, v, data in graph.edges(data=True):
        if u in node_to_idx and v in node_to_idx:
            i, j = node_to_idx[u], node_to_idx[v]
            weight = int(data.get("weight", 1))
            matrix[i, j] = weight
            matrix[j, i] = weight  # Симметричность

    # Гарантируем строгие нули на главной диагонали (исследователь сам с собой не образует связь)
    np.fill_diagonal(matrix, 0)

    df_matrix = pd.DataFrame(matrix, index=nodes, columns=nodes)
    return df_matrix


def validate_adjacency_matrix(matrix_df: pd.DataFrame) -> bool:
    """
    Проверяет корректность матрицы смежности:
    1. Квадратная форма;
    2. Симметричность: A == A.T;
    3. Нулевая диагональ: diag(A) == 0.
    """
    if matrix_df.empty:
        return True

    arr = matrix_df.values
    if arr.shape[0] != arr.shape[1]:
        return False
    
    # Проверка диагонали
    if np.any(np.diag(arr) != 0):
        return False

    # Проверка симметричности
    if not np.array_equal(arr, arr.T):
        return False

    return True
