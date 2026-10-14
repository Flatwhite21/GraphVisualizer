"""
Модуль построения и фильтрации графа научного соавторства.
"""

from typing import List, Dict, Any, Optional, Set
import networkx as nx
import pandas as pd


class CoauthorshipGraphBuilder:
    """
    Класс для построения и фильтрации неориентированного взвешенного графа соавторства.
    """

    def __init__(self):
        self.raw_graph = nx.Graph()
        self.filtered_graph = nx.Graph()
        self.author_publications_count: Dict[str, int] = {}
        self.all_authors: List[str] = []

    def build_from_dataframe(self, df: pd.DataFrame) -> nx.Graph:
        """
        Строит граф соавторства из предварительно обработанного DataFrame.
        """
        self.raw_graph = nx.Graph()
        self.author_publications_count = {}

        # 1. Первый проход: сбор всех уникальных авторов и их публикационной активности
        for _, row in df.iterrows():
            authors: List[str] = row.get("_parsed_authors", [])
            for author in authors:
                self.author_publications_count[author] = (
                    self.author_publications_count.get(author, 0) + 1
                )
                if not self.raw_graph.has_node(author):
                    self.raw_graph.add_node(
                        author,
                        publications=0,
                        organization=row.get("_organization", "")
                    )

        # Обновляем число публикаций в атрибутах вершин
        for author, count in self.author_publications_count.items():
            self.raw_graph.nodes[author]["publications"] = count

        # 2. Второй проход: добавление взвешенных рёбер соавторства
        for _, row in df.iterrows():
            authors: List[str] = row.get("_parsed_authors", [])
            title: str = row.get("_title", "")
            year: int = row.get("_year", 0)
            org: str = row.get("_organization", "")

            # Перебираем все пары соавторов без повторов
            n_authors = len(authors)
            for i in range(n_authors):
                for j in range(i + 1, n_authors):
                    author_a = authors[i]
                    author_b = authors[j]

                    if author_a == author_b:
                        continue  # Исключаем петли (self-loops)

                    if self.raw_graph.has_edge(author_a, author_b):
                        # Увеличиваем вес ребра
                        self.raw_graph[author_a][author_b]["weight"] += 1
                        self.raw_graph[author_a][author_b]["publications"].append({
                            "title": title,
                            "year": year,
                            "organization": org
                        })
                    else:
                        # Создаем новое ребро
                        self.raw_graph.add_edge(
                            author_a,
                            author_b,
                            weight=1,
                            publications=[{
                                "title": title,
                                "year": year,
                                "organization": org
                            }]
                        )

        self.all_authors = sorted(list(self.raw_graph.nodes()))
        self.filtered_graph = self.raw_graph.copy()
        return self.filtered_graph

    def apply_filters(
        self,
        min_year: Optional[int] = None,
        max_year: Optional[int] = None,
        organization: Optional[str] = None,
        min_weight: int = 1,
        selected_author: Optional[str] = None,
        include_neighbors_only: bool = False
    ) -> nx.Graph:
        """
        Фильтрует граф в соответствии с выбранными критериями.
        """
        filtered = nx.Graph()

        # Если заданы фильтры по годам или организации публикаций,
        # пересчитываем веса ребер на основе удовлетворяющих публикаций
        has_pub_filter = bool(min_year or max_year or organization)

        for u, v, data in self.raw_graph.edges(data=True):
            matching_pubs = data.get("publications", [])

            if has_pub_filter:
                filtered_pubs = []
                for p in matching_pubs:
                    pyear = p.get("year", 0)
                    porg = p.get("organization", "")

                    if min_year and pyear > 0 and pyear < min_year:
                        continue
                    if max_year and pyear > 0 and pyear > max_year:
                        continue
                    if organization and organization.lower() not in porg.lower():
                        continue

                    filtered_pubs.append(p)
                
                weight = len(filtered_pubs)
            else:
                filtered_pubs = matching_pubs
                weight = data.get("weight", 1)

            if weight >= min_weight and weight > 0:
                # Добавляем вершины и ребро
                for node in (u, v):
                    if not filtered.has_node(node):
                        filtered.add_node(
                            node,
                            publications=self.raw_graph.nodes[node].get("publications", 1),
                            organization=self.raw_graph.nodes[node].get("organization", "")
                        )

                filtered.add_edge(
                    u, v,
                    weight=weight,
                    publications=filtered_pubs
                )

        # Если не было жесткого фильтра по весу, сохраняем изолированные вершины
        if min_weight <= 1 and not has_pub_filter:
            for node, ndata in self.raw_graph.nodes(data=True):
                if not filtered.has_node(node):
                    filtered.add_node(node, **ndata)

        # Фильтр по выбранному исследователю (Ego-network)
        if selected_author and selected_author in filtered:
            if include_neighbors_only:
                neighbors: Set[str] = set(filtered.neighbors(selected_author))
                neighbors.add(selected_author)
                nodes_to_keep = neighbors
                filtered = filtered.subgraph(nodes_to_keep).copy()

        self.filtered_graph = filtered
        return self.filtered_graph
