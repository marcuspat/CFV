/**
 * WebSocket service for real-time updates
 */

import { WebSocketServer } from 'ws';
import WebSocket from 'ws';
import { IncomingMessage } from 'http';
import { logger } from '../utils/logger';
import {
  WebSocketMessage,
  MessageType,
  CognitiveElementEvent,
  ProcessingProgressEvent,
  VisualizationUpdateEvent,
  ErrorEvent
} from '../../types';

interface AuthenticatedWebSocket extends WebSocket {
  userId?: string;
  isAlive?: boolean;
  lastPing?: Date;
}

interface ClientSubscription {
  conversationId?: string;
  analysisId?: string;
  visualizationId?: string;
}

export class WebSocketService {
  private wsServer: WebSocketServer;
  private clients: Map<AuthenticatedWebSocket, ClientSubscription> = new Map();

  constructor(wsServer: WebSocketServer) {
    this.wsServer = wsServer;
    this.setupEventHandlers();
    this.startHeartbeat();
  }

  private setupEventHandlers(): void {
    this.wsServer.on('connection', this.handleConnection.bind(this));
    this.wsServer.on('error', this.handleError.bind(this));
  }

  private async handleConnection(
    ws: AuthenticatedWebSocket,
    request: IncomingMessage
  ): Promise<void> {
    try {
      // Extract token from query parameters or headers
      const url = new URL(request.url || '/', 'http://localhost');
      const token = url.searchParams.get('token') ||
                   request.headers.authorization?.replace('Bearer ', '');

      if (!token) {
        ws.close(1008, 'Authentication token required');
        return;
      }

      // Verify token (simplified - in production, use proper JWT verification)
      const userId = this.verifyToken(token);
      if (!userId) {
        ws.close(1008, 'Invalid authentication token');
        return;
      }

      // Setup client
      ws.userId = userId;
      ws.isAlive = true;
      ws.lastPing = new Date();

      this.clients.set(ws, {});

      logger.info('WebSocket client connected', {
        clientId: this.getClientId(ws),
        userId,
        ip: request.socket.remoteAddress,
      });

      // Send welcome message
      this.sendToClient(ws, {
        type: 'connection_established',
        data: {
          clientId: this.getClientId(ws),
          serverTime: new Date().toISOString(),
        },
        timestamp: new Date(),
      } as any);

      // Setup message handlers
      ws.on('message', (data) => this.handleMessage(ws, data));
      ws.on('close', (code, reason) => this.handleClose(ws, code, reason));
      ws.on('error', (error) => this.handleErrorClient(ws, error));
      ws.on('pong', () => this.handlePong(ws));

    } catch (error) {
      logger.error('WebSocket connection error', { error });
      ws.close(1011, 'Internal server error');
    }
  }

  private handleMessage(ws: AuthenticatedWebSocket, data: WebSocket.Data): void {
    try {
      const message: WebSocketMessage = JSON.parse(data.toString());

      logger.debug('WebSocket message received', {
        clientId: this.getClientId(ws),
        userId: ws.userId,
        type: message.type,
      });

      switch (message.type) {
        case 'subscribe':
          this.handleSubscribe(ws, message);
          break;
        case 'unsubscribe':
          this.handleUnsubscribe(ws, message);
          break;
        case 'ping':
          this.sendToClient(ws, {
            type: 'pong',
            data: { timestamp: new Date() },
            timestamp: new Date(),
          } as any);
          break;
        default:
          logger.warn('Unknown WebSocket message type', {
            clientId: this.getClientId(ws),
            type: message.type,
          });
      }
    } catch (error) {
      logger.error('WebSocket message handling error', {
        clientId: this.getClientId(ws),
        error,
      });
    }
  }

  private handleSubscribe(ws: AuthenticatedWebSocket, message: WebSocketMessage): void {
    const subscription = this.clients.get(ws);
    if (!subscription) return;

    const { conversationId, analysisId, visualizationId } = message.data || {};

    if (conversationId) subscription.conversationId = conversationId;
    if (analysisId) subscription.analysisId = analysisId;
    if (visualizationId) subscription.visualizationId = visualizationId;

    this.clients.set(ws, subscription);

    this.sendToClient(ws, {
      type: 'subscription_confirmed',
      data: { subscription },
      timestamp: new Date(),
    } as any);

    logger.debug('Client subscribed', {
      clientId: this.getClientId(ws),
      userId: ws.userId,
      subscription,
    });
  }

  private handleUnsubscribe(ws: AuthenticatedWebSocket, message: WebSocketMessage): void {
    const subscription = this.clients.get(ws);
    if (!subscription) return;

    const { conversationId, analysisId, visualizationId } = message.data || {};

    if (conversationId && subscription.conversationId === conversationId) {
      subscription.conversationId = undefined;
    }
    if (analysisId && subscription.analysisId === analysisId) {
      subscription.analysisId = undefined;
    }
    if (visualizationId && subscription.visualizationId === visualizationId) {
      subscription.visualizationId = undefined;
    }

    this.clients.set(ws, subscription);

    this.sendToClient(ws, {
      type: 'unsubscription_confirmed',
      data: { subscription },
      timestamp: new Date(),
    } as any);
  }

  private handleClose(ws: AuthenticatedWebSocket, code: number, reason: Buffer): void {
    const clientId = this.getClientId(ws);

    logger.info('WebSocket client disconnected', {
      clientId,
      userId: ws.userId,
      code,
      reason: reason.toString(),
    });

    this.clients.delete(ws);
  }

  private handleErrorClient(ws: AuthenticatedWebSocket, error: Error): void {
    logger.error('WebSocket client error', {
      clientId: this.getClientId(ws),
      userId: ws.userId,
      error,
    });
  }

  private handleError(error: Error): void {
    logger.error('WebSocket server error', { error });
  }

  private handlePong(ws: AuthenticatedWebSocket): void {
    ws.isAlive = true;
    ws.lastPing = new Date();
  }

  private startHeartbeat(): void {
    setInterval(() => {
      this.clients.forEach((subscription, ws) => {
        if (!ws.isAlive) {
          logger.debug('Terminating inactive WebSocket client', {
            clientId: this.getClientId(ws),
            userId: ws.userId,
          });
          ws.terminate();
          this.clients.delete(ws);
          return;
        }

        ws.isAlive = false;
        ws.ping();
      });
    }, 30000); // 30 seconds
  }

  // Public methods for broadcasting messages
  public broadcastCognitiveElement(
    conversationId: string,
    element: any
  ): void {
    const message: CognitiveElementEvent = {
      type: 'cognitive_element_added',
      data: {
        elementId: element.id,
        element,
        confidence: element.confidence,
        dimension: element.type,
      },
      timestamp: new Date(),
      conversationId,
    };

    this.broadcastToConversation(conversationId, message);
  }

  public broadcastProcessingProgress(
    conversationId: string,
    analysisId: string,
    progress: number,
    currentStep: string,
    estimatedTimeRemaining?: number
  ): void {
    const message: ProcessingProgressEvent = {
      type: 'processing_progress',
      data: {
        progress,
        currentStep,
        totalSteps: 100,
        estimatedTimeRemaining: estimatedTimeRemaining || 0,
      },
      timestamp: new Date(),
      conversationId,
    };

    this.broadcastToConversation(conversationId, message);

    // Also send to clients subscribed to specific analysis
    this.broadcastToAnalysis(analysisId, message);
  }

  public broadcastVisualizationUpdate(
    conversationId: string,
    visualizationId: string,
    updateType: string,
    changes: any
  ): void {
    const message: VisualizationUpdateEvent = {
      type: 'visualization_update',
      data: {
        visualizationId,
        updateType: updateType as any,
        changes,
      },
      timestamp: new Date(),
      conversationId,
    };

    this.broadcastToConversation(conversationId, message);
    this.broadcastToVisualization(visualizationId, message);
  }

  public broadcastError(conversationId: string, error: any): void {
    const message: ErrorEvent = {
      type: 'error',
      data: {
        code: error.code || 'UNKNOWN_ERROR',
        message: error.message || 'An unknown error occurred',
        details: error.details,
        timestamp: new Date(),
      },
      timestamp: new Date(),
      conversationId,
    };

    this.broadcastToConversation(conversationId, message);
  }

  private broadcastToConversation(conversationId: string, message: WebSocketMessage): void {
    this.clients.forEach((subscription, ws) => {
      if (subscription.conversationId === conversationId) {
        this.sendToClient(ws, message);
      }
    });
  }

  private broadcastToAnalysis(analysisId: string, message: WebSocketMessage): void {
    this.clients.forEach((subscription, ws) => {
      if (subscription.analysisId === analysisId) {
        this.sendToClient(ws, message);
      }
    });
  }

  private broadcastToVisualization(visualizationId: string, message: WebSocketMessage): void {
    this.clients.forEach((subscription, ws) => {
      if (subscription.visualizationId === visualizationId) {
        this.sendToClient(ws, message);
      }
    });
  }

  private sendToClient(ws: AuthenticatedWebSocket, message: WebSocketMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(message));
      } catch (error) {
        logger.error('Failed to send WebSocket message', {
          clientId: this.getClientId(ws),
          error,
        });
      }
    }
  }

  private getClientId(ws: AuthenticatedWebSocket): string {
    // Generate a unique client ID for logging
    return Buffer.from(`${ws.userId}-${Date.now()}`).toString('base64').substring(0, 8);
  }

  private verifyToken(token: string): string | null {
    // Simplified token verification - in production, use proper JWT verification
    try {
      // For demo purposes, accept any non-empty token
      if (token && token.length > 10) {
        return 'demo-user-id';
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  // Statistics and monitoring
  public getStats(): {
    connectedClients: number;
    subscriptions: {
      conversations: number;
      analyses: number;
      visualizations: number;
    };
  } {
    const subscriptions = {
      conversations: 0,
      analyses: 0,
      visualizations: 0,
    };

    this.clients.forEach((subscription) => {
      if (subscription.conversationId) subscriptions.conversations++;
      if (subscription.analysisId) subscriptions.analyses++;
      if (subscription.visualizationId) subscriptions.visualizations++;
    });

    return {
      connectedClients: this.clients.size,
      subscriptions,
    };
  }
}

// Global WebSocket service instance
let wsService: WebSocketService;

export function setupWebSocket(wsServer: WebSocketServer): void {
  wsService = new WebSocketService(wsServer);
}

export function getWebSocketService(): WebSocketService {
  if (!wsService) {
    throw new Error('WebSocket service not initialized');
  }
  return wsService;
}

export default wsService;