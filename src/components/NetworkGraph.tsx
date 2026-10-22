import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as d3 from 'd3';
import { GraphNode, GraphLink, NetworkCommunity } from '../types';
import { COMMUNITY_COLORS } from '../utils/networkAnalysis';
import { exportResearchersXLSX } from '../utils/exporter';
import { 
  ZoomIn, 
  ZoomOut, 
  Maximize2, 
  Sliders, 
  Download, 
  Palette, 
  Hash, 
  Compass,
  Spline,
  Layers,
  Sparkles,
  Filter,
  FileSpreadsheet
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
type EdgeShapeMode = 'curved' | 'straight';
type MinWeightFilter = 1 | 2 | 3;

/**
 * Calculates a smooth curved path between two nodes so lines do NOT tangle in the center
 */
function getCurvedLinkPath(
  s: { x?: number; y?: number; id: string },
  t: { x?: number; y?: number; id: string },
  curvature: number
): { path: string; midX: number; midY: number } {
  const x1 = s.x ?? 0;
  const y1 = s.y ?? 0;
  const x2 = t.x ?? 0;
  const y2 = t.y ?? 0;

  if (curvature <= 0.01) {
    return {
      path: `M ${x1} ${y1} L ${x2} ${y2}`,
      midX: (x1 + x2) / 2,
      midY: (y1 + y2) / 2,
    };
  }

  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.hypot(dx, dy) || 1;

  // Deterministic direction based on string comparison so arcs curve consistently outwards
  const sign = s.id < t.id ? 1 : -1;
  const normX = -dy / dist;
  const normY = dx / dist;

  // Offset arc apex gently, scaled with distance to avoid excessive bulging
  const offset = Math.min(dist * 0.22, 38) * curvature * sign;

  const midX = (x1 + x2) / 2 + normX * offset;
  const midY = (y1 + y2) / 2 + normY * offset;

  return {
    path: `M ${x1} ${y1} Q ${midX} ${midY} ${x2} ${y2}`,
    midX,
    midY,
  };
}

/**
 * Generate smooth padded hull points for a community of nodes
 */
function getCommunityHullPath(nodes: GraphNode[], padding = 35): string | null {
  if (nodes.length === 0) return null;

  const points: [number, number][] = nodes
    .filter((n) => n.x !== undefined && n.y !== undefined)
    .map((n) => [n.x as number, n.y as number]);

  if (points.length === 0) return null;

  if (points.length === 1) {
    const [cx, cy] = points[0];
    return `M ${cx - padding} ${cy} A ${padding} ${padding} 0 1 0 ${cx + padding} ${cy} A ${padding} ${padding} 0 1 0 ${cx - padding} ${cy} Z`;
  }

  if (points.length === 2) {
    const [p1, p2] = points;
    const dx = p2[0] - p1[0];
    const dy = p2[1] - p1[1];
    const dist = Math.hypot(dx, dy) || 1;
    const nx = (-dy / dist) * padding;
    const ny = (dx / dist) * padding;

    return `M ${p1[0] + nx} ${p1[1] + ny} L ${p2[0] + nx} ${p2[1] + ny} A ${padding} ${padding} 0 0 1 ${p2[0] - nx} ${p2[1] - ny} L ${p1[0] - nx} ${p1[1] - ny} A ${padding} ${padding} 0 0 1 ${p1[0] + nx} ${p1[1] + ny} Z`;
  }

  // Polygon hull for 3+ points
  const hull = d3.polygonHull(points);
  if (!hull || hull.length < 3) return null;

  // Expand hull points outwards from centroid
  const centroid = d3.polygonCentroid(hull);
  const expandedHull = hull.map(([x, y]) => {
    const vx = x - centroid[0];
    const vy = y - centroid[1];
    const len = Math.hypot(vx, vy) || 1;
    return [x + (vx / len) * padding, y + (vy / len) * padding] as [number, number];
  });

  const lineGen = d3
    .line<[number, number]>()
    .x((d) => d[0])
    .y((d) => d[1])
    .curve(d3.curveCatmullRomClosed.alpha(0.5));

  return lineGen(expandedHull);
}

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

  // Readability & Display Controls
  const [edgeShape, setEdgeShape] = useState<EdgeShapeMode>('curved');
  const [curvatureAmount, setCurvatureAmount] = useState<number>(0.35); // 0 (straight) to 0.75 (pronounced arc)
  const [showEdgeWeights, setShowEdgeWeights] = useState<boolean>(true);
  const [labelMode, setLabelMode] = useState<LabelMode>('smart');
  const [linkDistanceMult, setLinkDistanceMult] = useState<number>(1.45); // Generous default distance for clarity
  const [chargeStrength, setChargeStrength] = useState<number>(-1150); // Stronger repulsion so nodes breathe
  const [enableCommunityClustering, setEnableCommunityClustering] = useState<boolean>(true);
  const [showCommunityHulls, setShowCommunityHulls] = useState<boolean>(false);
  const [inGraphMinWeight, setInGraphMinWeight] = useState<MinWeightFilter>(1);
  const [hoveredAuthorId, setHoveredAuthorId] = useState<string | null>(null);
  const [hoveredLinkId, setHoveredLinkId] = useState<string | null>(null);
  const [hoveredPos, setHoveredPos] = useState<{ x: number; y: number } | null>(null);
  const [showSettings, setShowSettings] = useState<boolean>(false);

  // Filter links for display by in-graph minimum weight threshold
  const activeLinks = useMemo(() => {
    if (inGraphMinWeight <= 1) return links;
    return links.filter((l) => l.weight >= inGraphMinWeight);
  }, [links, inGraphMinWeight]);

  // Fast neighbor lookup
  const neighborMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    nodes.forEach((n) => map.set(n.id, new Set()));
    activeLinks.forEach((l) => {
      const s = typeof l.source === 'object' ? (l.source as GraphNode).id : l.source;
      const t = typeof l.target === 'object' ? (l.target as GraphNode).id : l.target;
      if (!map.has(s)) map.set(s, new Set());
      if (!map.has(t)) map.set(t, new Set());
      map.get(s)!.add(t);
      map.get(t)!.add(s);
    });
    return map;
  }, [nodes, activeLinks]);

  // Prominent nodes for smart label mode
  const prominentNodeIds = useMemo(() => {
    const sorted = [...nodes].sort((a, b) => b.connections - a.connections);
    const topCount = Math.max(8, Math.ceil(nodes.length * 0.35));
    const topIds = new Set(sorted.slice(0, topCount).map((n) => n.id));
    nodes.forEach((n) => {
      if (n.connections >= 2) topIds.add(n.id);
    });
    return topIds;
  }, [nodes]);

  // Hovered author details for floating tooltip card
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

    const width = containerRef.current.clientWidth || 920;
    const height = containerRef.current.clientHeight || 660;
    const padding = 80;

    const graphWidth = maxX - minX + padding * 2;
    const graphHeight = maxY - minY + padding * 2;

    const scale = Math.max(0.18, Math.min(1.6, Math.min(width / graphWidth, height / graphHeight)));
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
    const width = container.clientWidth || 920;
    const height = container.clientHeight || 660;

    // Deep copy data for D3 mutation
    const nodesCopy: (GraphNode & d3.SimulationNodeDatum)[] = nodes.map((d) => ({ ...d }));
    const linksCopy: (GraphLink & d3.SimulationLinkDatum<GraphNode>)[] = activeLinks.map((d) => ({
      ...d,
      source: typeof d.source === 'object' ? (d.source as GraphNode).id : d.source,
      target: typeof d.target === 'object' ? (d.target as GraphNode).id : d.target,
    }));

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    svg.attr('width', width).attr('height', height);

    // Defs
    const defs = svg.append('defs');
    
    // Soft shadow
    const filter = defs.append('filter').attr('id', 'node-shadow').attr('height', '150%').attr('width', '150%');
    filter.append('feDropShadow')
      .attr('dx', '0')
      .attr('dy', '2.5')
      .attr('stdDeviation', '3')
      .attr('flood-color', '#0f172a')
      .attr('flood-opacity', '0.22');

    // Glow filter for active nodes
    const glow = defs.append('filter').attr('id', 'glow-active').attr('x', '-35%').attr('y', '-35%').attr('width', '170%').attr('height', '170%');
    glow.append('feGaussianBlur').attr('stdDeviation', '4').attr('result', 'coloredBlur');
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

    // Spatial cluster layout: spread community anchors well apart across 2D plane
    const commCount = Math.max(1, communities.length);
    const commRadius = Math.min(width, height) * 0.42; // Farther apart so clusters do not overlap
    const commCenters = communities.map((_, i) => {
      const angle = (i / commCount) * 2 * Math.PI - Math.PI / 2;
      return {
        x: width / 2 + Math.cos(angle) * commRadius,
        y: height / 2 + Math.sin(angle) * commRadius,
      };
    });

    nodesCopy.forEach((node) => {
      const cId = node.communityId ?? 0;
      const center = commCenters[cId % commCenters.length] || { x: width / 2, y: height / 2 };
      if (node.x === undefined) {
        node.x = center.x + (Math.random() - 0.5) * 160;
        node.y = center.y + (Math.random() - 0.5) * 160;
      }
    });

    // Custom force: pulls nodes gently to their community home anchor
    function communityForce(alpha: number) {
      if (!enableCommunityClustering) return;
      const strength = 0.18 * alpha;
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

    // Force Simulation with generous distance and strong repulsion
    const baseDistance = 135 * linkDistanceMult;

    const simulation = d3.forceSimulation<GraphNode>(nodesCopy)
      .force(
        'link',
        d3.forceLink<GraphNode, GraphLink>(linksCopy)
          .id((d) => d.id)
          .distance((d) => {
            // Tighter distance for strong coauthors, longer distance for single paper
            const factor = Math.max(0.7, 1.25 - (d.weight - 1) * 0.18);
            return baseDistance * factor;
          })
          .strength(0.35)
      )
      .force(
        'charge',
        d3.forceManyBody()
          .strength(chargeStrength)
          .distanceMax(950)
      )
      .force('center', d3.forceCenter(width / 2, height / 2).strength(0.025)) // Gentle centering so nodes don't bunch into a knot
      .force(
        'collision',
        d3.forceCollide<GraphNode>()
          .radius(UNIFORM_RADIUS + 24) // Generous collision radius to prevent overlapping
          .strength(0.9)
      )
      .force('community', communityForce);

    simulationRef.current = simulation;

    // Community Background Enclosure Hulls (Visual Bubbles)
    const hullsGroup = g.append('g').attr('class', 'community-hulls');
    const hullSelection = hullsGroup
      .selectAll('path')
      .data(communities)
      .enter()
      .append('path')
      .attr('class', 'community-hull')
      .attr('fill', (c) => COMMUNITY_COLORS[c.id % COMMUNITY_COLORS.length])
      .attr('fill-opacity', showCommunityHulls ? 0.08 : 0)
      .attr('stroke', (c) => COMMUNITY_COLORS[c.id % COMMUNITY_COLORS.length])
      .attr('stroke-width', 1.5)
      .attr('stroke-dasharray', '5,5')
      .attr('stroke-opacity', showCommunityHulls ? 0.35 : 0)
      .style('pointer-events', 'none')
      .style('transition', 'fill-opacity 0.25s, stroke-opacity 0.25s');

    // Community Label Tags on the canvas
    const hullLabelsGroup = g.append('g').attr('class', 'community-hull-labels');
    const hullLabelsSelection = hullLabelsGroup
      .selectAll('text')
      .data(communities)
      .enter()
      .append('text')
      .attr('class', 'community-hull-label')
      .text((c) => `Научная школа ${c.id + 1} (${c.size} авт.)`)
      .attr('font-size', '11px')
      .attr('font-weight', '700')
      .attr('fill', (c) => COMMUNITY_COLORS[c.id % COMMUNITY_COLORS.length])
      .attr('opacity', showCommunityHulls ? 0.75 : 0)
      .style('pointer-events', 'none');

    // Effective curvature value
    const activeCurvature = edgeShape === 'curved' ? curvatureAmount : 0;

    // Links group using curved SVG Paths (<path>) rather than intersecting straight lines
    const linkGroup = g.append('g').attr('class', 'links');
    const linkSelection = linkGroup
      .selectAll('path')
      .data(linksCopy)
      .enter()
      .append('path')
      .attr('class', 'link')
      .attr('stroke', (d) => getSequentialBlueLinkColor(d.weight))
      .attr('stroke-opacity', (d) => (d.weight >= 2 ? 0.85 : 0.55))
      .attr('stroke-width', UNIFORM_EDGE_WIDTH)
      .attr('fill', 'none')
      .attr('stroke-linecap', 'round')
      .style('cursor', 'pointer')
      .on('mouseenter', function (event, d) {
        const s = typeof d.source === 'object' ? (d.source as GraphNode).id : String(d.source);
        const t = typeof d.target === 'object' ? (d.target as GraphNode).id : String(d.target);
        const lKey = `${s}__${t}`;
        d3.select(this)
          .attr('stroke-width', UNIFORM_EDGE_WIDTH + 2.5)
          .attr('stroke-opacity', 1);
        setHoveredLinkId(lKey);
        setHoveredAuthorId(s);
        setHoveredPos({ x: event.clientX, y: event.clientY });
      })
      .on('mouseleave', function (event, d) {
        d3.select(this)
          .attr('stroke-width', UNIFORM_EDGE_WIDTH)
          .attr('stroke-opacity', d.weight >= 2 ? 0.85 : 0.55);
        setHoveredLinkId(null);
        setHoveredAuthorId(null);
        setHoveredPos(null);
      });

    // Tooltip on links
    linkSelection.append('title').text((d) => {
      const s = typeof d.source === 'object' ? (d.source as GraphNode).id : d.source;
      const t = typeof d.target === 'object' ? (d.target as GraphNode).id : d.target;
      return `Соавторство: ${s} ⟷ ${t}\nСовместных статей: ${d.weight}`;
    });

    // Edge weights badges group (clean pills placed at curved midpoint)
    const edgeWeightsGroup = g.append('g').attr('class', 'edge-weights');
    const edgeWeightsSelection = edgeWeightsGroup
      .selectAll('g')
      .data(linksCopy.filter((d) => d.weight >= 2)) // Only show numbers for repeated coauthorship
      .enter()
      .append('g')
      .attr('class', 'edge-weight-badge')
      .style('pointer-events', 'none')
      .style('opacity', showEdgeWeights ? 1 : 0);

    // Badge background rect
    edgeWeightsSelection
      .append('rect')
      .attr('width', 16)
      .attr('height', 14)
      .attr('x', -8)
      .attr('y', -7)
      .attr('rx', 4)
      .attr('fill', '#ffffff')
      .attr('stroke', (d) => (d.weight >= 3 ? '#1d4ed8' : '#93c5fd'))
      .attr('stroke-width', 1.2)
      .attr('filter', 'drop-shadow(0 1px 2px rgba(0,0,0,0.12))');

    // Badge text
    edgeWeightsSelection
      .append('text')
      .text((d) => `${d.weight}`)
      .attr('text-anchor', 'middle')
      .attr('dy', '0.35em')
      .attr('font-size', '9.5px')
      .attr('font-weight', '800')
      .attr('fill', (d) => (d.weight >= 3 ? '#0f172a' : '#1d4ed8'));

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

    // Simulation tick handler
    simulation.on('tick', () => {
      // 1. Update Curved Paths (<path>)
      linkSelection.attr('d', (d) => {
        const s = d.source as GraphNode;
        const t = d.target as GraphNode;
        return getCurvedLinkPath(s, t, activeCurvature).path;
      });

      // 2. Update Edge Weight Badges to curve midpoint
      edgeWeightsSelection.attr('transform', (d) => {
        const s = d.source as GraphNode;
        const t = d.target as GraphNode;
        const { midX, midY } = getCurvedLinkPath(s, t, activeCurvature);
        return `translate(${midX}, ${midY})`;
      });

      // 3. Update Nodes
      nodeSelection
        .attr('cx', (d) => d.x ?? 0)
        .attr('cy', (d) => d.y ?? 0);

      // 4. Update Node Labels
      labelsSelection
        .attr('x', (d) => d.x ?? 0)
        .attr('y', (d) => d.y ?? 0);

      // 5. Update Community Enclosure Hulls
      if (showCommunityHulls) {
        hullSelection.attr('d', (comm) => {
          const commNodes = nodesCopy.filter((n) => n.communityId === comm.id);
          return getCommunityHullPath(commNodes) || '';
        });

        hullLabelsSelection
          .attr('x', (comm) => {
            const commNodes = nodesCopy.filter((n) => n.communityId === comm.id && n.x !== undefined);
            if (commNodes.length === 0) return 0;
            return d3.mean(commNodes, (n) => n.x as number) ?? 0;
          })
          .attr('y', (comm) => {
            const commNodes = nodesCopy.filter((n) => n.communityId === comm.id && n.y !== undefined);
            if (commNodes.length === 0) return 0;
            const minY = d3.min(commNodes, (n) => n.y as number) ?? 0;
            return minY - 28;
          });
      }
    });

    // Click on canvas background clears selection
    svg.on('click', () => {
      onSelectAuthor(null);
    });

    // Automatic smooth fit to view after physics stabilizes
    const timer = setTimeout(() => {
      handleFitToView();
    }, 450);

    return () => {
      clearTimeout(timer);
      simulation.stop();
    };
  }, [
    nodes,
    activeLinks,
    communities,
    colorByCommunity,
    linkDistanceMult,
    chargeStrength,
    enableCommunityClustering,
    showCommunityHulls,
    edgeShape,
    curvatureAmount,
    simulationTrigger,
  ]);

  // Dynamic visual updates for Hover and Selection
  useEffect(() => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);
    const nodesSel = svg.selectAll<SVGCircleElement, GraphNode>('.node');
    const linksSel = svg.selectAll<SVGPathElement, GraphLink>('.link');
    const labelsSel = svg.selectAll<SVGTextElement, GraphNode>('.node-label');
    const weightsSel = svg.selectAll<SVGGElement, GraphLink>('.edge-weight-badge');

    const activeFocusId = hoveredAuthorId || selectedAuthorId;
    const activeNeighbors = activeFocusId ? neighborMap.get(activeFocusId) : null;

    if (!activeFocusId) {
      // Default state: clean, comfortable visibility
      nodesSel
        .attr('stroke', '#ffffff')
        .attr('stroke-width', 2.4)
        .attr('opacity', 1)
        .attr('filter', 'url(#node-shadow)');

      linksSel
        .attr('stroke', (d) => getSequentialBlueLinkColor(d.weight))
        .attr('stroke-opacity', (d) => (d.weight >= 2 ? 0.85 : 0.55))
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
      // Focused state: highlight ego-network, dim all un-associated lines to ultra-low opacity
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
            .attr('stroke-width', 1)
            .attr('opacity', 0.12)
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
            .attr('stroke-opacity', 0.04) // Dims non-incident lines to almost invisible, eliminating tangling
            .attr('stroke-width', 1);
        }
      });

      weightsSel.each(function (d) {
        const sId = typeof d.source === 'object' ? (d.source as GraphNode).id : d.source;
        const tId = typeof d.target === 'object' ? (d.target as GraphNode).id : d.target;
        const isIncident = sId === activeFocusId || tId === activeFocusId;
        d3.select(this).attr('opacity', isIncident && showEdgeWeights ? 1 : 0.02);
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
          sel.attr('opacity', 0.06);
        }
      });
    }
  }, [hoveredAuthorId, selectedAuthorId, labelMode, prominentNodeIds, showEdgeWeights, neighborMap]);

  // Layout presets
  const applyPreset = (preset: 'spacious' | 'balanced' | 'compact') => {
    if (preset === 'spacious') {
      setLinkDistanceMult(1.9);
      setChargeStrength(-1550);
      setEdgeShape('curved');
      setCurvatureAmount(0.42);
    } else if (preset === 'balanced') {
      setLinkDistanceMult(1.45);
      setChargeStrength(-1150);
      setEdgeShape('curved');
      setCurvatureAmount(0.35);
    } else {
      setLinkDistanceMult(1.0);
      setChargeStrength(-700);
      setEdgeShape('curved');
      setCurvatureAmount(0.25);
    }
  };

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
    <div className="relative w-full h-[680px] graph-canvas-container overflow-hidden rounded-b-xl border-t border-slate-200" ref={containerRef}>
      <svg ref={svgRef} className="w-full h-full block cursor-grab active:cursor-grabbing" />

      {/* Top Left: Status & In-Graph Controls */}
      <div className="absolute top-3.5 left-3.5 flex flex-col gap-2 z-10">
        <div className="bg-white/95 backdrop-blur-md px-3.5 py-2 rounded-xl text-xs text-slate-700 shadow-sm border border-slate-200/90 flex items-center gap-2.5">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="font-bold text-slate-800">{nodes.length} исследователей</span>
          <span className="text-slate-300">|</span>
          <span className="text-slate-600 font-medium">{activeLinks.length} связей соавторства</span>
        </div>

        {/* In-Graph Link Threshold Filter (Reduces tangling with 1-click) */}
        <div className="bg-white/95 backdrop-blur-md p-1 rounded-xl text-xs shadow-sm border border-slate-200/90 flex items-center gap-1">
          <span className="text-[10.5px] font-bold text-slate-500 px-2 flex items-center gap-1">
            <Filter className="w-3 h-3 text-indigo-600" />
            Связи:
          </span>
          <button
            type="button"
            onClick={() => setInGraphMinWeight(1)}
            className={`px-2 py-0.5 rounded-lg text-[11px] font-semibold transition cursor-pointer ${
              inGraphMinWeight === 1
                ? 'bg-indigo-600 text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            Все (1+)
          </button>
          <button
            type="button"
            onClick={() => setInGraphMinWeight(2)}
            title="Скрыть разовые статьи, оставить только повторное соавторство"
            className={`px-2 py-0.5 rounded-lg text-[11px] font-semibold transition cursor-pointer ${
              inGraphMinWeight === 2
                ? 'bg-indigo-600 text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            Крепкие (2+)
          </button>
          <button
            type="button"
            onClick={() => setInGraphMinWeight(3)}
            title="Оставить только устойчивое ядро научных коллективов"
            className={`px-2 py-0.5 rounded-lg text-[11px] font-semibold transition cursor-pointer ${
              inGraphMinWeight === 3
                ? 'bg-indigo-600 text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            Ядро (3+)
          </button>
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
        <div className="absolute top-16 right-3.5 bg-white/98 backdrop-blur-md p-4 rounded-xl shadow-xl border border-slate-200 w-80 z-20 space-y-3.5 text-xs">
          <div className="flex justify-between items-center pb-2 border-b border-slate-100">
            <span className="font-bold text-slate-900 flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-indigo-600" />
              Параметры читаемости графа
            </span>
            <button
              type="button"
              onClick={() => setShowSettings(false)}
              className="text-slate-400 hover:text-slate-700 font-bold text-sm"
            >
              ✕
            </button>
          </div>

          {/* Quick Presets */}
          <div>
            <span className="text-[11px] font-semibold text-slate-600 block mb-1.5">Готовые пресеты:</span>
            <div className="grid grid-cols-3 gap-1 bg-slate-100 p-0.5 rounded-lg text-[11px]">
              <button
                type="button"
                onClick={() => applyPreset('spacious')}
                className={`py-1 rounded-md font-semibold transition cursor-pointer ${
                  linkDistanceMult >= 1.8 ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Просторный
              </button>
              <button
                type="button"
                onClick={() => applyPreset('balanced')}
                className={`py-1 rounded-md font-semibold transition cursor-pointer ${
                  linkDistanceMult > 1.2 && linkDistanceMult < 1.8 ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Базовый
              </button>
              <button
                type="button"
                onClick={() => applyPreset('compact')}
                className={`py-1 rounded-md font-semibold transition cursor-pointer ${
                  linkDistanceMult <= 1.2 ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Компактный
              </button>
            </div>
          </div>

          {/* Line Shape (Curved Arcs vs Straight) */}
          <div className="pt-2 border-t border-slate-100">
            <div className="flex justify-between items-center mb-1.5">
              <span className="text-slate-700 font-medium flex items-center gap-1">
                <Spline className="w-3.5 h-3.5 text-indigo-600" />
                Форма связей:
              </span>
              <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg text-[11px]">
                <button
                  type="button"
                  onClick={() => setEdgeShape('curved')}
                  className={`px-2 py-0.5 rounded-md font-semibold transition cursor-pointer ${
                    edgeShape === 'curved' ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-600'
                  }`}
                >
                  Дуги (без наложений)
                </button>
                <button
                  type="button"
                  onClick={() => setEdgeShape('straight')}
                  className={`px-2 py-0.5 rounded-md font-semibold transition cursor-pointer ${
                    edgeShape === 'straight' ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-600'
                  }`}
                >
                  Прямые
                </button>
              </div>
            </div>

            {edgeShape === 'curved' && (
              <div className="mt-2">
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-slate-500">Кривизна дуг:</span>
                  <span className="font-mono text-indigo-600 font-bold">{Math.round(curvatureAmount * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="0.75"
                  step="0.05"
                  value={curvatureAmount}
                  onChange={(e) => setCurvatureAmount(Number(e.target.value))}
                  className="w-full accent-indigo-600 cursor-pointer"
                />
              </div>
            )}
          </div>

          {/* Spacing distance */}
          <div className="pt-2 border-t border-slate-100">
            <div className="flex justify-between mb-1">
              <span className="text-slate-600 font-medium">Расстояние между узлами:</span>
              <span className="font-mono text-indigo-600 font-semibold">{Math.round(linkDistanceMult * 100)}%</span>
            </div>
            <input
              type="range"
              min="0.8"
              max="2.4"
              step="0.1"
              value={linkDistanceMult}
              onChange={(e) => setLinkDistanceMult(Number(e.target.value))}
              className="w-full accent-indigo-600 cursor-pointer"
            />
          </div>

          {/* Repulsion charge */}
          <div>
            <div className="flex justify-between mb-1">
              <span className="text-slate-600 font-medium">Сила отталкивания:</span>
              <span className="font-mono text-indigo-600 font-semibold">{Math.abs(chargeStrength)}</span>
            </div>
            <input
              type="range"
              min="500"
              max="2000"
              step="50"
              value={Math.abs(chargeStrength)}
              onChange={(e) => setChargeStrength(-Number(e.target.value))}
              className="w-full accent-indigo-600 cursor-pointer"
            />
          </div>

          {/* Community Hulls & Clusters */}
          <div className="pt-2 border-t border-slate-100 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-slate-600 font-medium flex items-center gap-1">
                <Layers className="w-3.5 h-3.5 text-indigo-600" />
                Контуры научных школ:
              </span>
              <button
                type="button"
                onClick={() => setShowCommunityHulls(!showCommunityHulls)}
                className={`px-2.5 py-0.5 rounded-md text-[11px] font-semibold transition ${
                  showCommunityHulls ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {showCommunityHulls ? 'Вкл' : 'Выкл'}
              </button>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-600 font-medium">Группировка по школам:</span>
              <button
                type="button"
                onClick={() => setEnableCommunityClustering(!enableCommunityClustering)}
                className={`px-2.5 py-0.5 rounded-md text-[11px] font-semibold transition ${
                  enableCommunityClustering ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {enableCommunityClustering ? 'Вкл' : 'Выкл'}
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={handleFitToView}
            className="w-full py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-lg text-xs flex items-center justify-center gap-1.5 transition cursor-pointer border border-indigo-200"
          >
            <Compass className="w-3.5 h-3.5" />
            Центрировать и выровнять граф
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

        {/* Layout & Anti-tangling Settings Button */}
        <button
          type="button"
          onClick={() => setShowSettings(!showSettings)}
          title="Настройки раскладки, дуг и предотвращения сплетения линий"
          className={`h-8 px-2.5 flex items-center gap-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
            showSettings ? 'bg-indigo-600 text-white shadow-xs' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
          <span>Раскладка и дуги</span>
        </button>

        <div className="w-px h-5 bg-slate-200 mx-0.5" />

        {/* Zoom Fit */}
        <button
          type="button"
          onClick={handleFitToView}
          title="Вписать граф в окно"
          className="h-8 px-2.5 flex items-center gap-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition cursor-pointer"
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

        {/* Reset Zoom */}
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

        {/* Export Excel (.xlsx) */}
        <button
          type="button"
          onClick={() => exportResearchersXLSX(nodes, links, communities)}
          title="Скачать числовые характеристики исследователей в Excel (.xlsx)"
          className="h-8 px-2.5 flex items-center gap-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-semibold transition cursor-pointer border border-emerald-300"
        >
          <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
          <span>Excel</span>
        </button>
      </div>

      {/* Floating Hover Tooltip Card */}
      {hoveredNodeInfo && hoveredPos && (
        <div
          className="fixed pointer-events-none z-50 bg-slate-900/95 text-white backdrop-blur-md px-4 py-3 rounded-xl shadow-2xl border border-slate-700 text-xs w-72 transition-transform duration-75"
          style={{
            left: Math.min(hoveredPos.x + 14, window.innerWidth - 310),
            top: Math.min(hoveredPos.y + 14, window.innerHeight - 200),
          }}
        >
          <div className="font-bold text-sm text-indigo-300 flex items-center justify-between">
            <span>{hoveredNodeInfo.node.label}</span>
            <span className="text-[10px] px-2 py-0.5 bg-indigo-500/30 text-indigo-200 rounded-full font-semibold">
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
            <div className="mt-2.5 pt-2 border-t border-slate-800">
              <span className="text-[10.5px] text-slate-400 block mb-1">
                Соавторы ({hoveredNodeInfo.neighbors.length}):
              </span>
              <div className="text-[11px] text-slate-200 line-clamp-3 leading-snug">
                {hoveredNodeInfo.neighbors.join(', ')}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
