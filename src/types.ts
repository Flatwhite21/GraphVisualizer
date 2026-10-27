export interface Article {
  id: string;
  title: string;
  authors: string[];
  year: number;
  journal?: string;
  organization?: string;
  keywords?: string[];
  doi?: string;
}

export interface AuthorStats {
  publications: number;
  connections: number;
  centrality: number;
  closeness?: number;
  degreeCentrality?: number;
}

export interface GraphNode {
  id: string;
  label: string;
  size: number;
  connections: number; // Degree (число соавторов)
  publications: number;
  centrality: number; // Betweenness Centrality
  normalizedDegree?: number;
  weightedDegree?: number; // Strength (сумма весов связей)
  closeness?: number; // Closeness Centrality
  clusteringCoefficient?: number; // Local Clustering Coefficient
  organization?: string;
  communityId?: number;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
}

export interface GraphLink {
  source: string | GraphNode;
  target: string | GraphNode;
  weight: number;
}

export interface NetworkCommunity {
  id: number;
  members: string[];
  size: number;
  color?: string;
}

export interface NetworkStats {
  total_authors: number;
  total_connections: number;
  network_density: number;
  total_articles: number;
  average_collaborators: number;
}

export interface NetworkData {
  nodes: GraphNode[];
  links: GraphLink[];
  stats: NetworkStats;
  communities: NetworkCommunity[];
}
