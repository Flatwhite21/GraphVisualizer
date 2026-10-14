"""
Модуль экспорта результатов анализа графа и матриц смежности в различные форматы.
"""

import os
from typing import Dict, Any, Optional
import networkx as nx
import pandas as pd
from matplotlib.figure import Figure
from app.statistics import get_authors_summary_table


class ExportError(Exception):
    """Исключение при ошибках экспорта данных."""
    pass


def export_matrix_to_xlsx(matrix_df: pd.DataFrame, output_path: str) -> None:
    """
    Экспортирует матрицу смежности в формат XLSX.
    """
    try:
        os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
        with pd.ExcelWriter(output_path, engine="openpyxl") as writer:
            matrix_df.to_excel(writer, sheet_name="Матрица смежности")
    except Exception as e:
        raise ExportError(f"Ошибка сохранения матрицы в XLSX: {e}")


def export_matrix_to_csv(matrix_df: pd.DataFrame, output_path: str) -> None:
    """
    Экспортирует матрицу смежности в формат CSV.
    """
    try:
        os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
        matrix_df.to_csv(output_path, encoding="utf-8-sig")
    except Exception as e:
        raise ExportError(f"Ошибка сохранения матрицы в CSV: {e}")


def export_authors_to_xlsx(graph: nx.Graph, output_path: str) -> None:
    """
    Экспортирует список уникальных исследователей с их показателями в XLSX.
    """
    try:
        os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
        df_authors = get_authors_summary_table(graph)
        with pd.ExcelWriter(output_path, engine="openpyxl") as writer:
            df_authors.to_excel(writer, sheet_name="Исследователи", index=False)
    except Exception as e:
        raise ExportError(f"Ошибка сохранения списка авторов в XLSX: {e}")


def export_edges_to_xlsx(graph: nx.Graph, output_path: str) -> None:
    """
    Экспортирует таблицу связей соавторства: Автор 1, Автор 2, Количество совместных публикаций.
    """
    try:
        os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
        records = []
        for u, v, data in graph.edges(data=True):
            records.append({
                "Автор 1": u,
                "Автор 2": v,
                "Количество совместных публикаций": data.get("weight", 1)
            })

        df_edges = pd.DataFrame(records)
        if not df_edges.empty:
            df_edges.sort_values(
                by="Количество совместных публикаций",
                ascending=False,
                inplace=True
            )

        with pd.ExcelWriter(output_path, engine="openpyxl") as writer:
            df_edges.to_excel(writer, sheet_name="Связи соавторства", index=False)
    except Exception as e:
        raise ExportError(f"Ошибка сохранения таблицы связей в XLSX: {e}")


def export_statistics_to_xlsx(stats: Dict[str, Any], output_path: str) -> None:
    """
    Экспортирует сводную статистику сети в XLSX.
    """
    try:
        os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)

        summary_rows = [
            {"Параметр": "Количество публикаций", "Значение": stats.get("total_publications", 0)},
            {"Параметр": "Количество уникальных исследователей", "Значение": stats.get("total_authors", 0)},
            {"Параметр": "Количество рёбер (связей)", "Значение": stats.get("total_edges", 0)},
            {"Параметр": "Исследователей без связей", "Значение": stats.get("isolated_authors", 0)},
            {"Параметр": "Среднее число публикаций на связь", "Значение": stats.get("avg_collaborations_per_edge", 0)},
            {"Параметр": "Максимальное число совместных публикаций у пары", "Значение": stats.get("max_collaborations", 0)},
            {"Параметр": "Плотность сети", "Значение": stats.get("density", 0)},
            {"Параметр": "Число компонент связности", "Значение": stats.get("connected_components", 0)},
        ]
        df_summary = pd.DataFrame(summary_rows)

        # Таблица лидеров по соавторам
        top_degree = pd.DataFrame(
            stats.get("top_by_degree", []),
            columns=["Исследователь", "Количество соавторов"]
        )

        with pd.ExcelWriter(output_path, engine="openpyxl") as writer:
            df_summary.to_excel(writer, sheet_name="Общие показатели", index=False)
            top_degree.to_excel(writer, sheet_name="Лидеры по соавторам", index=False)
    except Exception as e:
        raise ExportError(f"Ошибка сохранения статистики в XLSX: {e}")


def export_graph_image_png(figure: Figure, output_path: str, dpi: int = 300) -> None:
    """
    Сохраняет изображение графа в файл PNG с высоким разрешением.
    """
    try:
        os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
        figure.savefig(output_path, dpi=dpi, bbox_inches="tight")
    except Exception as e:
        raise ExportError(f"Ошибка сохранения изображения графа в PNG: {e}")
