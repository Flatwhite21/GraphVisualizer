"""
Модуль визуализации графа соавторства на базе Matplotlib и NetworkX.
Соблюдает строгое требование:
- Все вершины одинакового размера.
- Все рёбра одинаковой толщины.
- Частота совместных публикаций (вес) кодируется ИСКЛЮЧИТЕЛЬНО ЦВЕТОМ рёбер (градиент от светло-голубого к тёмно-синему).
"""

from typing import Optional, Dict, Any
import networkx as nx
import numpy as np
import matplotlib
import matplotlib.pyplot as plt
from matplotlib.figure import Figure
from matplotlib.colors import Normalize, LinearSegmentedColormap
from matplotlib.colorbar import ColorbarBase

try:
    from matplotlib.backends.backend_qtagg import FigureCanvasQTAgg as FigureCanvas
    from matplotlib.backends.backend_qtagg import NavigationToolbar2QT as NavigationToolbar
except ImportError:
    # Запасной импорт для совместимости
    from matplotlib.backends.backend_qt5agg import FigureCanvasQTAgg as FigureCanvas
    from matplotlib.backends.backend_qt5agg import NavigationToolbar2QT as NavigationToolbar


# Кастомная палитра от ясного небесно-голубого к глубокому тёмно-синему индиго
CUSTOM_BLUE_CMAP = LinearSegmentedColormap.from_list(
    "CoauthorshipBlues",
    ["#93c5fd", "#3b82f6", "#1d4ed8", "#1e3a8a", "#0f172a"]
)


def draw_coauthorship_graph(
    figure: Figure,
    graph: nx.Graph,
    show_labels: bool = True,
    seed: int = 42,
    pos: Optional[Dict[Any, Any]] = None
) -> Dict[Any, Any]:
    """
    Отрисовывает граф соавторства на переданном Matplotlib Figure.
    
    :param figure: Объект matplotlib Figure
    :param graph: Взвешенный граф NetworkX
    :param show_labels: Показывать ли подписи авторов
    :param seed: Сид для воспроизводимости spring_layout
    :param pos: Предварительно вычисленные координаты вершин
    :return: Вычисленные координаты вершин pos
    """
    figure.clf()
    ax = figure.add_subplot(111)
    ax.axis("off")

    if graph.number_of_nodes() == 0:
        ax.text(
            0.5, 0.5,
            "Граф пуст.\nЗагрузите Excel-файл с публикациями для построения сети.",
            ha="center", va="center", fontsize=12, color="#64748b"
        )
        return {}

    # Вычисление расположения вершин
    if pos is None:
        if graph.number_of_nodes() > 1:
            pos = nx.spring_layout(graph, k=0.45, seed=seed, iterations=60)
        else:
            pos = {list(graph.nodes())[0]: np.array([0.5, 0.5])}

    # 1. Извлечение весов рёбер
    edges = list(graph.edges(data=True))
    if edges:
        weights = [float(data.get("weight", 1)) for _, _, data in edges]
        min_weight = min(weights)
        max_weight = max(weights)
    else:
        weights = []
        min_weight, max_weight = 1.0, 1.0

    # Нормализация для цветовой шкалы (от 1 до max_weight)
    norm = Normalize(vmin=1.0, vmax=max(max_weight, 2.0))
    cmap = CUSTOM_BLUE_CMAP

    # 2. Отрисовка рёбер: ОДИНАКОВАЯ ТОЛЩИНА (width=2.2), ВЕС КОДИРУЕТСЯ ТОЛЬКО ЦВЕТОМ
    if edges:
        edge_colors = [cmap(norm(w)) for w in weights]
        
        # СТРОГО ОДИНАКОВАЯ ТОЛЩИНА РЁБЕР (width=2.2)
        nx.draw_networkx_edges(
            graph,
            pos,
            ax=ax,
            width=2.2,
            edge_color=edge_colors,
            alpha=0.88,
            arrows=False
        )

    # 3. Отрисовка вершин: СТРОГО ОДИНАКОВЫЙ БАЗОВЫЙ РАЗМЕР (node_size=320)
    UNIFORM_NODE_SIZE = 320
    nx.draw_networkx_nodes(
        graph,
        pos,
        ax=ax,
        node_size=UNIFORM_NODE_SIZE,
        node_color="#6366f1",      # Аккуратный индиго
        edgecolors="#ffffff",      # Четкий белый контур
        linewidths=2.0
    )

    # 4. Подписи вершин
    if show_labels:
        labels = {node: str(node) for node in graph.nodes()}
        nx.draw_networkx_labels(
            graph,
            pos,
            labels=labels,
            ax=ax,
            font_size=8,
            font_family="sans-serif",
            font_weight="bold",
            bbox=dict(
                boxstyle="round,pad=0.2",
                facecolor="white",
                edgecolor="#cbd5e1",
                alpha=0.85,
                linewidth=0.8
            )
        )

    # 5. Цветовая легенда (Colorbar)
    if edges and max_weight > 1:
        cax = figure.add_axes([0.88, 0.20, 0.022, 0.60])
        cb = ColorbarBase(cax, cmap=cmap, norm=norm, orientation="vertical")
        cb.set_label("Количество совместных публикаций", fontsize=9, labelpad=8)
        
        # Дискретные деления целых чисел
        ticks = sorted(list(set(int(w) for w in weights)))
        if len(ticks) > 6:
            ticks = np.linspace(1, max_weight, 5, dtype=int).tolist()
            ticks = sorted(list(set(ticks)))
        cb.set_ticks(ticks)
        cb.ax.tick_params(labelsize=8)

    ax.margins(0.12)
    figure.tight_layout()
    return pos
