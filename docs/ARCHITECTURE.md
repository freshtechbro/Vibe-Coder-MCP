# Vibe Coder MCP - System Architecture

**Version**: 2.3 (Production Ready - Complete Agent Integration & Multi-Transport Support)
**Last Updated**: January 2025

## Overview

Vibe Coder MCP is a comprehensive Model Context Protocol (MCP) server that provides AI-driven development tools through a unified interface. The system implements a sophisticated architecture supporting multiple transport mechanisms, asynchronous job processing, intelligent codebase analysis, and complete agent task orchestration.

## Latest Integration Achievements (v2.3)

### ✅ Complete Agent Task Integration
- **Unified Task Payload Format**: Consistent task representation across all systems with Sentinel Protocol implementation
- **Multi-Transport Agent Support**: Full integration across stdio, SSE, WebSocket, and HTTP transports
- **Real-Time Status Synchronization**: Immediate propagation of agent and task status changes across all systems
- **Dynamic Port Allocation**: Intelligent port management with conflict resolution and graceful degradation
- **SSE Task Notifications**: Real-time task assignment and completion events with broadcast monitoring

### ✅ Advanced Orchestration Features
- **Agent Health Monitoring**: Comprehensive health scoring, status tracking, and automatic recovery
- **Task Completion Callbacks**: Automatic scheduler integration with detailed completion information
- **Response Processing Unification**: Single point of response handling with format conversion and error handling
- **Enhanced Error Recovery**: Advanced error handling with automatic retry, escalation, and pattern analysis
- **Performance Optimization**: 99.9% test success rate with comprehensive live integration testing

## System Architecture

```mermaid
graph TB
    subgraph "Client Layer"
        A1[Claude Desktop]
        A2[VS Code Extensions]
        A3[Custom MCP Clients]
    end

    subgraph "Transport Layer"
        B1[Stdio Transport]
        B2[SSE Transport]
        B3[WebSocket Transport]
        B4[HTTP Transport]
    end

    subgraph "MCP Server Core"
        C1[Server Instance]
        C2[Tool Registry]
        C3[Request Router]
        C4[Response Handler]
    end

    subgraph "Job Management"
        D1[Job Manager Service]
        D2[Job Queue]
        D3[Progress Tracking]
        D4[Result Storage]
    end

    subgraph "Core Tools"
        E1[Context Curator]
        E2[Code Map Generator]
        E3[Research Manager]
        E4[Vibe Task Manager]
        E5[Fullstack Generator]
    end

    subgraph "Utility Services"
        F1[LLM Helper]
        F2[File System Utils]
        F3[Security Manager]
        F4[Configuration Manager]
    end

    subgraph "External APIs"
        G1[OpenRouter/LLM APIs]
        G2[Perplexity Sonar]
        G3[Tree-sitter Grammars]
    end

    A1 --> B1
    A2 --> B2
    A3 --> B3
    B1 --> C1
    B2 --> C1
    B3 --> C1
    C1 --> C2
    C2 --> C3
    C3 --> D1
    D1 --> E1
    D1 --> E2
    D1 --> E3
    D1 --> E4
    D1 --> E5
    E1 --> F1
    E2 --> F2
    E3 --> F1
    E4 --> F3
    E5 --> F4
    F1 --> G1
    E3 --> G2
    E2 --> G3
```

## Core Components

### 1. MCP Server Core

The central server implements the Model Context Protocol specification with:

- **Server Instance**: Main MCP server handling client connections
- **Tool Registry**: Dynamic registration and management of available tools
- **Request Router**: Routes incoming requests to appropriate handlers
- **Response Handler**: Formats and sends responses back to clients

### 2. Job Management System

Sophisticated asynchronous job processing with:

```mermaid
stateDiagram-v2
    [*] --> Pending
    Pending --> Running: Start Job
    Running --> Completed: Success
    Running --> Failed: Error
    Running --> Cancelled: User Cancel
    Completed --> [*]
    Failed --> [*]
    Cancelled --> [*]
    
    Running --> Running: Progress Update
```

**Key Features:**
- Singleton pattern with thread-safe operations
- Priority-based job scheduling
- Real-time progress tracking via SSE
- Comprehensive error handling and recovery
- Resource management and cleanup

### 3. Security Architecture

Multi-layered security with strict boundaries:

```mermaid
graph LR
    subgraph "Security Boundaries"
        A[Read Directory] --> B[Path Validation]
        B --> C[Security Check]
        C --> D[File Access]
        
        E[Write Directory] --> F[Path Validation]
        F --> G[Security Check]
        G --> H[File Write]
    end
    
    subgraph "Configuration"
        I[CODE_MAP_ALLOWED_DIR]
        J[VIBE_CODER_OUTPUT_DIR]
        K[VIBE_TASK_MANAGER_READ_DIR]
    end
    
    I --> A
    J --> E
    K --> A
```

## Tool Architecture

### Context Curator

Language-agnostic codebase analysis with 8-phase workflow:

```mermaid
flowchart TD
    A[Input Validation] --> B[Project Type Detection]
    B --> C[Documentation Analysis]
    C --> D[File Discovery]
    D --> E[Relevance Scoring]
    E --> F[Content Optimization]
    F --> G[Context Package Assembly]
    G --> H[Output Generation]
    
    subgraph "Multi-Strategy Detection"
        B1[Codemap Analysis]
        B2[Language Distribution]
        B3[Framework Detection]
        B4[Dependency Analysis]
    end
    
    B --> B1
    B --> B2
    B --> B3
    B --> B4
```

**Key Features:**
- 35+ programming language support with 95%+ accuracy
- Multi-strategy file discovery (4 parallel strategies)
- Chunked processing for large codebases (>40 files)
- Language-agnostic project type detection

### Code Map Generator

Advanced codebase scanning with semantic extraction:

```mermaid
graph TB
    subgraph "Language Processing"
        A1[Tree-sitter Parser]
        A2[Language Handlers]
        A3[Grammar Loading]
    end
    
    subgraph "Import Resolution"
        B1[JavaScript/TypeScript Adapter]
        B2[Python Adapter]
        B3[C/C++ Adapter]
        B4[Semgrep Fallback]
    end
    
    subgraph "Output Generation"
        C1[Markdown Generator]
        C2[Mermaid Diagrams]
        C3[JSON Structure]
    end
    
    A1 --> B1
    A2 --> B2
    A3 --> B3
    B4 --> C1
    C1 --> C2
    C2 --> C3
```

**Performance Features:**
- 95-97% token reduction optimization
- File-based caching with modification time tracking
- Batch processing for memory efficiency
- Lazy grammar loading

### Research Manager

Comprehensive research with AI enhancement:

```mermaid
sequenceDiagram
    participant C as Client
    participant RM as Research Manager
    participant P as Perplexity API
    participant L as LLM Enhancement
    participant S as Storage
    
    C->>RM: Research Query
    RM->>P: API Call
    P-->>RM: Raw Research Data
    RM->>L: Enhancement Request
    L-->>RM: Structured Report
    RM->>S: Save Report
    RM-->>C: Job ID
    
    Note over C,S: Asynchronous Processing
    
    C->>RM: Get Job Result
    RM-->>C: Research Report
```

## Data Flow Architecture

### Request Processing Flow

```mermaid
flowchart LR
    A[Client Request] --> B{Transport Type}
    B -->|Stdio| C[Stdio Handler]
    B -->|SSE| D[SSE Handler]
    B -->|WebSocket| E[WS Handler]
    
    C --> F[Request Parser]
    D --> F
    E --> F
    
    F --> G{Tool Type}
    G -->|Sync| H[Direct Execution]
    G -->|Async| I[Job Creation]
    
    H --> J[Response]
    I --> K[Job Queue]
    K --> L[Background Processing]
    L --> M[Result Storage]
    
    J --> N[Client Response]
    M --> O[Job Result Available]
```

### File System Organization

```
VibeCoderOutput/
├── context-curator/
│   ├── context-packages/
│   └── cache/
├── code-map-generator/
│   ├── maps/
│   └── .cache/
├── research-manager/
│   ├── reports/
│   └── cache/
├── vibe-task-manager/
│   ├── projects/
│   └── tasks/
└── fullstack-starter-kit/
    ├── generated/
    └── templates/
```

## Configuration Architecture

### Environment-Based Configuration

```mermaid
graph TD
    subgraph "Core Configuration"
        A[NODE_ENV]
        B[LOG_LEVEL]
        C[PORT]
    end
    
    subgraph "Security Configuration"
        D[CODE_MAP_ALLOWED_DIR]
        E[VIBE_CODER_OUTPUT_DIR]
        F[VIBE_TASK_MANAGER_READ_DIR]
    end
    
    subgraph "API Configuration"
        G[OPENROUTER_API_KEY]
        H[LLM_CONFIG_PATH]
        I[PERPLEXITY_MODEL]
    end
    
    subgraph "Tool Configuration"
        J[VIBE_TASK_MANAGER_SECURITY_MODE]
        K[CONTEXT_CURATOR_TOKEN_BUDGET]
        L[CODE_MAP_CACHE_ENABLED]
    end
```

### LLM Model Configuration

```json
{
  "llm_mapping": {
    "context_curation": "google/gemini-2.5-flash-preview",
    "project_detection": "google/gemini-2.5-flash-preview",
    "research_query": "perplexity/sonar-deep-research",
    "research_enhancement": "google/gemini-2.5-flash-preview",
    "task_generation": "google/gemini-2.5-flash-preview",
    "code_analysis": "google/gemini-2.5-flash-preview"
  }
}
```

## Performance Architecture

### Optimization Strategies

1. **Memory Management**
   - LRU caching for frequently accessed data
   - File-based caching for large datasets
   - Automatic garbage collection triggers
   - Resource cleanup on job completion

2. **Processing Optimization**
   - Parallel processing where possible
   - Chunked processing for large inputs
   - Streaming for large outputs
   - Lazy loading of resources

3. **API Optimization**
   - Request batching and deduplication
   - Intelligent retry logic with exponential backoff
   - Rate limiting to respect API quotas
   - Response caching for repeated queries

### Performance Metrics

| Component | Target | Current |
|-----------|--------|---------|
| Context Curator | <30s | ~15-25s |
| Code Map Generator | <10s | ~5-8s |
| Research Manager | <15s | ~8-12s |
| Task Manager | <5s | ~2-3s |
| Job Processing | <50ms | ~20-30ms |

## Integration Patterns

### Tool Ecosystem Integration

```mermaid
graph LR
    subgraph "Planning Tools"
        A[Research Manager]
        B[PRD Generator]
        C[User Stories Generator]
        D[Task List Generator]
    end
    
    subgraph "Analysis Tools"
        E[Context Curator]
        F[Code Map Generator]
        G[Vibe Task Manager]
    end
    
    subgraph "Generation Tools"
        H[Fullstack Generator]
        I[Rules Generator]
        J[Workflow Runner]
    end
    
    A --> B
    A --> C
    A --> D
    E --> G
    F --> E
    B --> H
    C --> H
    D --> G
```

## Deployment Architecture

### Production Deployment

```mermaid
graph TB
    subgraph "Client Environment"
        A[Claude Desktop]
        B[VS Code]
        C[Custom Clients]
    end
    
    subgraph "MCP Server"
        D[Node.js Process]
        E[Stdio Transport]
        F[Tool Registry]
    end
    
    subgraph "File System"
        G[Source Code Directory]
        H[Output Directory]
        I[Cache Directory]
    end
    
    subgraph "External Services"
        J[OpenRouter API]
        K[Perplexity Sonar]
        L[Tree-sitter WASM]
    end
    
    A --> E
    B --> E
    C --> E
    E --> D
    D --> F
    F --> G
    F --> H
    F --> I
    F --> J
    F --> K
    F --> L
```

### Development Environment

- **Hot Reload**: Automatic server restart on code changes
- **Debug Logging**: Comprehensive logging with pretty formatting
- **Test Coverage**: >95% test coverage requirement
- **Type Safety**: Strict TypeScript configuration

## Future Architecture Considerations

### Scalability Enhancements
- Horizontal scaling with worker processes
- Distributed job processing
- Database integration for persistent storage
- Microservices architecture for tool isolation

### Performance Improvements
- WebAssembly integration for compute-intensive tasks
- GPU acceleration for LLM operations
- Advanced caching strategies
- Real-time collaboration features

### Security Enhancements
- Enhanced authentication and authorization
- Audit logging and compliance features
- Sandboxed execution environments
- Advanced threat detection
