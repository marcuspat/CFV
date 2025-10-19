// Test types for resolving unknown type issues

export interface TestResponse {
  data: any;
  status: number;
  statusText: string;
}

export interface MockApiResponse {
  status?: string;
  token?: string;
  refreshToken?: string;
  services?: Record<string, any>;
  version?: string;
  uptime?: string;
  environment?: string;
  responseTime?: string;
  models?: string[];
  capabilities?: string[];
  [key: string]: any;
}

// Generic type for test responses
export type GenericResponse = TestResponse & {
  data: MockApiResponse;
};