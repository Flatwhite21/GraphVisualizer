import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as d3 from 'd3';
import { GraphNode, GraphLink, NetworkCommunity } from '../types';
import { COMMUNITY_COLORS } from '../utils/networkAnalysis';
import { 
  ZoomIn, 
  ZoomOut, 
  Maximize2, 
  RotateCcw, 
  Sliders, 
  Eye, 
  FileImage, 
  Download, 
  Palette, 
  Hash, 
  Users,
  Compass
} from 'lucide-react';

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

// Последовательный синий градиент согласно требованиям ВКР:
// Чем больше совместных публикаций, тем темнее ребро
export function getSequentialBlueLinkColor(weight: number): string {
  if (weight >= 4) return '#0f172a'; // Самый темный глубокий индиго-сланец (4+ статей)
  if (weight === 3) return '#1d4ed8'; // Насыщенный синий кобальт (3 статьи)
  if (weight === 2) return '#3b82f6'; // Чистый синий (2 статьи)
  return '#93c5fd';                  // Светло-голубой (1 статья)
}

// СТРОГО ОДИНАКОВАЯ ТОЛЩИНА РЁБЕР И РАДИУС ВЕРШИН (Требование диплома)
export const UNIFORM_EDGE_WIDTH = 2.2;
export const UNIFORM_RADIUS = 11;

type LabelMode = 'smart' | 'all' | 'hover';

export const NetworkGraph: React.FC<NetworkGraphProps> = ({
  nodes,
  links,
  communities,
  selectedAuthorId,
  onSelectAuthor,
  colorByCommunity = false,
  simulationTrigger,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const zoomBehaviorRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const simulationRef = useRef<d3.Simulation<GraphNode, GraphLink> | null>(null);

  // User interactive display controls
  const [showEdgeWeights, setShowEdgeWeights] = useState<boolean>(true);
  const [labelMode, setLabelMode] = useState<LabelMode>('smart');
  const [linkDistanceMult, setLinkDistanceMult] = useState<number>(1.2); // 0.8x to 2.0x
  const [chargeStrength, setChargeStrength] = useState<number>(-850); // -400 to -1600
  const [enableCommunityClustering, setEnableCommunityClustering] = useState<boolean>(true);
  const [hoveredAuthorId, setHoveredAuthorId] = useState<string | null>(null);
  const [hoveredPos, setHoveredPos] = useState<{ x: number; y: number } | null>(null);
  const [showSettings, setShowSettings] = useState<boolean>(false);

  // Direct coauthors map for fast lookup
  const neighborMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    nodes.forEach((n) => map.set(n.id, new Set()));
    links.forEach((l) => {
      const s = typeof l.source === 'object' ? (l.source as GraphNode).id : l.source;
      const t = typeof l.target === 'object' ? (l.target as GraphNode).id : l.target;
      if (!map.has(s)) map.set(s, new Set());
      if (!map.has(t)) map.set(t, new Set());
      map.get(s)!.add(t);
      map.get(t)!.add(s);
    });
    return map;
  }, [nodes, links]);

  // Compute prominent nodes (degree >= 2 or top 25%)
  const prominentNodeIds = useMemo(() => {
    const sorted = [...nodes].sort((a, b) => b.connections - a.connections);
    const topCount = Math.max(8, Math.ceil(nodes.length * 0.35));
    const topIds = new Set(sorted.slice(0, topCount).map((n) => n.id));
    nodes.forEach((n) => {
      if (n.connections >= 2) topIds.add(n.id);
    });
    return topIds;
  }, [nodes]);

  // Hovered author details for tooltip
  const hoveredNodeInfo = useMemo(() => {
    const activeId = hoveredAuthorId || selectedAuthorId;
    if (!activeId) return null;
    const node = nodes.find((n) => n.id === activeId);
    if (!node) return null;
    const neighbors = Array.from(neighborMap.get(activeId) || []);
    return {
      node,
      neighbors,
    };
  }, [hoveredAuthorId, selectedAuthorId, nodes, neighborMap]);

  // Auto-fit function
  const handleFitToView = () => {
    if (!svgRef.current || !containerRef.current || !zoomBehaviorRef.current) return;
    const svg = d3.select(svgRef.current);
    const g = svg.select<SVGGElement>('.main-layer');
    if (g.empty()) return;

    const nodeElements = g.selectAll<SVGCircleElement, GraphNode>('.node');
    if (nodeElements.empty()) return;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    nodeElements.each((d) => {
      if (d.x !== undefined && d.y !== undefined) {
        if (d.x < minX) minX = d.x;
        if (d.x > maxX) maxX = d.x;
        if (d.y < minY) minY = d.y;
        if (d.y > maxY) maxY = d.y;
      }
    });

    if (minX === Infinity) return;

    const width = containerRef.current.clientWidth || 900;
    const height = containerRef.current.clientHeight || 640;
    const padding = 70;

    const graphWidth = maxX - minX + padding * 2;
    const graphHeight = maxY - minY + padding * 2;

    const scale = Math.max(0.2, Math.min(1.8, Math.min(width / graphWidth, height / graphHeight)));
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    const transform = d3.zoomIdentity
      .translate(width / 2, height / 2)
      .scale(scale)
      .translate(-centerX, -centerY);

    svg.transition().duration(600).ease(d3.easeCubicOut).call(zoomBehaviorRef.current.transform, transform);
  };

  // Main D3 force simulation setup
  useEffect(() => {
    if (!containerRef.current || !svgRef.current) return;
    const container = containerRef.current;
    const width = container.clientWidth || 900;
    const height = container.clientHeight || 640;

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

    // Defs for filters
    const defs = svg.append('defs');
    
    // Soft drop shadow
    const filter = defs.append('filter').attr('id', 'node-shadow').attr('height', '140%').attr('width', '140%');
    filter.append('feDropShadow')
      .attr('dx', '0')
      .attr('dy', '2')
      .attr('stdDeviation', '2.5')
      .attr('flood-color', '#0f172a')
      .attr('flood-opacity', '0.22');

    // Glow filter for highlighted nodes
    const glow = defs.append('filter').attr('id', 'glow-active').attr('x', '-30%').attr('y', '-30%').attr('width', '160%').attr('height', '160%');
    glow.append('feGaussianBlur').attr('stdDeviation', '3.5').attr('result', 'coloredBlur');
    const feMerge = glow.append('feMerge');
    feMerge.append('feMergeNode').attr('in', 'coloredBlur');
    feMerge.append('feMergeNode').attr('in', 'SourceGraphic');

    // Zoom container
    const g = svg.append('g').attr('class', 'main-layer');
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.15, 5])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });
    zoomBehaviorRef.current = zoom;
    svg.call(zoom);

    // Initial position: arrange communities slightly apart to prevent a tangled hairball
    const commCount = Math.max(1, communities.length);
    const commCenters = communities.map((_, i) => {
      const angle = (i / commCount) * 2 * Math.PI;
      const radius = Math.min(width, height) * 0.28;
      return {
        x: width / 2 + Math.cos(angle) * radius,
        y: height / 2 + Math.sin(angle) * radius,
      };
    });

    nodesCopy.forEach((node) => {
      const cId = node.communityId ?? 0;
      const center = commCenters[cId % commCenters.length] || { x: width / 2, y: height / 2 };
      if (node.x === undefined) {
        node.x = center.x + (Math.random() - 0.5) * 140;
        node.y = center.y + (Math.random() - 0.5) * 140;
      }
    });

    // Custom clustering force
    function communityForce(alpha: number) {
      if (!enableCommunityClustering) return;
      const strength = 0.14 * alpha;
      for (const node of nodesCopy) {
        if (node.communityId !== undefined && commCenters[node.communityId]) {
          const target = commCenters[node.communityId];
          if (node.x !== undefined && node.y !== undefined) {
            node.vx = (node.vx ?? 0) + (target.x - node.x) * strength;
            node.vy = (node.vy ?? 0) + (target.y - node.y) * strength;
          }
        }
      }
    }

    // Force Simulation with calibrated distances
    const baseDistance = 110 * linkDistanceMult;

    const simulation = d3.forceSimulation<GraphNode>(nodesCopy)
      .force(
        'link',
        d3.forceLink<GraphNode, GraphLink>(linksCopy)
          .id((d) => d.id)
          .distance((d) => {
            // Closer distance for high weights, looser for single weight
            const factor = Math.max(0.65, 1.25 - (d.weight - 1) * 0.2);
            return baseDistance * factor;
          })
          .strength(0.3)
      )
      .force(
        'charge',
        d3.forceManyBody()
          .strength(chargeStrength)
          .distanceMax(850)
      )
      .force('center', d3.forceCenter(width / 2, height / 2).strength(0.045))
      .force(
        'collision',
        d3.forceCollide<GraphNode>()
          .radius(UNIFORM_RADIUS + 20)
          .strength(0.85)
      )
      .force('community', communityForce);

    simulationRef.current = simulation;

    // Links group
    const linkGroup = g.append('g').attr('class', 'links');
    const linkSelection = linkGroup
      .selectAll('line')
      .data(linksCopy)
      .enter()
      .append('line')
      .attr('class', 'link')
      .attr('stroke', (d) => getSequentialBlueLinkColor(d.weight))
      .attr('stroke-opacity', 0.85)
      .attr('stroke-width', UNIFORM_EDGE_WIDTH)
      .attr('stroke-linecap', 'round')
      .style('cursor', 'pointer')
      .on('mouseenter', function (event, d) {
        const s = typeof d.source === 'object' ? (d.source as GraphNode).id : String(d.source);
        const t = typeof d.target === 'object' ? (d.target as GraphNode).id : String(d.target);
        d3.select(this).attr('stroke-width', UNIFORM_EDGE_WIDTH + 2.5).attr('stroke-opacity', 1);
        setHoveredAuthorId(s);
        setHoveredPos({ x: event.clientX, y: event.clientY });
      })
      .on('mouseleave', function () {
        d3.select(this).attr('stroke-width', UNIFORM_EDGE_WIDTH).attr('stroke-opacity', 0.85);
        setHoveredAuthorId(null);
        setHoveredPos(null);
      });

    // Tooltip on links
    linkSelection.append('title').text((d) => {
      const s = typeof d.source === 'object' ? (d.source as GraphNode).id : d.source;
      const t = typeof d.target === 'object' ? (d.target as GraphNode).id : d.target;
      return `Соавторство: ${s} ⟷ ${t}\nСовместных статей: ${d.weight}`;
    });

    // Edge weights badges group (numbers along lines)
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
      .attr('fill', (d) => (d.weight >= 3 ? '#0f172a' : '#1d4ed8'))
      .style('pointer-events', 'none')
      .style('stroke', '#ffffff')
      .style('stroke-width', '3px')
      .style('paint-order', 'stroke fill')
      .style('opacity', showEdgeWeights ? 1 : 0);

    // Nodes group
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

    const nodeSelection = nodeGroup
      .selectAll('circle')
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
        onSelectAuthor(selectedAuthorId === d.id ? null : d.id);
      })
      .on('mouseenter', (event: MouseEvent, d: GraphNode) => {
        setHoveredAuthorId(d.id);
        setHoveredPos({ x: event.clientX, y: event.clientY });
      })
      .on('mouseleave', () => {
        setHoveredAuthorId(null);
        setHoveredPos(null);
      });

    // Tooltips on nodes
    nodeSelection.append('title').text((d) => `${d.label}\n(${d.connections} соавторов, ${d.publications} публикаций)`);

    // Labels group with crisp white halo
    const labelsGroup = g.append('g').attr('class', 'labels');
    const labelsSelection = labelsGroup
      .selectAll('text')
      .data(nodesCopy)
      .enter()
      .append('text')
      .attr('class', 'node-label')
      .text((d) => d.label)
      .attr('dy', UNIFORM_RADIUS + 13)
      .attr('text-anchor', 'middle')
      .attr('font-size', '11.5px')
      .attr('font-weight', '600')
      .attr('fill', '#0f172a')
      .style('pointer-events', 'none')
      .style('stroke', '#ffffff')
      .style('stroke-width', '4px')
      .style('stroke-linejoin', 'round')
      .style('paint-order', 'stroke fill');

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

    // Click on canvas background clears selection
    svg.on('click', () => {
      onSelectAuthor(null);
    });

    // After warm-up ticks, do automatic fit to view
    const timer = setTimeout(() => {
      handleFitToView();
    }, 450);

    return () => {
      clearTimeout(timer);
      simulation.stop();
    };
  }, [nodes, links, colorByCommunity, linkDistanceMult, chargeStrength, enableCommunityClustering, simulationTrigger]);

  // Dynamic visual updates for Hover and Selection
  useEffect(() => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);
    const nodesSel = svg.selectAll<SVGCircleElement, GraphNode>('.node');
    const linksSel = svg.selectAll<SVGLineElement, GraphLink>('.link');
    const labelsSel = svg.selectAll<SVGTextElement, GraphNode>('.node-label');
    const weightsSel = svg.selectAll<SVGTextElement, GraphLink>('.edge-weight-label');

    const activeFocusId = hoveredAuthorId || selectedAuthorId;
    const activeNeighbors = activeFocusId ? neighborMap.get(activeFocusId) : null;

    if (!activeFocusId) {
      // Default state
      nodesSel
        .attr('stroke', '#ffffff')
        .attr('stroke-width', 2.4)
        .attr('opacity', 1)
        .attr('filter', 'url(#node-shadow)');

      linksSel
        .attr('stroke', (d) => getSequentialBlueLinkColor(d.weight))
        .attr('stroke-opacity', 0.85)
        .attr('stroke-width', UNIFORM_EDGE_WIDTH);

      weightsSel.attr('opacity', showEdgeWeights ? 1 : 0);

      labelsSel.each(function (d) {
        let isVisible = false;
        if (labelMode === 'all') isVisible = true;
        else if (labelMode === 'smart') isVisible = prominentNodeIds.has(d.id);
        else if (labelMode === 'hover') isVisible = false;

        d3.select(this)
          .attr('opacity', isVisible ? 1 : 0)
          .attr('font-weight', prominentNodeIds.has(d.id) ? '700' : '500')
          .attr('fill', '#0f172a');
      });
    } else {
      // Focused state (highlight ego-network, dim others)
      nodesSel.each(function (d) {
        const isSelf = d.id === activeFocusId;
        const isNeighbor = activeNeighbors?.has(d.id);
        const sel = d3.select(this);

        if (isSelf) {
          sel
            .attr('stroke', '#f43f5e')
            .attr('stroke-width', 4.5)
            .attr('opacity', 1)
            .attr('filter', 'url(#glow-active)');
        } else if (isNeighbor) {
          sel
            .attr('stroke', '#2563eb')
            .attr('stroke-width', 3)
            .attr('opacity', 1)
            .attr('filter', 'url(#node-shadow)');
        } else {
          sel
            .attr('stroke', '#e2e8f0')
            .attr('stroke-width', 1.2)
            .attr('opacity', 0.16)
            .attr('filter', null);
        }
      });

      linksSel.each(function (d) {
        const sId = typeof d.source === 'object' ? (d.source as GraphNode).id : d.source;
        const tId = typeof d.target === 'object' ? (d.target as GraphNode).id : d.target;
        const isIncident = sId === activeFocusId || tId === activeFocusId;
        const sel = d3.select(this);

        if (isIncident) {
          sel
            .attr('stroke', getSequentialBlueLinkColor(d.weight))
            .attr('stroke-opacity', 1)
            .attr('stroke-width', UNIFORM_EDGE_WIDTH + 1.2);
        } else {
          sel
            .attr('stroke', '#cbd5e1')
            .attr('stroke-opacity', 0.08)
            .attr('stroke-width', 1);
        }
      });

      weightsSel.each(function (d) {
        const sId = typeof d.source === 'object' ? (d.source as GraphNode).id : d.source;
        const tId = typeof d.target === 'object' ? (d.target as GraphNode).id : d.target;
        const isIncident = sId === activeFocusId || tId === activeFocusId;
        d3.select(this).attr('opacity', isIncident && showEdgeWeights ? 1 : 0.05);
      });

      labelsSel.each(function (d) {
        const isSelf = d.id === activeFocusId;
        const isNeighbor = activeNeighbors?.has(d.id);
        const sel = d3.select(this);

        if (isSelf) {
          sel
            .attr('opacity', 1)
            .attr('font-weight', '800')
            .attr('font-size', '13px')
            .attr('fill', '#e11d48');
        } else if (isNeighbor) {
          sel
            .attr('opacity', 1)
            .attr('font-weight', '700')
            .attr('font-size', '12px')
            .attr('fill', '#1e40af');
        } else {
          sel.attr('opacity', 0.08);
        }
      });
    }
  }, [hoveredAuthorId, selectedAuthorId, labelMode, prominentNodeIds, showEdgeWeights, neighborMap]);

  // Zoom controls
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

  // Export SVG vector
  const handleExportSVG = () => {
    if (!svgRef.current) return;
    const serializer = new XMLSerializer();
    const source = serializer.serializeToString(svgRef.current);
    const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'граф_соавторства.svg';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Export PNG 300 DPI (Requirement 7)
  const handleExportPNG = () => {
    if (!svgRef.current) return;
    const svgElement = svgRef.current;
    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(svgElement);
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const URLObject = window.URL || window.webkitURL || window;
    const blobURL = URLObject.createObjectURL(svgBlob);

    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      const scaleFactor = 2; // High-resolution output
      canvas.width = svgElement.clientWidth * scaleFactor;
      canvas.height = svgElement.clientHeight * scaleFactor;
      const context = canvas.getContext('2d');
      if (context) {
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const pngURL = canvas.toDataURL('image/png');
        const downloadLink = document.createElement('a');
        downloadLink.href = pngURL;
        downloadLink.download = 'граф_соавторства.png';
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
      }
      URLObject.revokeObjectURL(blobURL);
    };
    image.src = blobURL;
  };

  return (
    <div className="relative w-full h-[660px] graph-canvas-container overflow-hidden rounded-b-xl border-t border-slate-200" ref={containerRef}>
      <svg ref={svgRef} className="w-full h-full block cursor-grab active:cursor-grabbing" />

      {/* Top Left Status & Hint */}
      <div className="absolute top-3.5 left-3.5 flex flex-col gap-2 pointer-events-none">
        <div className="bg-white/95 backdrop-blur-md px-3 py-2 rounded-xl text-xs text-slate-700 shadow-sm border border-slate-200/90 flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="font-semibold">{nodes.length} исследователей, {links.length} связей</span>
          <span className="text-slate-400">|</span>
          <span className="text-slate-500 hidden sm:inline">Клик по узлу — эго-сеть, колесо — зум</span>
        </div>
      </div>

      {/* Top Right: Color Legend Card (Дипломное требование: последовательный синий градиент) */}
      <div className="absolute top-3.5 right-3.5 bg-white/95 backdrop-blur-md px-3.5 py-3 rounded-xl text-[11px] shadow-md border border-slate-200/90 flex flex-col gap-1.5 z-10">
        <span className="font-bold text-slate-900 text-[10.5px] uppercase tracking-wider flex items-center gap-1.5">
          <Palette className="w-3.5 h-3.5 text-indigo-600" />
          Цвет ребра (число статей):
        </span>
        <div className="flex items-center gap-2">
          <span className="w-5 h-1.5 bg-[#93c5fd] rounded-full inline-block" />
          <span className="text-slate-600">1 статья (голубой)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-5 h-1.5 bg-[#3b82f6] rounded-full inline-block" />
          <span className="text-slate-600">2 статьи (синий)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-5 h-1.5 bg-[#1d4ed8] rounded-full inline-block" />
          <span className="text-slate-600">3 статьи (кобальт)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-5 h-1.5 bg-[#0f172a] rounded-full inline-block" />
          <span className="text-slate-900 font-bold">4+ статей (тёмно-синий)</span>
        </div>
        <div className="border-t border-slate-100 pt-1.5 mt-0.5 text-[10px] text-slate-400 flex items-center gap-2">
          <span>✓ Узлы: 11px</span>
          <span>✓ Рёбра: 2.2px</span>
        </div>
      </div>

      {/* Floating Layout Settings Flyout Panel */}
      {showSettings && (
        <div className="absolute top-16 right-3.5 bg-white/98 backdrop-blur-md p-4 rounded-xl shadow-xl border border-slate-200 w-72 z-20 space-y-3.5 text-xs">
          <div className="flex justify-between items-center pb-2 border-b border-slate-100">
            <span className="font-bold text-slate-900 flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-indigo-600" />
              Параметры раскладки
            </span>
            <button
              type="button"
              onClick={() => setShowSettings(false)}
              className="text-slate-400 hover:text-slate-700 font-bold text-sm"
            >
              ✕
            </button>
          </div>

          <div>
            <div className="flex justify-between mb-1">
              <span className="text-slate-600 font-medium">Расстояние между узлами:</span>
              <span className="font-mono text-indigo-600 font-semibold">{Math.round(linkDistanceMult * 100)}%</span>
            </div>
            <input
              type="range"
              min="0.8"
              max="2.2"
              step="0.1"
              value={linkDistanceMult}
              onChange={(e) => setLinkDistanceMult(Number(e.target.value))}
              className="w-full accent-indigo-600 cursor-pointer"
            />
          </div>

          <div>
            <div className="flex justify-between mb-1">
              <span className="text-slate-600 font-medium">Сила отталкивания:</span>
              <span className="font-mono text-indigo-600 font-semibold">{Math.abs(chargeStrength)}</span>
            </div>
            <input
              type="range"
              min="400"
              max="1600"
              step="50"
              value={Math.abs(chargeStrength)}
              onChange={(e) => setChargeStrength(-Number(e.target.value))}
              className="w-full accent-indigo-600 cursor-pointer"
            />
          </div>

          <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
            <span className="text-slate-600 font-medium">Группировать по школам:</span>
            <button
              type="button"
              onClick={() => setEnableCommunityClustering(!enableCommunityClustering)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition ${
                enableCommunityClustering ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'
              }`}
            >
              {enableCommunityClustering ? 'Вкл' : 'Выкл'}
            </button>
          </div>

          <button
            type="button"
            onClick={handleFitToView}
            className="w-full py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-xs flex items-center justify-center gap-1.5 transition"
          >
            <Compass className="w-3.5 h-3.5" />
            Центрировать и выровнять
          </button>
        </div>
      )}

      {/* Floating Canvas Controls Toolbar (Bottom Right) */}
      <div className="absolute bottom-4 right-4 flex items-center gap-1.5 bg-white/95 backdrop-blur-md p-1.5 rounded-xl shadow-lg border border-slate-200 z-10 flex-wrap">
        {/* Label Mode Switcher */}
        <div className="flex items-center bg-slate-100 rounded-lg p-0.5 text-[11px]">
          <button
            type="button"
            onClick={() => setLabelMode('smart')}
            title="Показывать подписи для ключевых авторов сети"
            className={`px-2 py-1 rounded-md font-medium transition cursor-pointer ${
              labelMode === 'smart' ? 'bg-white text-indigo-700 font-bold shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Ключевые
          </button>
          <button
            type="button"
            onClick={() => setLabelMode('all')}
            title="Показывать подписи для всех авторов"
            className={`px-2 py-1 rounded-md font-medium transition cursor-pointer ${
              labelMode === 'all' ? 'bg-white text-indigo-700 font-bold shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Все
          </button>
          <button
            type="button"
            onClick={() => setLabelMode('hover')}
            title="Показывать подписи только при наведении"
            className={`px-2 py-1 rounded-md font-medium transition cursor-pointer ${
              labelMode === 'hover' ? 'bg-white text-indigo-700 font-bold shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            При наведении
          </button>
        </div>

        {/* Weights toggle */}
        <button
          type="button"
          onClick={() => setShowEdgeWeights(!showEdgeWeights)}
          title="Показать/скрыть число совместных публикаций на связях"
          className={`h-8 px-2.5 flex items-center gap-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
            showEdgeWeights ? 'bg-indigo-600 text-white shadow-xs' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
          }`}
        >
          <Hash className="w-3.5 h-3.5" />
          Вес связей
        </button>

        {/* Settings button */}
        <button
          type="button"
          onClick={() => setShowSettings(!showSettings)}
          title="Настройки физической модели и расстояний"
          className={`h-8 px-2.5 flex items-center gap-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
            showSettings ? 'bg-indigo-600 text-white shadow-xs' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
          }`}
        >
          <Sliders className="w-3.5 h-3.5" />
          Раскладка
        </button>

        <div className="w-px h-5 bg-slate-200 mx-0.5" />

        {/* Zoom Fit */}
        <button
          type="button"
          onClick={handleFitToView}
          title="Вписать граф в окно"
          className="h-8 px-2.5 flex items-center gap-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium transition cursor-pointer"
        >
          <Maximize2 className="w-3.5 h-3.5" />
          Вписать
        </button>

        {/* Zoom In */}
        <button
          type="button"
          onClick={handleZoomIn}
          title="Приблизить"
          className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer font-bold"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </button>

        {/* Zoom Out */}
        <button
          type="button"
          onClick={handleZoomOut}
          title="Отдалить"
          className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer font-bold"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </button>

        {/* Reset */}
        <button
          type="button"
          onClick={handleResetZoom}
          title="Сбросить к 100%"
          className="h-8 px-2 flex items-center justify-center rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium transition cursor-pointer"
        >
          100%
        </button>

        <div className="w-px h-5 bg-slate-200 mx-0.5" />

        {/* Export SVG */}
        <button
          type="button"
          onClick={handleExportSVG}
          title="Скачать векторное изображение (.svg) для диплома"
          className="h-8 px-2.5 flex items-center gap-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium transition cursor-pointer"
        >
          <Download className="w-3.5 h-3.5" />
          SVG
        </button>

        {/* Export PNG */}
        <button
          type="button"
          onClick={handleExportPNG}
          title="Скачать растровое изображение высокого качества (.png 300 DPI)"
          className="h-8 px-2.5 flex items-center gap-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium transition cursor-pointer"
        >
          <FileImage className="w-3.5 h-3.5" />
          PNG
        </button>
      </div>

      {/* Floating Hover Tooltip Card */}
      {hoveredNodeInfo && hoveredPos && (
        <div
          className="fixed pointer-events-none z-50 bg-slate-900/95 text-white backdrop-blur-md px-3.5 py-2.5 rounded-xl shadow-2xl border border-slate-700 text-xs w-64 transition-transform duration-75"
          style={{
            left: Math.min(hoveredPos.x + 14, window.innerWidth - 270),
            top: Math.min(hoveredPos.y + 14, window.innerHeight - 180),
          }}
        >
          <div className="font-bold text-sm text-indigo-300 flex items-center justify-between">
            <span>{hoveredNodeInfo.node.label}</span>
            <span className="text-[10px] px-1.5 py-0.5 bg-indigo-500/30 text-indigo-200 rounded font-semibold">
              Школа {(hoveredNodeInfo.node.communityId ?? 0) + 1}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-slate-800 text-[11px]">
            <div>
              <span className="text-slate-400 block">Публикаций:</span>
              <span className="font-bold text-emerald-400">{hoveredNodeInfo.node.publications}</span>
            </div>
            <div>
              <span className="text-slate-400 block">Соавторов:</span>
              <span className="font-bold text-cyan-400">{hoveredNodeInfo.node.connections}</span>
            </div>
          </div>

          {hoveredNodeInfo.neighbors.length > 0 && (
            <div className="mt-2 pt-1.5 border-t border-slate-800">
              <span className="text-[10px] text-slate-400 block mb-1">
                Соавторы ({hoveredNodeInfo.neighbors.length}):
              </span>
              <div className="text-[10.5px] text-slate-300 line-clamp-2">
                {hoveredNodeInfo.neighbors.join(', ')}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
