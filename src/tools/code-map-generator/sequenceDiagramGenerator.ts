import { GraphNode, GraphEdge } from './graphBuilder.js';
import logger from '../../logger.js';
import path from 'path';
import fs from 'fs/promises';
import { CodeMapGeneratorConfig } from './types.js';
import { writeFileSecure } from './fsUtils.js';
import { getOutputDirectory } from './directoryUtils.js';

/**
 * Represents a method call in a sequence
 */
export interface MethodCall {
  from: string; // Caller ID
  to: string;   // Callee ID
  message: string; // The method call message
  isAsync: boolean; // Whether the call is asynchronous
  order: number; // Order in the sequence
}

/**
 * Represents a participant in a sequence diagram
 */
export interface SequenceParticipant {
  id: string; // Unique identifier
  label: string; // Display label
  type: 'class' | 'function' | 'method'; // Type of participant
  filePath?: string; // File path where the participant is defined
}

/**
 * Sanitizes a string for use in Mermaid diagrams
 * @param text Text to sanitize
 * @returns Sanitized text
 */
function sanitizeMermaidText(text: string): string {
  // Replace characters that might break Mermaid syntax or display poorly
  return text.replace(/["`]/g, "'").replace(/\n/g, ' ').substring(0, 80);
}

/**
 * Generates a unique ID for a participant that's safe for Mermaid
 * @param id Original ID
 * @returns Safe ID for Mermaid
 */
function generateSafeMermaidId(id: string): string {
  // Replace characters that might cause issues in Mermaid IDs
  // Then create a hash if the ID is too long
  const safeId = id.replace(/[^a-zA-Z0-9]/g, '_');
  if (safeId.length > 30) {
    return `${safeId.substring(0, 20)}_${Math.abs(hashString(id) % 10000)}`;
  }
  return safeId;
}

/**
 * Simple string hashing function
 * @param str String to hash
 * @returns Hash value
 */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash;
}

/**
 * Extracts method call sequences from function nodes and edges
 * @param nodes Function and method nodes
 * @param edges Call edges between functions/methods
 * @param maxCalls Maximum number of calls to include in the sequence
 * @returns Array of method calls in sequence
 */
export function extractMethodCallSequences(
  nodes: GraphNode[],
  edges: GraphEdge[],
  maxCalls: number = 0  // Changed from 20 to 0 to disable sequence diagrams
): MethodCall[] {
  // Return empty array when sequence diagrams are disabled
  if (maxCalls === 0) {
    return [];
  }
  // Filter nodes to only include functions and methods
  const functionNodes = nodes.filter(n => n.type === 'function' || n.type === 'method');

  // Create a map of node IDs to nodes for quick lookup
  const nodeMap = new Map<string, GraphNode>();
  functionNodes.forEach(node => nodeMap.set(node.id, node));

  // Filter edges to only include calls between functions/methods
  const callEdges = edges.filter(e =>
    nodeMap.has(e.from) &&
    nodeMap.has(e.to) &&
    e.label?.includes('call')
  );

  // Sort edges by source file and position to approximate call order
  const sortedEdges = [...callEdges].sort((a, b) => {
    const nodeA = nodeMap.get(a.from);
    const nodeB = nodeMap.get(b.from);

    if (!nodeA || !nodeB) return 0;

    // First sort by file path
    if (nodeA.filePath !== nodeB.filePath) {
      return (nodeA.filePath || '').localeCompare(nodeB.filePath || '');
    }

    // Then try to sort by position in file if available
    // This is a heuristic and not always accurate
    return 0;
  });

  // Limit to max calls
  const limitedEdges = sortedEdges.slice(0, maxCalls);

  // Convert edges to method calls
  const methodCalls: MethodCall[] = limitedEdges.map((edge, index) => {
    const fromNode = nodeMap.get(edge.from);
    const toNode = nodeMap.get(edge.to);

    // Determine if the call is async based on node properties or naming conventions
    const isAsync = fromNode?.comment?.includes('async') ||
                   edge.from.includes('Async') ||
                   edge.to.includes('Async');

    // Extract method names from node labels or IDs
    const fromName = fromNode?.label?.split(' — ')[0] ||
                    edge.from.split('::').pop() ||
                    edge.from;

    const toName = toNode?.label?.split(' — ')[0] ||
                  edge.to.split('::').pop() ||
                  edge.to;

    return {
      from: edge.from,
      to: edge.to,
      message: `${fromName} calls ${toName}`,
      isAsync,
      order: index
    };
  });

  return methodCalls;
}

/**
 * Extracts participants from method calls
 * @param methodCalls Array of method calls
 * @param nodes All nodes in the graph
 * @returns Array of unique participants
 */
export function extractParticipants(
  methodCalls: MethodCall[],
  nodes: GraphNode[]
): SequenceParticipant[] {
  // Create a set of unique participant IDs
  const participantIds = new Set<string>();
  methodCalls.forEach(call => {
    participantIds.add(call.from);
    participantIds.add(call.to);
  });

  // Create a map of node IDs to nodes for quick lookup
  const nodeMap = new Map<string, GraphNode>();
  nodes.forEach(node => nodeMap.set(node.id, node));

  // Convert participant IDs to participant objects
  const participants: SequenceParticipant[] = Array.from(participantIds).map(id => {
    const node = nodeMap.get(id);

    // Extract a readable label from the node
    const label = node?.label?.split(' — ')[0] || id.split('::').pop() || id;

    // Determine the type of participant
    const type = node?.type as 'function' | 'method' | 'class' || 'function';

    return {
      id: generateSafeMermaidId(id),
      label: sanitizeMermaidText(label),
      type,
      filePath: node?.filePath
    };
  });

  return participants;
}

/**
 * Generates a Mermaid sequence diagram from method calls
 * @param methodCalls Array of method calls
 * @param participants Array of participants
 * @returns Mermaid sequence diagram string
 */
export function generateSequenceDiagram(
  methodCalls: MethodCall[],
  participants: SequenceParticipant[]
): string {
  if (methodCalls.length === 0 || participants.length === 0) {
    return 'sequenceDiagram\n  Note over System: No method calls detected';
  }

  // Start the diagram
  let mermaidString = 'sequenceDiagram\n';

  // Add participants
  participants.forEach(participant => {
    // Use participant or actor based on type
    if (participant.type === 'class') {
      mermaidString += `  participant ${participant.id} as "${participant.label}"\n`;
    } else {
      mermaidString += `  participant ${participant.id} as "${participant.label}"\n`;
    }
  });

  // Add method calls
  methodCalls.forEach(call => {
    // Get safe IDs for the participants
    const fromId = generateSafeMermaidId(call.from);
    const toId = generateSafeMermaidId(call.to);

    // Determine arrow type based on async status
    const arrow = call.isAsync ? '-)' : '->>';

    // Clean the message to avoid Mermaid syntax issues
    const cleanMessage = sanitizeMermaidText(call.message);

    mermaidString += `  ${fromId}${arrow}${toId}: ${cleanMessage}\n`;
  });

  return mermaidString;
}

/**
 * Optimizes a sequence diagram for readability
 * @param diagram Mermaid sequence diagram string
 * @param maxParticipants Maximum number of participants to include
 * @returns Optimized diagram
 */
export function optimizeSequenceDiagram(diagram: string, maxParticipants: number = 10): string {
  // If the diagram is already small, return it as is
  if (!diagram.includes('participant')) {
    return diagram;
  }

  // Split the diagram into lines
  const lines = diagram.split('\n');

  // Extract participant lines
  const participantLines = lines.filter(line => line.trim().startsWith('participant'));

  // If we have too many participants, limit them
  if (participantLines.length > maxParticipants) {
    // Keep the first maxParticipants participants
    const keptParticipants = participantLines.slice(0, maxParticipants);

    // Extract the IDs of the kept participants
    const keptIds = keptParticipants.map(line => {
      const match = line.match(/participant\s+([^\s]+)/);
      return match ? match[1] : '';
    }).filter(id => id !== '');

    // Filter out lines with participants or calls that aren't in the kept list
    const filteredLines = lines.filter(line => {
      // Keep the sequenceDiagram line
      if (line.trim() === 'sequenceDiagram') return true;

      // Keep participant lines for kept participants
      if (line.trim().startsWith('participant')) {
        return keptIds.some(id => line.includes(`participant ${id}`));
      }

      // Keep call lines where both participants are kept
      if (line.trim().includes('->') || line.trim().includes('-x') || line.trim().includes('-)')) {
        return keptIds.some(id => line.trim().startsWith(id)) &&
               keptIds.some(id => line.includes(`${id}:`));
      }

      // Keep other lines (notes, etc.)
      return true;
    });

    // Add a note about the limitation
    filteredLines.push(`  Note over ${keptIds[0]}: Diagram limited to ${maxParticipants} participants for readability`);

    return filteredLines.join('\n');
  }

  return diagram;
}

/**
 * Processes and stores sequence diagram data with intermediate storage
 * @param methodCalls Array of method calls
 * @param participants Array of participants
 * @param config Configuration for storage
 * @param jobId Job ID for storage
 * @returns Path to the stored diagram file
 */
export async function processAndStoreSequenceDiagram(
  methodCalls: MethodCall[],
  participants: SequenceParticipant[],
  config: CodeMapGeneratorConfig,
  jobId: string
): Promise<string> {
  try {
    // Generate the sequence diagram
    const diagram = generateSequenceDiagram(methodCalls, participants);

    // Optimize the diagram for readability
    const optimizedDiagram = optimizeSequenceDiagram(diagram);

    // Create the output directory if it doesn't exist
    const outputDir = config.output?.outputDir || getOutputDirectory(config);

    // Create a diagrams directory
    const diagramsDir = path.join(outputDir, 'diagrams');
    await fs.mkdir(diagramsDir, { recursive: true });

    // Create a file path for the diagram
    const diagramPath = path.join(diagramsDir, `sequence-diagram-${jobId}.md`);

    // Write the diagram to the file
    await writeFileSecure(diagramPath, optimizedDiagram, config.allowedMappingDirectory, 'utf-8', outputDir);

    logger.debug(`Sequence diagram saved to ${diagramPath}`);

    return diagramPath;
  } catch (error) {
    logger.error({ err: error }, 'Failed to process and store sequence diagram');
    return '';
  }
}
