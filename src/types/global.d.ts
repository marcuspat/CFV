/**
 * Global type declarations for browser environment
 */

declare global {
  interface WebSocket {
    close(code?: number, reason?: string): void;
    send(data: string | ArrayBuffer | Blob): void;
    addEventListener(type: string, listener: EventListener): void;
    removeEventListener(type: string, listener: EventListener): void;
  }

  const WebSocket: {
    new(url: string, protocols?: string | string[]): WebSocket;
    readonly CONNECTING: number;
    readonly OPEN: number;
    readonly CLOSING: number;
    readonly CLOSED: number;
  };

  interface MessageEvent {
    readonly data: string | ArrayBuffer | Blob;
  }

  interface CloseEvent {
    readonly code: number;
    readonly reason: string;
    readonly wasClean: boolean;
  }
}

export {};