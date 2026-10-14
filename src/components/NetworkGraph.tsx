import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { GraphNode, GraphLink, NetworkCommunity } from '../types';
import { COMMUNITY_COLORS } from '../utils/networkAnalysis';

interface NetworkGraphProps {
  nodes: GraphNode[];
  links: GraphLink[];
  communities: NetworkCommunity[];
  selectedAuthorId: string | null;
  onSelectAuthor: (authorId: string | null) => void;
  showLabels: boolean;
  colorByCommunity?: boolean;
  simulationTrigger: number;
}

// Последовательный синий градиент: чем больше публикаций, тем темнее ребро
// Все рёбра при этом имеют СТРОГО ОДИНАКОВУЮ ТОЛЩИНУ (2.2px)
export function getSequentialBlueLinkColor(weight: number): string {
  if (weight >= 5) return '#0f172a'; // Самый темный глубокий индиго-сланец (5+ статей)
  if (weight === 4) return '#1e3a8a'; // Темно-синий (4 статьи)
  if (weight === 3) return '#1d4ed8'; // Насыщенный синий кобальт (3 статьи)
  if (weight === 2) return '#3b82f6'; // Чистый синий (2 статьи)
  return '#93c5fd';                  // Светло-голубой (1 статья)
}

export const UNIFORM_EDGE_WIDTH = 2.2;

export const NetworkGraph: React.FC<NetworkGraphProps> = ({
  nodes,
  links,
  selectedAuthorId,
  onSelectAuthor,
  showLabels,
  colorByCommunity = false,
  simulationTrigger,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const zoomBehaviorRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const [showEdgeWeights, setShowEdgeWeights] = useState(true);

  useEffect(() => {
    if (!containerRef.current || !svgRef.current) return;

    const container = containerRef.current;
    const width = container.clientWidth || 850;
    const height = container.clientHeight || 620;

    // Deep copy data for D3 mutation
    const nodesCopy: (GraphNode & d3.SimulationNodeDatum)[] = nodes.map((d) => ({ ...d }));
    const linksCopy: (GraphLink & d3.SimulationLinkDatum<GraphNode>)[] = links.map((d) => ({
      ...d,
      source: typeof d.source === 'object' ? (d.source as GraphNode).id : d.source,
      target: typeof d.target === 'object' ? (d.target as GraphNode).id : d.target,
    }));

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    svg.attr('width', width).attr('height', height);

    // Defs for filters and gradients
    const defs = svg.append('defs');

    // Soft drop shadow filter for nodes
    const filter = defs.append('filter').attr('id', 'node-shadow').attr('height', '130%');
    filter.append('feDropShadow')
      .attr('dx', '0')
      .attr('dy', '1.5')
      .attr('stdDeviation', '2')
      .attr('flood-color', '#0f172a')
      .attr('flood-opacity', '0.15');

    // Zoom container
    const g = svg.append('g').attr('class', 'main-layer');

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });
    zoomBehaviorRef.current = zoom;
    svg.call(zoom);

    // Force Simulation
    const simulation = d3.forceSimulation<GraphNode>(nodesCopy)
      .force(
        'link',
        d3.forceLink<GraphNode, GraphLink>(linksCopy)
          .id((d) => d.id)
          .distance(75)
          .strength(0.25)
      )
      .force('charge', d3.forceManyBody().strength(-340).distanceMax(380))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(20));

    // Links group: СТРОГО ОДИНАКОВАЯ ТОЛЩИНА (UNIFORM_EDGE_WIDTH = 2.2px)
    const linkGroup = g.append('g').attr('class', 'links');
    const linkSelection = linkGroup
      .selectAll('line')
      .data(linksCopy)
      .enter()
      .append('line')
      .attr('class', 'link')
      .attr('stroke', (d) => getSequentialBlueLinkColor(d.weight))
      .attr('stroke-opacity', 0.88)
      .attr('stroke-width', UNIFORM_EDGE_WIDTH)
      .attr('stroke-linecap', 'round')
      .style('cursor', 'pointer');

    // Tooltip on links
    linkSelection.append('title')
      .text((d) => {
        const s = typeof d.source === 'object' ? (d.source as GraphNode).id : d.source;
        const t = typeof d.target === 'object' ? (d.target as GraphNode).id : d.target;
        return `Соавторство: ${s} ⟷ ${t}\nСовместных публикаций: ${d.weight}`;
      });

    // Edge weight badges (mid-line labels)
    const edgeWeightsGroup = g.append('g').attr('class', 'edge-weights');
    const edgeWeightsSelection = edgeWeightsGroup
      .selectAll('text')
      .data(linksCopy)
      .enter()
      .append('text')
      .attr('class', 'edge-weight-label')
      .text((d) => (d.weight > 1 ? `${d.weight}` : ''))
      .attr('text-anchor', 'middle')
      .attr('dy', '0.35em')
      .attr('font-size', '10px')
      .attr('font-weight', '700')
      .attr('fill', (d) => (d.weight >= 3 ? '#1e3a8a' : '#2563eb'))
      .style('pointer-events', 'none')
      .style('text-shadow', '0 0 3px #ffffff, 0 0 4px #ffffff, 1px 1px 2px #ffffff')
      .style('opacity', showEdgeWeights ? 1 : 0);

    // Nodes group: СТРОГО ОДИНАКОВЫЙ РАЗМЕР ВЕРШИН (11px)
    const UNIFORM_RADIUS = 11;
    const nodeGroup = g.append('g').attr('class', 'nodes');

    function dragStarted(event: d3.D3DragEvent<SVGCircleElement, GraphNode, unknown>, d: GraphNode) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }

    function dragged(event: d3.D3DragEvent<SVGCircleElement, GraphNode, unknown>, d: GraphNode) {
      d.fx = event.x;
      d.fy = event.y;
    }

    function dragEnded(event: d3.D3DragEvent<SVGCircleElement, GraphNode, unknown>, d: GraphNode) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }

    const getNodeFill = (d: GraphNode) => {
      if (colorByCommunity && d.communityId !== undefined) {
        return COMMUNITY_COLORS[d.communityId % COMMUNITY_COLORS.length];
      }
      return '#4f46e5';
    };

    const nodeSelection = nodeGroup.selectAll('circle')
      .data(nodesCopy)
      .enter()
      .append('circle')
      .attr('class', 'node')
      .attr('r', UNIFORM_RADIUS)
      .attr('fill', (d) => getNodeFill(d))
      .attr('stroke', '#ffffff')
      .attr('stroke-width', 2.4)
      .attr('filter', 'url(#node-shadow)')
      .style('cursor', 'pointer')
      .call(
        d3.drag<SVGCircleElement, GraphNode>()
          .on('start', dragStarted)
          .on('drag', dragged)
          .on('end', dragEnded)
      )
      .on('click', (event: MouseEvent, d: GraphNode) => {
        event.stopPropagation();
        onSelectAuthor(d.id);
      });

    // Tooltips on nodes
    nodeSelection.append('title')
      .text((d) => `${d.label}\n(${d.connections} соавторов, ${d.publications} публикаций)`);

    // Labels
    const labelsSelection = g.append('g')
      .attr('class', 'labels')
      .selectAll('text')
      .data(nodesCopy)
      .enter()
      .append('text')
      .attr('class', 'node-label')
      .text((d) => d.label)
      .attr('dy', UNIFORM_RADIUS + 13)
      .attr('text-anchor', 'middle')
      .attr('font-size', '11px')
      .attr('fill', '#1e293b')
      .attr('font-weight', '600')
      .style('pointer-events', 'none')
      .style('text-shadow', '0 1px 3px rgba(255,255,255,0.98), 0 0 4px rgba(255,255,255,0.95)')
      .style('opacity', showLabels ? 1 : 0);

    // Simulation tick
    simulation.on('tick', () => {
      linkSelection
        .attr('x1', (d) => ((d.source as GraphNode).x ?? 0))
        .attr('y1', (d) => ((d.source as GraphNode).y ?? 0))
        .attr('x2', (d) => ((d.target as GraphNode).x ?? 0))
        .attr('y2', (d) => ((d.target as GraphNode).y ?? 0));

      edgeWeightsSelection
        .attr('x', (d) => (((d.source as GraphNode).x ?? 0) + ((d.target as GraphNode).x ?? 0)) / 2)
        .attr('y', (d) => (((d.source as GraphNode).y ?? 0) + ((d.target as GraphNode).y ?? 0)) / 2);

      nodeSelection
        .attr('cx', (d) => d.x ?? 0)
        .attr('cy', (d) => d.y ?? 0);

      labelsSelection
        .attr('x', (d) => d.x ?? 0)
        .attr('y', (d) => d.y ?? 0);
    });

    // Background click clears selection
    svg.on('click', () => {
      onSelectAuthor(null);
    });

    return () => {
      simulation.stop();
    };
  }, [nodes, links, colorByCommunity, simulationTrigger]);

  // Update selection styling without resetting physics simulation
  useEffect(() => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);

    const nodesSel = svg.selectAll<SVGCircleElement, GraphNode>('.node');
    const linksSel = svg.selectAll<SVGLineElement, GraphLink>('.link');
    const labelsSel = svg.selectAll<SVGTextElement, GraphNode>('.node-label');
    const weightsSel = svg.selectAll<SVGTextElement, GraphLink>('.edge-weight-label');

    if (!selectedAuthorId) {
      nodesSel
        .attr('stroke', '#ffffff')
        .attr('stroke-width', 2.4)
        .attr('opacity', 1);

      linksSel
        .attr('stroke', (d) => getSequentialBlueLinkColor(d.weight))
        .attr('stroke-opacity', 0.88)
        .attr('stroke-width', UNIFORM_EDGE_WIDTH);

      labelsSel
        .attr('opacity', showLabels ? 1 : 0)
        .attr('font-weight', '600');

      weightsSel.attr('opacity', showEdgeWeights ? 1 : 0);
    } else {
      nodesSel.each(function (d) {
        const isSelected = d.id === selectedAuthorId;
        const sel = d3.select(this);
        if (isSelected) {
          sel
            .attr('stroke', '#f43f5e')
            .attr('stroke-width', 4)
            .attr('opacity', 1);
        } else {
          const isNeighbor = links.some((l) => {
            const sId = typeof l.source === 'object' ? (l.source as GraphNode).id : l.source;
            const tId = typeof l.target === 'object' ? (l.target as GraphNode).id : l.target;
            return (
              (sId === selectedAuthorId && tId === d.id) ||
              (tId === selectedAuthorId && sId === d.id)
            );
          });

          if (isNeighbor) {
            sel
              .attr('stroke', '#2563eb')
              .attr('stroke-width', 3)
              .attr('opacity', 1);
          } else {
            sel
              .attr('stroke', '#ffffff')
              .attr('stroke-width', 1.5)
              .attr('opacity', 0.22);
          }
        }
      });

      linksSel.each(function (d) {
        const sId = typeof d.source === 'object' ? (d.source as GraphNode).id : d.source;
        const tId = typeof d.target === 'object' ? (d.target as GraphNode).id : d.target;
        const isIncident = sId === selectedAuthorId || tId === selectedAuthorId;
        const sel = d3.select(this);

        if (isIncident) {
          sel
            .attr('stroke', getSequentialBlueLinkColor(d.weight))
            .attr('stroke-opacity', 1)
            .attr('stroke-width', UNIFORM_EDGE_WIDTH + 1);
        } else {
          sel
            .attr('stroke', '#cbd5e1')
            .attr('stroke-opacity', 0.12)
            .attr('stroke-width', 1);
        }
      });

      labelsSel.each(function (d) {
        const isSelected = d.id === selectedAuthorId;
        const isNeighbor = links.some((l) => {
          const sId = typeof l.source === 'object' ? (l.source as GraphNode).id : l.source;
          const tId = typeof l.target === 'object' ? (l.target as GraphNode).id : l.target;
          return (
            (sId === selectedAuthorId && tId === d.id) ||
            (tId === selectedAuthorId && sId === d.id)
          );
        });

        const sel = d3.select(this);
        if (isSelected) {
          sel
            .attr('opacity', 1)
            .attr('font-weight', '700')
            .attr('fill', '#0f172a');
        } else if (isNeighbor) {
          sel
            .attr('opacity', showLabels ? 1 : 0)
            .attr('font-weight', '600')
            .attr('fill', '#1e293b');
        } else {
          sel
            .attr('opacity', showLabels ? 0.2 : 0)
            .attr('font-weight', '400')
            .attr('fill', '#94a3b8');
        }
      });

      weightsSel.each(function (d) {
        const sId = typeof d.source === 'object' ? (d.source as GraphNode).id : d.source;
        const tId = typeof d.target === 'object' ? (d.target as GraphNode).id : d.target;
        const isIncident = sId === selectedAuthorId || tId === selectedAuthorId;
        d3.select(this).attr('opacity', isIncident && showEdgeWeights ? 1 : 0.1);
      });
    }
  }, [selectedAuthorId, links, showLabels, showEdgeWeights]);

  const handleZoomIn = () => {
    if (svgRef.current && zoomBehaviorRef.current) {
      d3.select(svgRef.current).transition().duration(250).call(zoomBehaviorRef.current.scaleBy, 1.3);
    }
  };

  const handleZoomOut = () => {
    if (svgRef.current && zoomBehaviorRef.current) {
      d3.select(svgRef.current).transition().duration(250).call(zoomBehaviorRef.current.scaleBy, 0.77);
    }
  };

  const handleResetZoom = () => {
    if (svgRef.current && zoomBehaviorRef.current) {
      d3.select(svgRef.current).transition().duration(300).call(zoomBehaviorRef.current.transform, d3.zoomIdentity);
    }
  };

  const handleExportSVG = () => {
    if (!svgRef.current) return;
    const serializer = new XMLSerializer();
    const source = serializer.serializeToString(svgRef.current);
    const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const downloadLink = document.createElement('a');
    downloadLink.href = url;
    downloadLink.download = 'coauthorship_network_petrsu_krc.svg';
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="relative w-full h-[620px] graph-canvas-container overflow-hidden" ref={containerRef}>
      <svg ref={svgRef} className="w-full h-full block" />

      {/* Floating Canvas Controls */}
      <div className="absolute bottom-4 right-4 flex items-center gap-1.5 bg-white/95 backdrop-blur-md p-1.5 rounded-xl shadow-lg border border-gray-200/80">
        <button
          type="button"
          onClick={() => setShowEdgeWeights(!showEdgeWeights)}
          title="Показать/скрыть количество совместных статей на рёбрах"
          className={`px-2.5 h-8 flex items-center justify-center rounded-lg text-xs font-semibold transition cursor-pointer ${
            showEdgeWeights ? 'bg-[#4f46e5] text-white shadow-xs' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
          }`}
        >
          Вес связей
        </button>
        <button
          type="button"
          onClick={handleExportSVG}
          title="Экспортировать векторный SVG для диплома"
          className="px-2.5 h-8 flex items-center justify-center rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold transition cursor-pointer"
        >
          📥 SVG
        </button>
        <div className="w-px h-5 bg-gray-200 mx-0.5" />
        <button
          type="button"
          onClick={handleZoomIn}
          title="Приблизить"
          className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold transition text-sm cursor-pointer"
        >
          +
        </button>
        <button
          type="button"
          onClick={handleZoomOut}
          title="Отдалить"
          className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold transition text-sm cursor-pointer"
        >
          -
        </button>
        <button
          type="button"
          onClick={handleResetZoom}
          title="Сбросить масштаб"
          className="px-2.5 h-8 flex items-center justify-center rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-medium transition cursor-pointer"
        >
          100%
        </button>
      </div>

      {/* Blue Gradient Legend */}
      <div className="absolute top-4 right-4 bg-white/95 backdrop-blur-md px-4 py-3 rounded-xl text-[11px] shadow-lg border border-gray-200/80 flex flex-col gap-1.5 pointer-events-none">
        <span className="font-bold text-gray-800 text-[10px] uppercase tracking-wider">
          Цвет ребра = количество совместных статей:
        </span>
        <div className="flex items-center gap-2.5">
          <span className="w-6 h-1 bg-[#93c5fd] rounded-full inline-block" />
          <span className="text-gray-600 font-medium">1 статья (светло-голубой)</span>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="w-6 h-1 bg-[#3b82f6] rounded-full inline-block" />
          <span className="text-gray-600 font-medium">2 статьи (синий)</span>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="w-6 h-1 bg-[#1d4ed8] rounded-full inline-block" />
          <span className="text-gray-600 font-medium">3 статьи (кобальт)</span>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="w-6 h-1 bg-[#1e3a8a] rounded-full inline-block" />
          <span className="text-gray-800 font-bold">4+ статей (тёмно-синий)</span>
        </div>
        <span className="text-[10px] text-gray-400 border-t border-gray-100 pt-1 mt-0.5">
          ✓ Вершины одинакового размера<br />
          ✓ Рёбра одинаковой толщины (2.2px)
        </span>
      </div>

      {/* Top Left Hint */}
      <div className="absolute top-4 left-4 bg-white/90 backdrop-blur-md px-3.5 py-2 rounded-xl text-[11px] text-gray-600 shadow-sm border border-gray-200/80 pointer-events-none flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
        <span>Перетаскивайте узлы, зум колесом мыши, кликните на автора для подробностей</span>
      </div>
    </div>
  );
};
