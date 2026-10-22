import { Article, GraphNode, GraphLink, NetworkCommunity, NetworkStats, NetworkData } from '../types';

export const INITIAL_ARTICLES: Article[] = [
  {
    id: '1',
    title: 'Захаров В.Н., Леонтьев А.А., Рогов А.А., Сидоров Ю.В. ПРОГРАММНАЯ СИСТЕМА ПОДДЕРЖКИ АТРИБУЦИИ ТЕКСТОВ СТАТЕЙ Ф. М. ДОСТОЕВСКОГО // Труды Петрозаводского государственного университета. 2000. № 9. С. 113.',
    authors: ['Захаров В. Н.', 'Леонтьев А. А.', 'Рогов А. А.', 'Сидоров Ю. В.'],
    year: 2000,
    organization: 'ПетрГУ',
  },
  {
    id: '2',
    title: 'Вдовицын В.Т., Кузнецова В.П., Бедорев А.А., Крижановская Н.Б., Русаков С.М., Сорокин А.Д. СОЗДАНИЕ ЭЛЕКТРОННОЙ ВЕРСИИ АРХИВА ФОЛЬКЛОРНОЙ ФОНОТЕКИ ИЯЛИ КАРНЦ РАН // Электронные библиотеки: перспективные методы и технологии. RCDL 2000. С. 32-38.',
    authors: ['Вдовицын В. Т.', 'Кузнецова В. П.', 'Бедорев А. А.', 'Крижановская Н. Б.', 'Русаков С. М.', 'Сорокин А. Д.'],
    year: 2000,
    organization: 'КарНЦ РАН',
  },
  {
    id: '3',
    title: 'Варфоломеев А. Г., Москин Н. Д. Об электронной коллекции фольклорных песен с теоретико-графовой формализацией текстов // Сборник докладов III Всероссийской конференции RCDL 2001. Петрозаводск, 2001. С. 20.',
    authors: ['Варфоломеев А. Г.', 'Москин Н. Д.'],
    year: 2001,
    organization: 'ПетрГУ',
  },
  {
    id: '4',
    title: 'Варфоломеев А. Г., Кравцов И. В., Москин Н. Д. Информационная система по фольклорным песням Заонежья как инструмент формализации и классификации песен // Труды RCDL 2002. Дубна, 2002. Т. 2. С. 143-147.',
    authors: ['Варфоломеев А. Г.', 'Кравцов И. В.', 'Москин Н. Д.'],
    year: 2002,
    organization: 'ПетрГУ',
  },
  {
    id: '5',
    title: 'Сидоров Ю. В. Математическая и информационная поддержка методов обработки литературных текстов на основе формально-грамматических параметров : дис. канд. техн. наук. СПб, 2002. 127 с.',
    authors: ['Сидоров Ю. В.'],
    year: 2002,
    organization: 'ПетрГУ',
  },
  {
    id: '6',
    title: 'Вдовицын В. Т., Кузнецова В. П., Сорокин А. Д., Русаков С. М. Электронный научный архив ИЯЛИ КарНЦ РАН: архитектура и интеграция метаданных фонотеки // Научный сервис в сети Интернет. 2005.',
    authors: ['Вдовицын В. Т.', 'Кузнецова В. П.', 'Сорокин А. Д.', 'Русаков С. М.'],
    year: 2005,
    organization: 'КарНЦ РАН',
  },
  {
    id: '7',
    title: 'Варфоломеев А. Г., Москин Н. Д., Рогов А. А. Графовые модели и алгоритмы классификации структур фольклорных текстов // Ученые записки Петрозаводского государственного университета. 2012. № 8.',
    authors: ['Варфоломеев А. Г.', 'Москин Н. Д.', 'Рогов А. А.'],
    year: 2012,
    organization: 'ПетрГУ',
  },
  {
    id: '8',
    title: 'Гарскова И. М., Бородкин Л. И., Владимиров В. Н., Канищев В. В. Сетевой анализ историографии: динамика формирования межрегиональной компоненты сети АИК // Историческая информатика. 2017. № 4. С. 84-102.',
    authors: ['Гарскова И. М.', 'Бородкин Л. И.', 'Владимиров В. Н.', 'Канищев В. В.'],
    year: 2017,
    organization: 'ПетрГУ',
  },
  {
    id: '9',
    title: 'Рогов А. А., Сидоров Ю. В., Лебедев А. А., Мокерова Д. А. Байесовские модели атрибуции спорных публицистических текстов XIX века // Информационные технологии и вычислительные системы. 2020. № 3.',
    authors: ['Рогов А. А.', 'Сидоров Ю. В.', 'Лебедев А. А.', 'Мокерова Д. А.'],
    year: 2020,
    organization: 'ПетрГУ',
  },
  {
    id: '10',
    title: 'Воронов Р. В., Насадкина О. Ю., Москин Н. Д., Кириллов А. Н. Цифровая гуманитаристика и методы сетевого анализа междисциплинарных связей ПетрГУ и КарНЦ РАН // Труды КарНЦ РАН. 2024. № 7.',
    authors: ['Воронов Р. В.', 'Насадкина О. Ю.', 'Москин Н. Д.', 'Кириллов А. Н.'],
    year: 2024,
    organization: 'ПетрГУ / КарНЦ РАН',
  },
  {
    id: '11',
    title: 'Захаров В. Н., Рогов А. А., Сидоров Ю. В., Кипяткова И. С. Компьютерное моделирование и нейросетевой анализ авторского стиля в корпусе русской классики // Вестник ПетрГУ. 2026. № 1.',
    authors: ['Захаров В. Н.', 'Рогов А. А.', 'Сидоров Ю. В.', 'Кипяткова И. С.'],
    year: 2026,
    organization: 'ПетрГУ',
  },
  {
    id: '12',
    title: 'Вдовицын В. Т., Русаков С. М., Сорокин А. Д., Родионова А. П. Распределенный семантический репозиторий культурного наследия Карелии // Информационные ресурсы России. 2026. № 2.',
    authors: ['Вдовицын В. Т.', 'Русаков С. М.', 'Сорокин А. Д.', 'Родионова А. П.'],
    year: 2026,
    organization: 'КарНЦ РАН',
  },
  {
    id: '13',
    title: 'Варфоломеев А. Г., Москин Н. Д., Воронов Р. В., Насадкина О. Ю. Графовые базы данных в задачах наукометрического картографирования университетской науки // Цифровая гуманитаристика. 2026. № 1.',
    authors: ['Варфоломеев А. Г.', 'Москин Н. Д.', 'Воронов Р. В.', 'Насадкина О. Ю.'],
    year: 2026,
    organization: 'ПетрГУ / КарНЦ РАН',
  },
];

export const COMMUNITY_COLORS = [
  '#4f46e5', // Indigo
  '#059669', // Emerald
  '#d97706', // Amber
  '#dc2626', // Red
  '#8b5cf6', // Violet
  '#0284c7', // Sky
  '#db2777', // Pink
  '#65a30d', // Lime
];

/**
 * Calculates Brandes betweenness centrality for unweighted/weighted undirected graph
 */
function calculateBetweennessCentrality(
  nodes: string[],
  adj: Map<string, Map<string, number>>
): Map<string, number> {
  const cb = new Map<string, number>();
  for (const v of nodes) {
    cb.set(v, 0);
  }

  const n = nodes.length;
  if (n <= 2) return cb;

  for (const s of nodes) {
    const stack: string[] = [];
    const pred = new Map<string, string[]>();
    const sigma = new Map<string, number>();
    const dist = new Map<string, number>();

    for (const v of nodes) {
      pred.set(v, []);
      sigma.set(v, 0);
      dist.set(v, -1);
    }

    sigma.set(s, 1);
    dist.set(s, 0);

    const queue: string[] = [s];

    while (queue.length > 0) {
      const v = queue.shift()!;
      stack.push(v);

      const neighbors = adj.get(v) || new Map();
      for (const [w] of neighbors) {
        if (dist.get(w)! < 0) {
          dist.set(w, dist.get(v)! + 1);
          queue.push(w);
        }
        if (dist.get(w)! === dist.get(v)! + 1) {
          sigma.set(w, sigma.get(w)! + sigma.get(v)!);
          pred.get(w)!.push(v);
        }
      }
    }

    const delta = new Map<string, number>();
    for (const v of nodes) {
      delta.set(v, 0);
    }

    while (stack.length > 0) {
      const w = stack.pop()!;
      for (const v of pred.get(w)!) {
        const c = (sigma.get(v)! / sigma.get(w)!) * (1 + delta.get(w)!);
        delta.set(v, delta.get(v)! + c);
      }
      if (w !== s) {
        cb.set(w, cb.get(w)! + delta.get(w)!);
      }
    }
  }

  // Undirected graph correction (divide by 2) and normalization by (n-1)*(n-2)/2
  const scale = 1 / ((n - 1) * (n - 2));
  for (const v of nodes) {
    cb.set(v, (cb.get(v)! / 2) * scale * 2);
  }

  return cb;
}

/**
 * Greedy modularity community detection (Newman's algorithm)
 */
function detectCommunities(
  nodes: string[],
  adj: Map<string, Map<string, number>>,
  totalWeight: number
): NetworkCommunity[] {
  if (nodes.length === 0) return [];
  if (nodes.length === 1) {
    return [{ id: 0, members: [nodes[0]], size: 1, color: COMMUNITY_COLORS[0] }];
  }

  // Connected components first as base
  const visited = new Set<string>();
  const components: string[][] = [];

  for (const node of nodes) {
    if (!visited.has(node)) {
      const comp: string[] = [];
      const q = [node];
      visited.add(node);
      while (q.length > 0) {
        const cur = q.shift()!;
        comp.push(cur);
        const neighbors = adj.get(cur) || new Map();
        for (const [nbr] of neighbors) {
          if (!visited.has(nbr)) {
            visited.add(nbr);
            q.push(nbr);
          }
        }
      }
      components.push(comp);
    }
  }

  // For components with > 3 nodes, partition using modularity or Louvain style
  // If total edges is small, connected components or modularity split gives natural clusters
  const m = totalWeight > 0 ? totalWeight : 1;
  const resultCommunities: string[][] = [];

  for (const comp of components) {
    if (comp.length <= 4) {
      resultCommunities.push(comp);
      continue;
    }

    // Label propagation / greedy modularity within component
    // Initialize each node with its own label
    const labels = new Map<string, number>();
    comp.forEach((node, idx) => labels.set(node, idx));

    // Run label propagation iterations
    let changed = true;
    let iterations = 0;
    while (changed && iterations < 20) {
      changed = false;
      iterations++;
      for (const node of comp) {
        const nbrs = adj.get(node) || new Map();
        const weightByLabel = new Map<number, number>();
        for (const [nbr, wt] of nbrs) {
          const lbl = labels.get(nbr);
          if (lbl !== undefined) {
            weightByLabel.set(lbl, (weightByLabel.get(lbl) || 0) + wt);
          }
        }

        let bestLabel = labels.get(node)!;
        let maxWeight = -1;
        for (const [lbl, wt] of weightByLabel.entries()) {
          if (wt > maxWeight) {
            maxWeight = wt;
            bestLabel = lbl;
          }
        }

        if (bestLabel !== labels.get(node)) {
          labels.set(node, bestLabel);
          changed = true;
        }
      }
    }

    // Group by label
    const groups = new Map<number, string[]>();
    for (const node of comp) {
      const lbl = labels.get(node)!;
      if (!groups.has(lbl)) groups.set(lbl, []);
      groups.get(lbl)!.push(node);
    }

    for (const g of groups.values()) {
      resultCommunities.push(g);
    }
  }

  // Sort communities by size descending
  resultCommunities.sort((a, b) => b.length - a.length);

  return resultCommunities.map((members, idx) => ({
    id: idx,
    members: members.sort(),
    size: members.length,
    color: COMMUNITY_COLORS[idx % COMMUNITY_COLORS.length],
  }));
}

export function buildNetwork(articles: Article[]): NetworkData {
  const authorPubs = new Map<string, number>();
  const adj = new Map<string, Map<string, number>>();
  const edgeWeights = new Map<string, number>();

  // Process articles
  for (const article of articles) {
    const authors = article.authors.map((a) => a.trim()).filter(Boolean);
    for (const author of authors) {
      authorPubs.set(author, (authorPubs.get(author) || 0) + 1);
      if (!adj.has(author)) {
        adj.set(author, new Map());
      }
    }

    for (let i = 0; i < authors.length; i++) {
      for (let j = i + 1; j < authors.length; j++) {
        const a1 = authors[i];
        const a2 = authors[j];
        if (a1 === a2) continue;

        const a1Map = adj.get(a1)!;
        a1Map.set(a2, (a1Map.get(a2) || 0) + 1);

        const a2Map = adj.get(a2)!;
        a2Map.set(a1, (a2Map.get(a1) || 0) + 1);

        const edgeKey = a1 < a2 ? `${a1}:::${a2}` : `${a2}:::${a1}`;
        edgeWeights.set(edgeKey, (edgeWeights.get(edgeKey) || 0) + 1);
      }
    }
  }

  const authorList = Array.from(authorPubs.keys());
  let totalEdgeWeight = 0;
  const links: GraphLink[] = [];

  for (const [key, weight] of edgeWeights.entries()) {
    const [source, target] = key.split(':::');
    links.push({ source, target, weight });
    totalEdgeWeight += weight;
  }

  // Betweenness Centrality
  const betweenness = calculateBetweennessCentrality(authorList, adj);

  // Communities
  const communities = detectCommunities(authorList, adj, totalEdgeWeight);
  const authorToCommunity = new Map<string, number>();
  communities.forEach((comm) => {
    comm.members.forEach((member) => {
      authorToCommunity.set(member, comm.id);
    });
  });

  // Calculate additional SNA characteristics: Closeness Centrality, Clustering Coefficient, Weighted Degree
  const closenessMap = new Map<string, number>();
  const clusteringMap = new Map<string, number>();
  const weightedDegreeMap = new Map<string, number>();
  const authorOrgs = new Map<string, Map<string, number>>();

  for (const article of articles) {
    const authors = article.authors.map((a) => a.trim()).filter(Boolean);
    const org = article.organization?.trim() || 'ПетрГУ';
    for (const a of authors) {
      if (!authorOrgs.has(a)) authorOrgs.set(a, new Map());
      const orgMap = authorOrgs.get(a)!;
      orgMap.set(org, (orgMap.get(org) || 0) + 1);
    }
  }

  for (const author of authorList) {
    // Weighted Degree (Strength)
    let strength = 0;
    adj.get(author)?.forEach((wt) => {
      strength += wt;
    });
    weightedDegreeMap.set(author, strength);

    // Closeness Centrality (BFS shortest path)
    const dist = new Map<string, number>();
    const queue = [author];
    dist.set(author, 0);
    let totalDist = 0;
    let reachableCount = 0;

    while (queue.length > 0) {
      const curr = queue.shift()!;
      const d = dist.get(curr)!;
      const nbrs = adj.get(curr) || new Map();
      for (const [nbr] of nbrs) {
        if (!dist.has(nbr)) {
          dist.set(nbr, d + 1);
          totalDist += d + 1;
          reachableCount++;
          queue.push(nbr);
        }
      }
    }
    const cc = reachableCount > 0 && totalDist > 0 ? reachableCount / totalDist : 0;
    closenessMap.set(author, cc);

    // Local Clustering Coefficient
    const nbrs = Array.from(adj.get(author)?.keys() || []);
    const k = nbrs.length;
    if (k < 2) {
      clusteringMap.set(author, 0);
    } else {
      let triangles = 0;
      for (let i = 0; i < k; i++) {
        for (let j = i + 1; j < k; j++) {
          if (adj.get(nbrs[i])?.has(nbrs[j])) {
            triangles++;
          }
        }
      }
      const maxTriangles = (k * (k - 1)) / 2;
      clusteringMap.set(author, triangles / maxTriangles);
    }
  }

  const totalN = authorList.length;

  const UNIFORM_NODE_SIZE = 11;
  const nodes: GraphNode[] = authorList.map((author) => {
    const connections = adj.get(author)?.size || 0;
    const centrality = betweenness.get(author) || 0;
    const pubs = authorPubs.get(author) || 1;
    const weightedDegree = weightedDegreeMap.get(author) || connections;
    const closeness = closenessMap.get(author) || 0;
    const clusteringCoefficient = clusteringMap.get(author) || 0;
    const normalizedDegree = totalN > 1 ? connections / (totalN - 1) : 0;

    // Determine primary organization
    const orgMap = authorOrgs.get(author);
    let bestOrg = 'ПетрГУ';
    if (orgMap && orgMap.size > 0) {
      let maxCnt = -1;
      for (const [org, cnt] of orgMap.entries()) {
        if (cnt > maxCnt) {
          maxCnt = cnt;
          bestOrg = org;
        }
      }
    }

    return {
      id: author,
      label: author,
      connections,
      publications: pubs,
      centrality,
      normalizedDegree,
      weightedDegree,
      closeness,
      clusteringCoefficient,
      organization: bestOrg,
      size: UNIFORM_NODE_SIZE,
      communityId: authorToCommunity.get(author) ?? 0,
    };
  });

  const totalAuthors = nodes.length;
  const totalConnections = links.length;
  const networkDensity =
    totalAuthors > 1 ? (2 * totalConnections) / (totalAuthors * (totalAuthors - 1)) : 0;
  const avgCollaborators =
    totalAuthors > 0 ? (totalConnections * 2) / totalAuthors : 0;

  const stats: NetworkStats = {
    total_authors: totalAuthors,
    total_connections: totalConnections,
    network_density: networkDensity,
    total_articles: articles.length,
    average_collaborators: avgCollaborators,
  };

  return {
    nodes,
    links,
    stats,
    communities,
  };
}

/**
 * Export network as GraphML string (compatible with Gephi, Cytoscape, NetworkX)
 */
export function exportToGraphML(data: NetworkData): string {
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<graphml xmlns="http://graphml.graphdrawing.org/xmlns">\n';
  xml += '  <key id="label" for="node" attr.name="label" attr.type="string"/>\n';
  xml += '  <key id="pubs" for="node" attr.name="publications" attr.type="int"/>\n';
  xml += '  <key id="degree" for="node" attr.name="degree" attr.type="int"/>\n';
  xml += '  <key id="centrality" for="node" attr.name="betweenness" attr.type="double"/>\n';
  xml += '  <key id="community" for="node" attr.name="community" attr.type="int"/>\n';
  xml += '  <key id="weight" for="edge" attr.name="weight" attr.type="int"/>\n';
  xml += '  <graph id="AuthorCoauthorshipNetwork" edgedefault="undirected">\n';

  for (const node of data.nodes) {
    xml += `    <node id="${escapeXml(node.id)}">\n`;
    xml += `      <data key="label">${escapeXml(node.label)}</data>\n`;
    xml += `      <data key="pubs">${node.publications}</data>\n`;
    xml += `      <data key="degree">${node.connections}</data>\n`;
    xml += `      <data key="centrality">${node.centrality.toFixed(4)}</data>\n`;
    xml += `      <data key="community">${(node.communityId ?? 0) + 1}</data>\n`;
    xml += '    </node>\n';
  }

  data.links.forEach((link, idx) => {
    const sId = typeof link.source === 'object' ? (link.source as GraphNode).id : link.source;
    const tId = typeof link.target === 'object' ? (link.target as GraphNode).id : link.target;
    xml += `    <edge id="e${idx}" source="${escapeXml(sId)}" target="${escapeXml(tId)}">\n`;
    xml += `      <data key="weight">${link.weight}</data>\n`;
    xml += '    </edge>\n';
  });

  xml += '  </graph>\n</graphml>';
  return xml;
}

/**
 * Export network as CSV Edge List (Source,Target,Weight)
 */
export function exportToEdgeListCSV(data: NetworkData): string {
  const rows = ['Source,Target,Weight'];
  for (const link of data.links) {
    const sId = typeof link.source === 'object' ? (link.source as GraphNode).id : link.source;
    const tId = typeof link.target === 'object' ? (link.target as GraphNode).id : link.target;
    rows.push(`"${sId}","${tId}",${link.weight}`);
  }
  return rows.join('\n');
}

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
