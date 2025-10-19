/**
 * Database configuration for Cognitive Fabric Visualizer
 * Supports PostgreSQL, Neo4j, and Redis
 */

import { Pool, PoolConfig } from 'pg';
import neo4j, { Driver, Session } from 'neo4j-driver';
import { createClient, RedisClientType } from 'redis';
import { DatabaseConfiguration } from '../types';

class DatabaseManager {
  private postgresPool?: Pool;
  private neo4jDriver?: Driver;
  private redisClient?: RedisClientType;
  private isInitialized = false;

  async initialize(config: DatabaseConfiguration): Promise<void> {
    try {
      console.log('Initializing database connections...');

      // Initialize PostgreSQL
      await this.initializePostgres(config.postgres);

      // Initialize Neo4j
      await this.initializeNeo4j(config.neo4j);

      // Initialize Redis
      await this.initializeRedis(config.redis);

      this.isInitialized = true;
      console.log('All database connections initialized successfully');
    } catch (error) {
      console.error('Failed to initialize database connections:', error);
      throw error;
    }
  }

  private async initializePostgres(config: DatabaseConfiguration['postgres']): Promise<void> {
    const poolConfig: PoolConfig = {
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.username,
      password: config.password,
      ssl: config.ssl,
      max: config.maxConnections || 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    };

    this.postgresPool = new Pool(poolConfig);

    // Test connection
    const client = await this.postgresPool.connect();
    try {
      await client.query('SELECT NOW()');
      console.log('PostgreSQL connection established');
    } finally {
      client.release();
    }
  }

  private async initializeNeo4j(config: DatabaseConfiguration['neo4j']): Promise<void> {
    this.neo4jDriver = neo4j.driver(
      config.uri,
      neo4j.auth.basic(config.username, config.password),
      {
        maxConnectionPoolSize: config.maxConnectionPoolSize || 50,
        connectionTimeout: 30000,
        maxTransactionRetryTime: 30000,
      }
    );

    // Test connection
    const session = this.neo4jDriver.session({
      database: config.database || 'neo4j'
    });
    try {
      await session.run('RETURN 1');
      console.log('Neo4j connection established');
    } finally {
      await session.close();
    }
  }

  private async initializeRedis(config: DatabaseConfiguration['redis']): Promise<void> {
    this.redisClient = createClient({
      url: config.url,
    });

    if (config.keyPrefix) {
      this.redisClient.options = {
        ...this.redisClient.options,
        keyPrefix: config.keyPrefix,
      };
    }

    this.redisClient.on('error', (error) => {
      console.error('Redis Client Error:', error);
    });

    await this.redisClient.connect();
    console.log('Redis connection established');
  }

  // PostgreSQL Methods
  get postgres(): Pool {
    if (!this.postgresPool) {
      throw new Error('PostgreSQL not initialized');
    }
    return this.postgresPool;
  }

  async query(text: string, params?: any[]): Promise<any> {
    const client = await this.postgres!.connect();
    try {
      const result = await client.query(text, params);
      return result;
    } finally {
      client.release();
    }
  }

  // Neo4j Methods
  get neo4j(): Driver {
    if (!this.neo4jDriver) {
      throw new Error('Neo4j not initialized');
    }
    return this.neo4jDriver;
  }

  getNeo4jSession(database?: string): Session {
    if (!this.neo4jDriver) {
      throw new Error('Neo4j not initialized');
    }
    return this.neo4jDriver.session({
      database: database || 'neo4j',
    });
  }

  async runCypherQuery(query: string, params?: any): Promise<any> {
    const session = this.getNeo4jSession();
    try {
      const result = await session.run(query, params);
      return result;
    } finally {
      await session.close();
    }
  }

  // Redis Methods
  get redis(): RedisClientType {
    if (!this.redisClient) {
      throw new Error('Redis not initialized');
    }
    return this.redisClient;
  }

  async setCache(key: string, value: any, ttl?: number): Promise<void> {
    const serialized = JSON.stringify(value);
    if (ttl) {
      await this.redis!.setEx(key, ttl, serialized);
    } else {
      await this.redis!.set(key, serialized);
    }
  }

  async getCache(key: string): Promise<any | null> {
    const value = await this.redis!.get(key);
    if (!value) return null;
    return JSON.parse(value);
  }

  async deleteCache(key: string): Promise<void> {
    await this.redis!.del(key);
  }

  // Health Check Methods
  async healthCheck(): Promise<{ postgres: boolean; neo4j: boolean; redis: boolean }> {
    const health = {
      postgres: false,
      neo4j: false,
      redis: false,
    };

    try {
      // Check PostgreSQL
      await this.query('SELECT 1');
      health.postgres = true;
    } catch (error) {
      console.error('PostgreSQL health check failed:', error);
    }

    try {
      // Check Neo4j
      await this.runCypherQuery('RETURN 1');
      health.neo4j = true;
    } catch (error) {
      console.error('Neo4j health check failed:', error);
    }

    try {
      // Check Redis
      await this.redis!.ping();
      health.redis = true;
    } catch (error) {
      console.error('Redis health check failed:', error);
    }

    return health;
  }

  // Migration Methods
  async runMigrations(): Promise<void> {
    console.log('Running database migrations...');

    await this.runPostgresMigrations();
    await this.runNeo4jMigrations();

    console.log('Migrations completed successfully');
  }

  private async runPostgresMigrations(): Promise<void> {
    const migrations = [
      `CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) UNIQUE NOT NULL,
        username VARCHAR(100) UNIQUE NOT NULL,
        full_name VARCHAR(255) NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL DEFAULT 'viewer',
        preferences JSONB DEFAULT '{}',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        last_login_at TIMESTAMP WITH TIME ZONE
      )`,

      `CREATE TABLE IF NOT EXISTS conversations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title VARCHAR(500) NOT NULL,
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        metadata JSONB DEFAULT '{}',
        processing_status VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )`,

      `CREATE TABLE IF NOT EXISTS conversation_transcripts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
        sequence_number INTEGER NOT NULL,
        content TEXT NOT NULL,
        speaker VARCHAR(100),
        timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(conversation_id, sequence_number)
      )`,

      `CREATE TABLE IF NOT EXISTS cognitive_analyses (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
        analysis_data JSONB NOT NULL,
        processing_metrics JSONB DEFAULT '{}',
        accuracy_metrics JSONB DEFAULT '{}',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )`,

      `CREATE TABLE IF NOT EXISTS cognitive_elements (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        analysis_id UUID REFERENCES cognitive_analyses(id) ON DELETE CASCADE,
        element_type VARCHAR(100) NOT NULL,
        content TEXT NOT NULL,
        confidence FLOAT NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
        position JSONB,
        connections JSONB DEFAULT '[]',
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )`,

      `CREATE TABLE IF NOT EXISTS visualizations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
        visualization_type VARCHAR(100) NOT NULL,
        data JSONB NOT NULL,
        config JSONB DEFAULT '{}',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        expires_at TIMESTAMP WITH TIME ZONE
      )`,

      `CREATE TABLE IF NOT EXISTS exports (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
        format VARCHAR(50) NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        file_path VARCHAR(500),
        file_size BIGINT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        expires_at TIMESTAMP WITH TIME ZONE
      )`,
    ];

    for (const migration of migrations) {
      await this.query(migration);
    }

    // Create indexes
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(processing_status)',
      'CREATE INDEX IF NOT EXISTS idx_conversations_created_at ON conversations(created_at DESC)',
      'CREATE INDEX IF NOT EXISTS idx_cognitive_elements_analysis_id ON cognitive_elements(analysis_id)',
      'CREATE INDEX IF NOT EXISTS idx_cognitive_elements_type ON cognitive_elements(element_type)',
      'CREATE INDEX IF NOT EXISTS idx_cognitive_elements_confidence ON cognitive_elements(confidence)',
      'CREATE INDEX IF NOT EXISTS idx_visualizations_conversation_id ON visualizations(conversation_id)',
      'CREATE INDEX IF NOT EXISTS idx_visualizations_type ON visualizations(visualization_type)',
      'CREATE INDEX IF NOT EXISTS idx_visualizations_expires_at ON visualizations(expires_at)',
    ];

    for (const index of indexes) {
      await this.query(index);
    }
  }

  private async runNeo4jMigrations(): Promise<void> {
    const migrations = [
      // Create constraints
      'CREATE CONSTRAINT cognitive_element_id IF NOT EXISTS FOR (c:CognitiveElement) REQUIRE c.id IS UNIQUE',
      'CREATE CONSTRAINT conversation_id IF NOT EXISTS FOR (c:Conversation) REQUIRE c.id IS UNIQUE',
      'CREATE CONSTRAINT user_id IF NOT EXISTS FOR (u:User) REQUIRE u.id IS UNIQUE',

      // Create indexes
      'CREATE INDEX cognitive_element_type IF NOT EXISTS FOR (c:CognitiveElement) ON (c.type)',
      'CREATE INDEX cognitive_element_confidence IF NOT EXISTS FOR (c:CognitiveElement) ON (c.confidence)',
      'CREATE INDEX conversation_created_at IF NOT EXISTS FOR (c:Conversation) ON (c.createdAt)',
      'CREATE INDEX cognitive_relationship_strength IF NOT EXISTS FOR ()-[r:COGNITIVE_RELATIONSHIP]-() ON (r.strength)',
    ];

    for (const migration of migrations) {
      try {
        await this.runCypherQuery(migration);
      } catch (error) {
        // Ignore constraint/index already exists errors
        if (!error.message.includes('already exists')) {
          throw error;
        }
      }
    }
  }

  // Cleanup Methods
  async close(): Promise<void> {
    console.log('Closing database connections...');

    if (this.postgresPool) {
      await this.postgresPool.end();
      console.log('PostgreSQL connection closed');
    }

    if (this.neo4jDriver) {
      await this.neo4jDriver.close();
      console.log('Neo4j connection closed');
    }

    if (this.redisClient) {
      await this.redisClient.quit();
      console.log('Redis connection closed');
    }

    this.isInitialized = false;
  }

  get isConnected(): boolean {
    return this.isInitialized;
  }
}

// Export the class for testing
export { DatabaseManager };

// Singleton instance
export const database = new DatabaseManager();

export default database;