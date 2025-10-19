/**
 * WebSocket Service for Real-time Updates
 * Handles WebSocket communication with the backend
 */

class WebSocketService {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private isConnecting = false;
  private subscriptions: Map<string, Set<Function>> = new Map();
  private messageQueue: any[] = [];
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.connect();
  }

  private connect(): void {
    if (this.isConnecting || (this.ws && this.ws.readyState === WebSocket.OPEN)) {
      return;
    }

    this.isConnecting = true;

    try {
      const token = localStorage.getItem('cognitive_fabric_token');
      const wsUrl = process.env.REACT_APP_WS_URL || 'ws://localhost:3001';
      const url = `${wsUrl}?token=${token || ''}`;

      this.ws = new WebSocket(url);

      this.ws.onopen = this.handleOpen.bind(this);
      this.ws.onmessage = this.handleMessage.bind(this);
      this.ws.onclose = this.handleClose.bind(this);
      this.ws.onerror = this.handleError.bind(this);

    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
      this.isConnecting = false;
      this.scheduleReconnect();
    }
  }

  private handleOpen(): void {
    console.log('WebSocket connection established');
    this.isConnecting = false;
    this.reconnectAttempts = 0;

    // Send queued messages
    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift();
      this.send(message);
    }

    // Start heartbeat
    this.startHeartbeat();

    // Re-subscribe to all events
    this.subscriptions.forEach((callbacks, event) => {
      this.send({
        type: 'subscribe',
        data: { event },
        timestamp: new Date(),
      });
    });
  }

  private handleMessage(event: MessageEvent): void {
    try {
      const message = JSON.parse(event.data);
      this.handleIncomingMessage(message);
    } catch (error) {
      console.error('Failed to parse WebSocket message:', error);
    }
  }

  private handleIncomingMessage(message: any): void {
    const { type, data, timestamp, conversationId } = message;

    // Handle different message types
    switch (type) {
      case 'connection_established':
        console.log('WebSocket connection confirmed:', data);
        break;

      case 'subscription_confirmed':
        console.log('Subscription confirmed:', data);
        break;

      case 'analysis_progress':
        this.emit('analysis_progress', data);
        break;

      case 'analysis_complete':
        this.emit('analysis_complete', data);
        break;

      case 'cognitive_element_added':
        this.emit('cognitive_element_added', data);
        break;

      case 'visualization_update':
        this.emit('visualization_update', data);
        break;

      case 'error':
        console.error('WebSocket error received:', data);
        this.emit('error', data);
        break;

      case 'pong':
        // Heartbeat response
        break;

      default:
        console.log('Unknown WebSocket message type:', type, data);
    }
  }

  private handleClose(event: CloseEvent): void {
    console.log('WebSocket connection closed:', event.code, event.reason);
    this.isConnecting = false;
    this.stopHeartbeat();

    if (event.code !== 1000) {
      this.scheduleReconnect();
    }
  }

  private handleError(error: Event): void {
    console.error('WebSocket error:', error);
    this.isConnecting = false;
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnect attempts reached');
      return;
    }

    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts);
    console.log(`Scheduling reconnect in ${delay}ms (attempt ${this.reconnectAttempts + 1})`);

    setTimeout(() => {
      this.reconnectAttempts++;
      this.connect();
    }, delay);
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.send({
          type: 'ping',
          data: { timestamp: new Date() },
          timestamp: new Date(),
        });
      }
    }, 30000); // 30 seconds
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private send(message: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      // Queue message for when connection is established
      this.messageQueue.push(message);
    }
  }

  // Public API
  public subscribe(event: string, callback: Function): void {
    if (!this.subscriptions.has(event)) {
      this.subscriptions.set(event, new Set());
    }
    this.subscriptions.get(event)!.add(callback);

    // Send subscription message to server
    this.send({
      type: 'subscribe',
      data: { event },
      timestamp: new Date(),
    });
  }

  public unsubscribe(event: string, callback?: Function): void {
    const callbacks = this.subscriptions.get(event);
    if (callbacks) {
      if (callback) {
        callbacks.delete(callback);
        if (callbacks.size === 0) {
          this.subscriptions.delete(event);
        }
      } else {
        this.subscriptions.delete(event);
      }
    }

    // Send unsubscription message to server
    this.send({
      type: 'unsubscribe',
      data: { event },
      timestamp: new Date(),
    });
  }

  public subscribeToConversation(conversationId: string): void {
    this.send({
      type: 'subscribe',
      data: { conversationId },
      timestamp: new Date(),
    });
  }

  public unsubscribeFromConversation(conversationId: string): void {
    this.send({
      type: 'unsubscribe',
      data: { conversationId },
      timestamp: new Date(),
    });
  }

  public subscribeToAnalysis(analysisId: string): void {
    this.send({
      type: 'subscribe',
      data: { analysisId },
      timestamp: new Date(),
    });
  }

  public subscribeToVisualization(visualizationId: string): void {
    this.send({
      type: 'subscribe',
      data: { visualizationId },
      timestamp: new Date(),
    });
  }

  private emit(event: string, data: any): void {
    const callbacks = this.subscriptions.get(event);
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in WebSocket callback for event ${event}:`, error);
        }
      });
    }
  }

  public isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  public getConnectionState(): string {
    if (!this.ws) return 'DISCONNECTED';
    switch (this.ws.readyState) {
      case WebSocket.CONNECTING: return 'CONNECTING';
      case WebSocket.OPEN: return 'OPEN';
      case WebSocket.CLOSING: return 'CLOSING';
      case WebSocket.CLOSED: return 'CLOSED';
      default: return 'UNKNOWN';
    }
  }

  public getStats(): {
    connected: boolean;
    state: string;
    subscriptions: number;
    reconnectAttempts: number;
    queuedMessages: number;
  } {
    return {
      connected: this.isConnected(),
      state: this.getConnectionState(),
      subscriptions: this.subscriptions.size,
      reconnectAttempts: this.reconnectAttempts,
      queuedMessages: this.messageQueue.length,
    };
  }

  public disconnect(): void {
    this.stopHeartbeat();

    if (this.ws) {
      this.ws.close(1000, 'Client disconnecting');
      this.ws = null;
    }

    this.subscriptions.clear();
    this.messageQueue = [];
  }

  public reconnect(): void {
    this.disconnect();
    this.reconnectAttempts = 0;
    this.connect();
  }
}

// Create singleton instance
export const webSocketService = new WebSocketService();

export default webSocketService;