"""
Тесты для модуля экспорта exporter.py.
"""

import os
import tempfile
import networkx as nx
import pandas as pd
from app.matrix_builder import build_adjacency_matrix
from app.exporter import export_matrix_to_xlsx, export_matrix_to_csv, export_edges_to_xlsx


def test_export_matrix_csv_and_xlsx():
    G = nx.Graph()
    G.add_edge("Иванов И.И.", "Петров П.П.", weight=2)
    matrix_df = build_adjacency_matrix(G)

    with tempfile.TemporaryDirectory() as tmpdir:
        csv_path = os.path.join(tmpdir, "test_matrix.csv")
        xlsx_path = os.path.join(tmpdir, "test_matrix.xlsx")

        export_matrix_to_csv(matrix_df, csv_path)
        export_matrix_to_xlsx(matrix_df, xlsx_path)

        assert os.path.exists(csv_path)
        assert os.path.exists(xlsx_path)
        assert os.path.getsize(csv_path) > 0
        assert os.path.getsize(xlsx_path) > 0

        # Читаем обратно и проверяем
        read_csv = pd.read_csv(csv_path, index_col=0)
        assert read_csv.loc["Иванов И.И.", "Петров П.П."] == 2


def test_export_edges_xlsx():
    G = nx.Graph()
    G.add_edge("A", "B", weight=5)

    with tempfile.TemporaryDirectory() as tmpdir:
        xlsx_path = os.path.join(tmpdir, "edges.xlsx")
        export_edges_to_xlsx(G, xlsx_path)

        assert os.path.exists(xlsx_path)
        read_edges = pd.read_excel(xlsx_path)
        assert len(read_edges) == 1
        assert read_edges.iloc[0]["Количество совместных публикаций"] == 5
