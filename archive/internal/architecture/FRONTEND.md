# Frontend Architecture

## Overview

The Frontend architecture delivers high-performance, interactive 3D visualization of cognitive maps using WebGPU rendering and React's component-based architecture. This design supports real-time collaboration, responsive performance at 240 FPS, and sophisticated state management for complex cognitive data structures.

## Architecture Components

### Core Architecture Overview
```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Presentation Layer                              │
├─────────────────────────────────────────────────────────────────────────┤
│  React 18+           │ TypeScript          │ Tailwind CSS            │
│  Component Tree      │ Type Safety         │ Utility-First           │
│  Hooks & Context     │ Interface Contracts │ Responsive Design       │
├─────────────────────────────────────────────────────────────────────────┤
│  State Management    │ Real-time Sync      │ Performance Optimizer   │
│  Zustand             │ WebSocket Client    │ Memoization             │
│  Selectors           │ Event Handlers      │ Virtualization          │
│  Persistence         │ Reconnection Logic  │ Lazy Loading            │
├─────────────────────────────────────────────────────────────────────────┤
│  Visualization Layer │                    │                         │
│  WebGPU Renderer     │ D3.js v7            │ Three.js                │
│  Babylon.js          │ Force-Directed      │ 3D Graphics            │
│  Shader Programs     │ Graph Layout        │ Animation System        │
├─────────────────────────────────────────────────────────────────────────┤
│  Data Access Layer   │ Caching Strategy    │ Error Handling          │
│  React Query         │ Service Worker      │ Error Boundaries        │
│  GraphQL Client      │ IndexedDB           │ Fallback UI             │
│  API Integration     │ Memory Cache        │ Retry Logic             │
└─────────────────────────────────────────────────────────────────────────┘
```

### Technology Stack
- **Framework**: React 18.2+ with TypeScript 5.0+
- **State Management**: Zustand with persistence middleware
- **Routing**: React Router v6 with lazy loading
- **Data Fetching**: React Query (TanStack Query) with GraphQL
- **Styling**: Tailwind CSS v3 with CSS-in-JS for dynamic styles
- **3D Rendering**: WebGPU with Three.js and Babylon.js
- **Graph Visualization**: D3.js v7 with force simulation
- **Real-time**: Socket.io client with reconnection logic
- **Performance**: React.memo, useMemo, useCallback, virtualization
- **Testing**: Jest + React Testing Library + Cypress

## Component Architecture

### Application Structure
```typescript
// =====================================================
-- Component Hierarchy and Organization
-- =====================================================

src/
├── components/           # Reusable UI components
│   ├── ui/              # Base UI components
│   │   ├── Button/
│   │   ├── Modal/
│   │   ├── Input/
│   │   └── Loading/
│   ├── forms/           # Form components
│   ├── charts/          # Data visualization
│   └── layout/          # Layout components
├── features/            # Feature-based modules
│   ├── conversations/   # Conversation management
│   ├── analysis/        # Cognitive analysis
│   ├── visualization/   # 3D cognitive maps
│   ├── collaboration/   # Real-time features
│   └── dashboard/       # User dashboard
├── hooks/               # Custom React hooks
├── stores/              # Zustand stores
├── services/            # API and external services
├── utils/               # Utility functions
├── types/               # TypeScript type definitions
└── styles/              # Global styles and themes
```

### Core Component Types

#### 1. Visualization Components
```typescript
// =====================================================
-- 3D Visualization Engine
-- =====================================================

import React, { useRef, useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Text } from '@react-three/drei';
import { ForceGraph3D } from 'react-force-graph-3d';
import { useCognitiveMapStore } from '../stores/cognitiveMapStore';

interface CognitiveNode {
  id: string;
  label: string;
  type: 'factual' | 'logical' | 'creative' | 'metacognitive';
  confidence: number;
  position?: [number, number, number];
  color?: string;
  size?: number;
  metadata: Record<string, any>;
}

interface CognitiveLink {
  source: string;
  target: string;
  strength: number;
  type: string;
  confidence: number;
}

interface CognitiveVisualizationProps {
  conversationId: string;
  viewMode: '2d' | '3d' | 'mixed';
  filters: VisualizationFilters;
  onNodeClick: (node: CognitiveNode) => void;
  onLinkClick: (link: CognitiveLink) => void;
}

const CognitiveVisualization: React.FC<CognitiveVisualizationProps> = ({
  conversationId,
  viewMode,
  filters,
  onNodeClick,
  onLinkClick
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { camera, gl } = useThree();

  // State management
  const [selectedNodes, setSelectedNodes] = useState<Set<string>>(new Set());
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [layout, setLayout] = useState<'force' | 'hierarchical' | 'circular'>('force');

  // Store integration
  const {
    nodes,
    links,
    loading,
    error,
    fetchCognitiveMap,
    updateNodePosition,
    selectNodes
  } = useCognitiveMapStore();

  // Memoized graph data
  const graphData = useMemo(() => ({
    nodes: nodes.map(node => ({
      ...node,
      color: getNodeColor(node.type, node.confidence),
      size: getNodeSize(node.confidence),
      selected: selectedNodes.has(node.id)
    })),
    links: links.map(link => ({
      ...link,
      color: getLinkColor(link.type, link.strength),
      width: getLinkWidth(link.strength)
    }))
  }), [nodes, links, selectedNodes]);

  // Initialize visualization
  useEffect(() => {
    if (conversationId) {
      fetchCognitiveMap(conversationId, filters);
    }
  }, [conversationId, filters, fetchCognitiveMap]);

  // WebGPU rendering optimization
  useEffect(() => {
    if (canvasRef.current && 'gpu' in navigator) {
      initializeWebGPURenderer(canvasRef.current);
    }
  }, []);

  const handleNodeClick = (node: any) => {
    const newSelectedNodes = new Set(selectedNodes);
    if (newSelectedNodes.has(node.id)) {
      newSelectedNodes.delete(node.id);
    } else {
      newSelectedNodes.add(node.id);
    }
    setSelectedNodes(newSelectedNodes);
    selectNodes(Array.from(newSelectedNodes));
    onNodeClick(node);
  };

  if (loading) {
    return <VisualizationLoader />;
  }

  if (error) {
    return <VisualizationError error={error} />;
  }

  return (
    <div className="w-full h-full relative">
      <Canvas
        ref={canvasRef}
        camera={{ position: [0, 0, 500], fov: 60 }}
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: 'high-performance'
        }}
        performance={{ min: 0.5 }}
        frameloop="demand"
      >
        <WebGPURenderer />
        <ambientLight intensity={0.5} />
        <pointLight position={[10, 10, 10]} intensity={0.8} />

        {viewMode === '3d' ? (
          <ForceGraph3D
            graphData={graphData}
            nodeLabel="label"
            nodeAutoColorBy="type"
            nodeVal={(node: any) => node.size || 5}
            linkWidth={(link: any) => link.width || 1}
            linkDirectionalParticles={2}
            linkDirectionalParticleSpeed={0.005}
            onNodeClick={handleNodeClick}
            onNodeHover={setHoveredNode}
            enableNodeDrag={true}
            onNodeDragEnd={(node: any) => {
              updateNodePosition(node.id, node.x, node.y, node.z);
            }}
          />
        ) : (
          <Cognitive2DGraph
            nodes={graphData.nodes}
            links={graphData.links}
            onNodeClick={handleNodeClick}
            layout={layout}
          />
        )}

        <OrbitControls
          enablePan={true}
          enableZoom={true}
          enableRotate={viewMode === '3d'}
        />

        {hoveredNode && (
          <NodeTooltip
            position={getNodePosition(hoveredNode)}
            node={nodes.find(n => n.id === hoveredNode)}
          />
        )}
      </Canvas>

      <VisualizationControls
        viewMode={viewMode}
        layout={layout}
        onViewModeChange={setViewMode}
        onLayoutChange={setLayout}
        selectedNodes={selectedNodes}
        onClearSelection={() => setSelectedNodes(new Set())}
      />
    </div>
  );
};

// WebGPU Renderer Component
const WebGPURenderer: React.FC = () => {
  const { gl, scene, camera } = useThree();
  const rendererRef = useRef<THREE.WebGPURenderer | null>(null);

  useEffect(() => {
    const initWebGPU = async () => {
      if ('gpu' in navigator) {
        const adapter = await (navigator as any).gpu.requestAdapter();
        const device = await adapter.requestDevice();

        rendererRef.current = new THREE.WebGPURenderer({
          canvas: gl.domElement,
          antialias: true,
          alpha: true
        });

        rendererRef.current.setPixelRatio(window.devicePixelRatio);
        rendererRef.current.setSize(window.innerWidth, window.innerHeight);
        rendererRef.current.setClearColor(0x000000, 0);

        gl.domElement.replaceWith(rendererRef.current.domElement);
      }
    };

    initWebGPU();

    return () => {
      rendererRef.current?.dispose();
    };
  }, [gl]);

  return null;
};
```

#### 2. Real-time Collaboration Components
```typescript
// =====================================================
-- Real-time Collaboration System
-- =====================================================

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '../stores/authStore';
import { useCollaborationStore } from '../stores/collaborationStore';
import { CursorTracker } from './CursorTracker';
import { UserPresence } from './UserPresence';

interface CollaborationProviderProps {
  conversationId: string;
  children: React.ReactNode;
}

interface CollaborationEvent {
  type: 'cursor_move' | 'selection_change' | 'filter_change' | 'view_change';
  userId: string;
  data: any;
  timestamp: number;
}

interface UserCursor {
  userId: string;
  userName: string;
  position: { x: number; y: number; z: number };
  color: string;
  lastUpdate: number;
}

const CollaborationProvider: React.FC<CollaborationProviderProps> = ({
  conversationId,
  children
}) => {
  const socketRef = useRef<Socket | null>(null);
  const { user } = useAuthStore();

  const {
    connectedUsers,
    userCursors,
    addUser,
    removeUser,
    updateUserCursor,
    isConnected
  } = useCollaborationStore();

  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');

  // Initialize WebSocket connection
  useEffect(() => {
    const initSocket = async () => {
      try {
        setConnectionStatus('connecting');

        const socket = io(`${process.env.REACT_APP_WS_URL}/collaboration`, {
          auth: {
            token: localStorage.getItem('access_token'),
            conversationId
          },
          transports: ['websocket', 'polling']
        });

        socketRef.current = socket;

        // Connection events
        socket.on('connect', () => {
          setConnectionStatus('connected');
          console.log('Connected to collaboration server');
        });

        socket.on('disconnect', (reason) => {
          setConnectionStatus('disconnected');
          console.log('Disconnected from collaboration server:', reason);

          // Attempt reconnection
          if (reason === 'io server disconnect') {
            socket.connect();
          }
        });

        socket.on('connect_error', (error) => {
          console.error('Connection error:', error);
          setConnectionStatus('disconnected');
        });

        // User presence events
        socket.on('user_joined', (userData) => {
          addUser(userData);
        });

        socket.on('user_left', (userId) => {
          removeUser(userId);
        });

        socket.on('users_list', (users) => {
          users.forEach((user: any) => addUser(user));
        });

        // Collaboration events
        socket.on('cursor_update', (cursorData: UserCursor) => {
          updateUserCursor(cursorData.userId, cursorData);
        });

        socket.on('collaboration_event', (event: CollaborationEvent) => {
          handleCollaborationEvent(event);
        });

        // Join conversation room
        socket.emit('join_conversation', { conversationId });

      } catch (error) {
        console.error('Failed to initialize socket:', error);
        setConnectionStatus('disconnected');
      }
    };

    initSocket();

    return () => {
      if (socketRef.current) {
        socketRef.current.emit('leave_conversation', { conversationId });
        socketRef.current.disconnect();
      }
    };
  }, [conversationId, addUser, removeUser, updateUserCursor]);

  // Handle collaboration events
  const handleCollaborationEvent = useCallback((event: CollaborationEvent) => {
    switch (event.type) {
      case 'cursor_move':
        updateUserCursor(event.userId, event.data);
        break;

      case 'selection_change':
        // Handle shared selection changes
        break;

      case 'filter_change':
        // Handle shared filter changes
        break;

      case 'view_change':
        // Handle shared view changes
        break;
    }
  }, [updateUserCursor]);

  // Broadcast cursor position
  const broadcastCursorPosition = useCallback((position: { x: number; y: number; z: number }) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('cursor_update', {
        conversationId,
        position,
        timestamp: Date.now()
      });
    }
  }, []);

  // Broadcast collaboration event
  const broadcastEvent = useCallback((event: Omit<CollaborationEvent, 'userId' | 'timestamp'>) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('collaboration_event', {
        ...event,
        timestamp: Date.now()
      });
    }
  }, []);

  const contextValue = {
    isConnected: connectionStatus === 'connected',
    connectionStatus,
    connectedUsers,
    userCursors,
    broadcastCursorPosition,
    broadcastEvent
  };

  return (
    <CollaborationContext.Provider value={contextValue}>
      {children}
      {connectionStatus === 'connected' && (
        <>
          <UserPresence users={connectedUsers} />
          <CursorTracker cursors={userCursors} />
        </>
      )}
      <ConnectionIndicator status={connectionStatus} />
    </CollaborationContext.Provider>
  );
};
```

#### 3. Performance Monitoring Component
```typescript
// =====================================================
-- Real-time Performance Monitoring
-- =====================================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useFrame } from '@react-three/fiber';

interface PerformanceMetrics {
  fps: number;
  frameTime: number;
  memoryUsage: number;
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
}

interface PerformanceMonitorProps {
  targetFPS: number;
  onPerformanceIssue: (metrics: PerformanceMetrics) => void;
}

const PerformanceMonitor: React.FC<PerformanceMonitorProps> = ({
  targetFPS = 60,
  onPerformanceIssue
}) => {
  const [metrics, setMetrics] = useState<PerformanceMetrics>({
    fps: 0,
    frameTime: 0,
    memoryUsage: 0,
    drawCalls: 0,
    triangles: 0,
    geometries: 0,
    textures: 0
  });

  const [isMonitoring, setIsMonitoring] = useState(true);
  const frameCountRef = useRef(0);
  const lastTimeRef = useRef(performance.now());
  const fpsHistoryRef = useRef<number[]>([]);
  const { gl, scene, camera } = useThree();

  // Performance monitoring loop
  useFrame((state, delta) => {
    if (!isMonitoring) return;

    frameCountRef.current++;
    const currentTime = performance.now();
    const elapsed = currentTime - lastTimeRef.current;

    // Update FPS every second
    if (elapsed >= 1000) {
      const fps = Math.round((frameCountRef.current * 1000) / elapsed);
      const frameTime = Math.round((elapsed / frameCountRef.current) * 100) / 100;

      fpsHistoryRef.current.push(fps);
      if (fpsHistoryRef.current.length > 10) {
        fpsHistoryRef.current.shift();
      }

      // Get memory usage
      const memoryInfo = (performance as any).memory;
      const memoryUsage = memoryInfo ?
        Math.round((memoryInfo.usedJSHeapSize / 1048576) * 100) / 100 : 0;

      // Get renderer info
      const rendererInfo = gl.info;
      const newMetrics: PerformanceMetrics = {
        fps,
        frameTime,
        memoryUsage,
        drawCalls: rendererInfo.render.calls,
        triangles: rendererInfo.render.triangles,
        geometries: rendererInfo.memory.geometries,
        textures: rendererInfo.memory.textures
      };

      setMetrics(newMetrics);

      // Check for performance issues
      if (fps < targetFPS * 0.8) { // 80% of target FPS
        onPerformanceIssue(newMetrics);
      }

      // Reset counters
      frameCountRef.current = 0;
      lastTimeRef.current = currentTime;
    }
  });

  // Auto-adjust quality based on performance
  useEffect(() => {
    const avgFPS = fpsHistoryRef.current.length > 0 ?
      fpsHistoryRef.current.reduce((a, b) => a + b, 0) / fpsHistoryRef.current.length : 60;

    if (avgFPS < targetFPS * 0.6) {
      // Reduce quality
      gl.setPixelRatio(Math.max(1, window.devicePixelRatio * 0.5));
      if (gl.shadowMap.enabled) {
        gl.shadowMap.enabled = false;
      }
    } else if (avgFPS > targetFPS * 0.9) {
      // Increase quality
      gl.setPixelRatio(Math.min(2, window.devicePixelRatio));
      if (!gl.shadowMap.enabled) {
        gl.shadowMap.enabled = true;
      }
    }
  }, [metrics.fps, targetFPS, gl]);

  if (!isMonitoring) {
    return null;
  }

  return (
    <div className="fixed top-4 right-4 bg-black bg-opacity-75 text-white p-4 rounded-lg text-xs font-mono z-50">
      <h3 className="font-bold mb-2">Performance Monitor</h3>
      <div className="space-y-1">
        <div>FPS: {metrics.fps}</div>
        <div>Frame Time: {metrics.frameTime}ms</div>
        <div>Memory: {metrics.memoryUsage}MB</div>
        <div>Draw Calls: {metrics.drawCalls}</div>
        <div>Triangles: {metrics.triangles.toLocaleString()}</div>
        <div>Geometries: {metrics.geometries}</div>
        <div>Textures: {metrics.textures}</div>
      </div>
      <button
        onClick={() => setIsMonitoring(!isMonitoring)}
        className="mt-2 px-2 py-1 bg-gray-700 rounded hover:bg-gray-600"
      >
        {isMonitoring ? 'Hide' : 'Show'}
      </button>
    </div>
  );
};
```

## State Management Architecture

### Zustand Store Structure
```typescript
// =====================================================
-- State Management with Zustand
-- =====================================================

import { create } from 'zustand';
import { subscribeWithSelector, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

// Types
interface CognitiveNode {
  id: string;
  text: string;
  type: 'factual' | 'logical' | 'creative' | 'metacognitive';
  confidence: number;
  position?: { x: number; y: number; z: number };
  color?: string;
  size?: number;
  metadata: Record<string, any>;
}

interface CognitiveLink {
  id: string;
  source: string;
  target: string;
  strength: number;
  type: string;
  confidence: number;
}

interface VisualizationState {
  nodes: CognitiveNode[];
  links: CognitiveLink[];
  selectedNodes: Set<string>;
  filters: {
    dimensions: string[];
    confidenceRange: [number, number];
    nodeTypes: string[];
  };
  viewMode: '2d' | '3d' | 'mixed';
  layout: 'force' | 'hierarchical' | 'circular';
  loading: boolean;
  error: string | null;
}

interface VisualizationActions {
  // Data operations
  setCognitiveMap: (nodes: CognitiveNode[], links: CognitiveLink[]) => void;
  addNode: (node: CognitiveNode) => void;
  updateNode: (id: string, updates: Partial<CognitiveNode>) => void;
  removeNode: (id: string) => void;
  addLink: (link: CognitiveLink) => void;
  updateLink: (id: string, updates: Partial<CognitiveLink>) => void;
  removeLink: (id: string) => void;

  // Selection operations
  selectNodes: (nodeIds: string[]) => void;
  toggleNodeSelection: (nodeId: string) => void;
  clearSelection: () => void;

  // Filter operations
  setFilters: (filters: Partial<VisualizationState['filters']>) => void;
  applyFilters: () => void;

  // View operations
  setViewMode: (mode: VisualizationState['viewMode']) => void;
  setLayout: (layout: VisualizationState['layout']) => void;

  // Loading and error states
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;

  // Async operations
  fetchCognitiveMap: (conversationId: string, filters?: any) => Promise<void>;
  saveCognitiveMap: (conversationId: string) => Promise<void>;
}

export const useCognitiveMapStore = create<VisualizationState & VisualizationActions>()(
  subscribeWithSelector(
    persist(
      immer((set, get) => ({
        // Initial state
        nodes: [],
        links: [],
        selectedNodes: new Set(),
        filters: {
          dimensions: [],
          confidenceRange: [0, 1],
          nodeTypes: []
        },
        viewMode: '3d',
        layout: 'force',
        loading: false,
        error: null,

        // Actions
        setCognitiveMap: (nodes, links) => {
          set((state) => {
            state.nodes = nodes;
            state.links = links;
            state.loading = false;
            state.error = null;
          });
        },

        addNode: (node) => {
          set((state) => {
            state.nodes.push(node);
          });
        },

        updateNode: (id, updates) => {
          set((state) => {
            const nodeIndex = state.nodes.findIndex(n => n.id === id);
            if (nodeIndex !== -1) {
              Object.assign(state.nodes[nodeIndex], updates);
            }
          });
        },

        removeNode: (id) => {
          set((state) => {
            state.nodes = state.nodes.filter(n => n.id !== id);
            state.links = state.links.filter(l => l.source !== id && l.target !== id);
            state.selectedNodes.delete(id);
          });
        },

        addLink: (link) => {
          set((state) => {
            state.links.push(link);
          });
        },

        updateLink: (id, updates) => {
          set((state) => {
            const linkIndex = state.links.findIndex(l => l.id === id);
            if (linkIndex !== -1) {
              Object.assign(state.links[linkIndex], updates);
            }
          });
        },

        removeLink: (id) => {
          set((state) => {
            state.links = state.links.filter(l => l.id !== id);
          });
        },

        selectNodes: (nodeIds) => {
          set((state) => {
            state.selectedNodes = new Set(nodeIds);
          });
        },

        toggleNodeSelection: (nodeId) => {
          set((state) => {
            if (state.selectedNodes.has(nodeId)) {
              state.selectedNodes.delete(nodeId);
            } else {
              state.selectedNodes.add(nodeId);
            }
          });
        },

        clearSelection: () => {
          set((state) => {
            state.selectedNodes.clear();
          });
        },

        setFilters: (newFilters) => {
          set((state) => {
            Object.assign(state.filters, newFilters);
          });
        },

        applyFilters: () => {
          // Apply filters to nodes and links
          const { nodes, links, filters } = get();

          const filteredNodes = nodes.filter(node => {
            if (filters.dimensions.length > 0 && !filters.dimensions.includes(node.type)) {
              return false;
            }
            if (filters.nodeTypes.length > 0 && !filters.nodeTypes.includes(node.type)) {
              return false;
            }
            if (node.confidence < filters.confidenceRange[0] || node.confidence > filters.confidenceRange[1]) {
              return false;
            }
            return true;
          });

          // Update filtered data
          set((state) => {
            state.filteredNodes = filteredNodes;
            state.filteredLinks = links.filter(link =>
              filteredNodes.some(n => n.id === link.source) &&
              filteredNodes.some(n => n.id === link.target)
            );
          });
        },

        setViewMode: (mode) => {
          set((state) => {
            state.viewMode = mode;
          });
        },

        setLayout: (layout) => {
          set((state) => {
            state.layout = layout;
          });
        },

        setLoading: (loading) => {
          set((state) => {
            state.loading = loading;
          });
        },

        setError: (error) => {
          set((state) => {
            state.error = error;
            state.loading = false;
          });
        },

        fetchCognitiveMap: async (conversationId, filters) => {
          const { setLoading, setError, setCognitiveMap } = get();

          try {
            setLoading(true);
            setError(null);

            const response = await fetch(`/api/conversations/${conversationId}/cognitive-map`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('access_token')}`
              },
              body: JSON.stringify({ filters })
            });

            if (!response.ok) {
              throw new Error(`Failed to fetch cognitive map: ${response.statusText}`);
            }

            const data = await response.json();
            setCognitiveMap(data.nodes, data.links);

          } catch (error) {
            setError(error instanceof Error ? error.message : 'Unknown error');
          } finally {
            setLoading(false);
          }
        },

        saveCognitiveMap: async (conversationId) => {
          const { nodes, links, setError } = get();

          try {
            const response = await fetch(`/api/conversations/${conversationId}/cognitive-map`, {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('access_token')}`
              },
              body: JSON.stringify({ nodes, links })
            });

            if (!response.ok) {
              throw new Error(`Failed to save cognitive map: ${response.statusText}`);
            }

          } catch (error) {
            setError(error instanceof Error ? error.message : 'Unknown error');
            throw error;
          }
        }
      })),
      {
        name: 'cognitive-map-storage',
        partialize: (state) => ({
          // Only persist selected fields
          filters: state.filters,
          viewMode: state.viewMode,
          layout: state.layout
        })
      })
    )
  )
);
```

## Performance Optimization

### WebGPU Rendering Pipeline
```typescript
// =====================================================
-- WebGPU Performance Optimization
-- =====================================================

import { useMemo, useRef, useEffect } from 'react';
import * as THREE from 'three';

class WebGPURendererManager {
  private device: GPUDevice | null = null;
  private context: GPUCanvasContext | null = null;
  private renderPipeline: GPURenderPipeline | null = null;
  private vertexBuffer: GPUBuffer | null = null;
  private indexBuffer: GPUBuffer | null = null;
  private uniformBuffer: GPUBuffer | null = null;
  private bindGroup: GPUBindGroup | null = null;

  async initialize(canvas: HTMLCanvasElement): Promise<boolean> {
    try {
      // Request GPU adapter
      const adapter = await navigator.gpu.requestAdapter({
        powerPreference: 'high-performance'
      });

      if (!adapter) {
        console.warn('WebGPU not available, falling back to WebGL');
        return false;
      }

      // Request device
      this.device = await adapter.requestDevice();

      // Get canvas context
      this.context = canvas.getContext('webgpu');
      if (!this.context) {
        throw new Error('Failed to get WebGPU context');
      }

      // Configure context
      const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
      this.context.configure({
        device: this.device,
        format: presentationFormat,
        alphaMode: 'premultiplied',
      });

      // Initialize render pipeline
      await this.createRenderPipeline(presentationFormat);

      return true;
    } catch (error) {
      console.error('Failed to initialize WebGPU:', error);
      return false;
    }
  }

  private async createRenderPipeline(format: GPUTextureFormat): Promise<void> {
    if (!this.device) return;

    // Vertex shader
    const vertexShaderCode = `
      struct Uniforms {
        mvpMatrix: mat4x4<f32>,
        time: f32,
      }
      @binding(0) @group(0) var<uniform> uniforms: Uniforms;

      struct VertexOutput {
        @builtin(position) position: vec4<f32>,
        @location(0) color: vec4<f32>,
        @location(1) uv: vec2<f32>,
      }

      @vertex
      fn main(
        @location(0) position: vec3<f32>,
        @location(1) color: vec4<f32>,
        @location(2) uv: vec2<f32>
      ) -> VertexOutput {
        var output: VertexOutput;
        output.position = uniforms.mvpMatrix * vec4<f32>(position, 1.0);
        output.color = color;
        output.uv = uv;
        return output;
      }
    `;

    // Fragment shader with performance optimizations
    const fragmentShaderCode = `
      @fragment
      fn main(
        @location(0) color: vec4<f32>,
        @location(1) uv: vec2<f32>
      ) -> @location(0) vec4<f32> {
        // Optimized fragment operations
        return color;
      }
    `;

    // Create shader modules
    const vertexShaderModule = this.device.createShaderModule({
      code: vertexShaderCode
    });

    const fragmentShaderModule = this.device.createShaderModule({
      code: fragmentShaderCode
    });

    // Create pipeline layout
    const pipelineLayout = this.device.createPipelineLayout({
      bindGroupLayouts: [this.createBindGroupLayout()]
    });

    // Create render pipeline
    this.renderPipeline = this.device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: {
        module: vertexShaderModule,
        entryPoint: 'main',
        buffers: [
          {
            arrayStride: 36, // 9 floats * 4 bytes
            attributes: [
              {
                shaderLocation: 0,
                offset: 0,
                format: 'float32x3'
              },
              {
                shaderLocation: 1,
                offset: 12,
                format: 'float32x4'
              },
              {
                shaderLocation: 2,
                offset: 28,
                format: 'float32x2'
              }
            ]
          }
        ]
      },
      fragment: {
        module: fragmentShaderModule,
        entryPoint: 'main',
        targets: [
          {
            format: format,
            blend: {
              color: {
                srcFactor: 'src-alpha',
                dstFactor: 'one-minus-src-alpha'
              },
              alpha: {
                srcFactor: 'one',
                dstFactor: 'one-minus-src-alpha'
              }
            }
          }
        ]
      },
      primitive: {
        topology: 'triangle-list',
        cullMode: 'back'
      },
      depthStencil: {
        depthWriteEnabled: true,
        depthCompare: 'less',
        format: 'depth24plus'
      },
      multisample: {
        count: 4
      }
    });
  }

  private createBindGroupLayout(): GPUBindGroupLayout {
    if (!this.device) throw new Error('Device not initialized');

    return this.device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX,
          buffer: {
            type: 'uniform',
            minBindingSize: 80 // mat4x4 + float
          }
        }
      ]
    });
  }

  createBuffers(vertexData: Float32Array, indexData: Uint32Array): void {
    if (!this.device) return;

    // Create vertex buffer
    this.vertexBuffer = this.device.createBuffer({
      size: vertexData.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
    });
    this.device.queue.writeBuffer(this.vertexBuffer, 0, vertexData);

    // Create index buffer
    this.indexBuffer = this.device.createBuffer({
      size: indexData.byteLength,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST
    });
    this.device.queue.writeBuffer(this.indexBuffer, 0, indexData);

    // Create uniform buffer
    this.uniformBuffer = this.device.createBuffer({
      size: 80, // mat4x4 (64 bytes) + time (4 bytes) + padding
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    // Create bind group
    this.bindGroup = this.device.createBindGroup({
      layout: this.createBindGroupLayout(),
      entries: [
        {
          binding: 0,
          resource: {
            buffer: this.uniformBuffer
          }
        }
      ]
    });
  }

  render(mvpMatrix: THREE.Matrix4, time: number): void {
    if (!this.device || !this.context || !this.renderPipeline ||
        !this.vertexBuffer || !this.indexBuffer || !this.uniformBuffer || !this.bindGroup) {
      return;
    }

    // Update uniform buffer
    const uniformData = new Float32Array(20); // 16 for matrix + 1 for time + 3 padding
    uniformData.set(mvpMatrix.elements, 0);
    uniformData[16] = time;
    this.device.queue.writeBuffer(this.uniformBuffer, 0, uniformData);

    // Create command encoder
    const commandEncoder = this.device.createCommandEncoder();

    // Get texture view
    const textureView = this.context.getCurrentTexture().createView();

    // Create render pass
    const renderPassDescriptor: GPURenderPassDescriptor = {
      colorAttachments: [
        {
          view: textureView,
          clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 0.0 },
          loadOp: 'clear',
          storeOp: 'store'
        }
      ]
    };

    const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
    passEncoder.setPipeline(this.renderPipeline);
    passEncoder.setBindGroup(0, this.bindGroup);
    passEncoder.setVertexBuffer(0, this.vertexBuffer);
    passEncoder.setIndexBuffer(this.indexBuffer, 'uint32');
    passEncoder.drawIndexed(6); // Example: draw 2 triangles
    passEncoder.end();

    // Submit commands
    this.device.queue.submit([commandEncoder.finish()]);
  }

  dispose(): void {
    this.vertexBuffer?.destroy();
    this.indexBuffer?.destroy();
    this.uniformBuffer?.destroy();
    this.device?.destroy();
  }
}

// React Hook for WebGPU Rendering
export const useWebGPURenderer = (canvasRef: React.RefObject<HTMLCanvasElement>) => {
  const rendererRef = useRef<WebGPURendererManager | null>(null);
  const [isSupported, setIsSupported] = useState<boolean | null>(null);

  useEffect(() => {
    const initRenderer = async () => {
      if (!canvasRef.current) return;

      const renderer = new WebGPURendererManager();
      const supported = await renderer.initialize(canvasRef.current);

      rendererRef.current = renderer;
      setIsSupported(supported);

      return () => {
        renderer.dispose();
      };
    };

    initRenderer();
  }, [canvasRef]);

  const render = useCallback((mvpMatrix: THREE.Matrix4, time: number) => {
    rendererRef.current?.render(mvpMatrix, time);
  }, []);

  return { isSupported, render };
};
```

This Frontend architecture provides a comprehensive, high-performance solution for interactive 3D cognitive visualization with real-time collaboration, optimized rendering, and sophisticated state management capabilities.