"""
Модуль вычисления статистических и топологических показателей сети соавторства.
"""

from typing import Dict, Any, List, Tuple
import networkx as nx
import pandas as pd


def calculate_network_statistics(
    graph: nx.Graph,
    total_publications_count: int
) -> Dict[str, Any]:
    """
    Рассчитывает ключевые показатели сети исследователей.
    
    :param graph: Взвешенный граф NetworkX
    :param total_publications_count: Общее количество обработанных публикаций
    :return: Словарь с агрегированными показателями
    """
    num_nodes = graph.number_of_nodes()
    num_edges = graph.number_of_edges()

    # 1. Исследователи без связей
    isolates = list(nx.isolates(graph))
    isolated_authors_count = len(isolates)

    # 2. Веса связей
    edge_weights = [d.get("weight", 1) for _, _, d in graph.edges(data=True)]
    if edge_weights:
        avg_collaborations = sum(edge_weights) / len(edge_weights)
        max_collaborations = max(edge_weights)
    else:
        avg_collaborations = 0.0
        max_collaborations = 0

    # 3. Плотность сети
    if num_nodes > 1:
        density = nx.density(graph)
    else:
        density = 0.0

    # 4. Число компонент связности
    if num_nodes > 0:
        connected_components_count = nx.number_connected_components(graph)
    else:
        connected_components_count = 0

    # 5. Лидеры по числу соавторов (Degree)
    degree_dict = dict(graph.degree())
    top_by_degree: List[Tuple[str, int]] = sorted(
        degree_dict.items(), key=lambda item: item[1], reverse=True
    )[:10]

    # 6. Лидеры по суммарному весу связей (Strength / Взвешенная степень)
    strength_dict = {
        node: sum(data.get("weight", 1) for _, _, data in graph.edges(node, data=True))
        for node in graph.nodes()
    }
    top_by_strength: List[Tuple[str, int]] = sorted(
        strength_dict.items(), key=lambda item: item[1], reverse=True
    )[:10]

    return {
        "total_publications": total_publications_count,
        "total_authors": num_nodes,
        "total_edges": num_edges,
        "isolated_authors": isolated_authors_count,
        "avg_collaborations_per_edge": round(avg_collaborations, 2),
        "max_collaborations": max_collaborations,
        "density": round(density, 4),
        "connected_components": connected_components_count,
        "top_by_degree": top_by_degree,
        "top_by_strength": top_by_strength,
        "degree_dict": degree_dict,
        "strength_dict": strength_dict
    }


def get_authors_summary_table(graph: nx.Graph) -> pd.DataFrame:
    """
    Формирует подробную сводную таблицу по каждому автору сети.
    """
    records = []
    degree_dict = dict(graph.degree())

    for node, data in graph.nodes(data=True):
        pubs = data.get("publications", 1)
        coauthors = degree_dict.get(node, 0)
        total_connections = sum(
            edata.get("weight", 1) for _, _, edata in graph.edges(node, data=True)
        )
        records.append({
            "Автор": node,
            "Публикаций": pubs,
            "Соавторов": coauthors,
            "Суммарная сила связей": total_connections,
            "Организация": data.get("organization", "")
        })

    df = pd.DataFrame(records)
    if not df.empty:
        df.sort_values(by=["Соавторов", "Публикаций"], ascending=[False, False], inplace=True)
    return df
