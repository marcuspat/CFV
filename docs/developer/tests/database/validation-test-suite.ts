/**
 * Comprehensive Database Validation Test Suite for Cognitive Fabric Visualizer
 * Tests PostgreSQL, Neo4j, and Redis connectivity and operations
 */

import { Pool } from 'pg';
import neo4j, { Driver } from 'neo4j-driver';
import { createClient, RedisClientType } from 'redis';
import { DatabaseManager } from '../../src/server/config/database';

interface TestResult {
  database: string;
  test: string;
  status: 'PASS' | 'FAIL' | 'SKIP';
  message: string;
  duration: number;
  details?: any;
}

interface DatabaseConfig {
  postgres: {
    host: string;
    port: number;
    database: string;
    username: string;
    password: string;
  };
  neo4j: {
    uri: string;
    username: string;
    password: string;
    database?: string;
  };
  redis: {
    host: string;
    port: number;
    password?: string;
    db: number;
  };
}

class DatabaseValidationSuite {
  private results: TestResult[] = [];
  private databaseManager: DatabaseManager;
  private config: DatabaseConfig;

  constructor() {
    this.databaseManager = new DatabaseManager();
    this.config = this.loadConfig();
  }

  private loadConfig(): DatabaseConfig {
    return {
      postgres: {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432'),
        database: process.env.DB_NAME || 'cognitive_fabric',
        username: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'password'
      },
      neo4j: {
        uri: process.env.NEO4J_URI || 'bolt://localhost:7687',
        username: process.env.NEO4J_USER || 'neo4j',
        password: process.env.NEO4J_PASSWORD || 'password',
        database: 'neo4j'
      },
      redis: {
        host: 'localhost',
        port: 6379,
        password: undefined,
        db: 0
      }
    };
  }

  private async runTest(
    database: string,
    testName: string,
    testFn: () => Promise<void>
  ): Promise<void> {
    const startTime = Date.now();
    try {
      await testFn();
      const duration = Date.now() - startTime;
      this.results.push({
        database,
        test: testName,
        status: 'PASS',
        message: `${testName} completed successfully`,
        duration
      });
      console.log(`✅ [${database}] ${testName} - ${duration}ms`);
    } catch (error) {
      const duration = Date.now() - startTime;
      this.results.push({
        database,
        test: testName,
        status: 'FAIL',
        message: error.message,
        duration,
        details: error
      });
      console.log(`❌ [${database}] ${testName} - ${duration}ms - ${error.message}`);
    }
  }

  // ==================== POSTGRESQL TESTS ====================

  async testPostgreSQL(): Promise<void> {
    console.log('\n🐘 Testing PostgreSQL...');

    // Test 1: Connection Establishment
    await this.runTest('PostgreSQL', 'Connection Establishment', async () => {
      const pool = new Pool({
        host: this.config.postgres.host,
        port: this.config.postgres.port,
        database: this.config.postgres.database,
        user: this.config.postgres.username,
        password: this.config.postgres.password,
        connectionTimeoutMillis: 5000
      });

      const client = await pool.connect();
      const result = await client.query('SELECT version()');
      await client.release();
      await pool.end();

      if (!result.rows[0]) {
        throw new Error('No version information returned');
      }
    });

    // Test 2: Database Manager Integration
    await this.runTest('PostgreSQL', 'Database Manager Integration', async () => {
      await this.databaseManager.initialize({
        postgres: this.config.postgres,
        neo4j: this.config.neo4j,
        redis: this.config.redis
      });

      const health = await this.databaseManager.healthCheck();
      if (!health.postgres) {
        throw new Error('PostgreSQL health check failed');
      }
    });

    // Test 3: Schema Validation
    await this.runTest('PostgreSQL', 'Schema Validation', async () => {
      await this.databaseManager.runMigrations();

      // Verify tables exist
      const tables = await this.databaseManager.query(`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
      `);

      const expectedTables = [
        'users', 'conversations', 'conversation_transcripts',
        'cognitive_analyses', 'cognitive_elements', 'visualizations', 'exports'
      ];

      const actualTables = tables.rows.map(row => row.table_name);
      for (const expectedTable of expectedTables) {
        if (!actualTables.includes(expectedTable)) {
          throw new Error(`Missing table: ${expectedTable}`);
        }
      }
    });

    // Test 4: CRUD Operations
    await this.runTest('PostgreSQL', 'CRUD Operations', async () => {
      // Create
      const userResult = await this.databaseManager.query(`
        INSERT INTO users (email, username, full_name, password_hash, role)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, email, username
      `, ['test@example.com', 'testuser', 'Test User', 'hashed_password', 'viewer']);

      const userId = userResult.rows[0].id;

      // Read
      const readResult = await this.databaseManager.query(
        'SELECT * FROM users WHERE id = $1',
        [userId]
      );
      if (readResult.rows.length !== 1) {
        throw new Error('User not found after insert');
      }

      // Update
      await this.databaseManager.query(
        'UPDATE users SET full_name = $1 WHERE id = $2',
        ['Updated Test User', userId]
      );

      // Delete
      await this.databaseManager.query(
        'DELETE FROM users WHERE id = $1',
        [userId]
      );

      // Verify deletion
      const deleteCheck = await this.databaseManager.query(
        'SELECT * FROM users WHERE id = $1',
        [userId]
      );
      if (deleteCheck.rows.length > 0) {
        throw new Error('User not deleted properly');
      }
    });

    // Test 5: Transaction Management
    await this.runTest('PostgreSQL', 'Transaction Management', async () => {
      const client = await this.databaseManager.postgres.connect();

      try {
        await client.query('BEGIN');

        // Insert user within transaction
        const userResult = await client.query(`
          INSERT INTO users (email, username, full_name, password_hash, role)
          VALUES ($1, $2, $3, $4, $5)
          RETURNING id
        `, ['transaction@example.com', 'transuser', 'Transaction User', 'hashed_password', 'viewer']);

        const userId = userResult.rows[0].id;

        // Rollback transaction
        await client.query('ROLLBACK');

        // Verify rollback worked
        const checkResult = await client.query(
          'SELECT * FROM users WHERE id = $1',
          [userId]
        );

        if (checkResult.rows.length > 0) {
          throw new Error('Transaction rollback failed - user still exists');
        }
      } finally {
        client.release();
      }
    });

    // Test 6: Connection Pool Performance
    await this.runTest('PostgreSQL', 'Connection Pool Performance', async () => {
      const concurrentQueries = 10;
      const startTime = Date.now();

      const promises = Array(concurrentQueries).fill(null).map(() =>
        this.databaseManager.query('SELECT pg_sleep(0.1), NOW()')
      );

      await Promise.all(promises);
      const duration = Date.now() - startTime;

      // Should complete in reasonable time (allowing for connection pool reuse)
      if (duration > 2000) {
        throw new Error(`Connection pool performance poor: ${duration}ms for ${concurrentQueries} queries`);
      }
    });

    // Test 7: Index Performance
    await this.runTest('PostgreSQL', 'Index Performance', async () => {
      // Insert test data
      const insertPromises = Array(100).fill(null).map((_, i) =>
        this.databaseManager.query(`
          INSERT INTO cognitive_elements (analysis_id, element_type, content, confidence)
          VALUES ($1, $2, $3, $4)
        `, [gen_random_uuid(), 'test_element', `Test content ${i}`, Math.random()])
      );

      await Promise.all(insertPromises);

      // Test indexed query performance
      const startTime = Date.now();
      await this.databaseManager.query(`
        SELECT * FROM cognitive_elements
        WHERE element_type = 'test_element' AND confidence > 0.5
        LIMIT 10
      `);
      const queryTime = Date.now() - startTime;

      // Clean up test data
      await this.databaseManager.query(`
        DELETE FROM cognitive_elements WHERE element_type = 'test_element'
      `);

      if (queryTime > 100) {
        throw new Error(`Index performance poor: ${queryTime}ms for indexed query`);
      }
    });
  }

  // ==================== NEO4J TESTS ====================

  async testNeo4j(): Promise<void> {
    console.log('\n🔷 Testing Neo4j...');

    // Test 1: Connection Establishment
    await this.runTest('Neo4j', 'Connection Establishment', async () => {
      const driver = neo4j.driver(
        this.config.neo4j.uri,
        neo4j.auth.basic(this.config.neo4j.username, this.config.neo4j.password),
        { connectionTimeout: 5000 }
      );

      const session = driver.session({ database: this.config.neo4j.database });
      const result = await session.run('RETURN 1 as test');
      await session.close();
      await driver.close();

      if (!result.records[0]) {
        throw new Error('No records returned from Neo4j');
      }
    });

    // Test 2: Database Manager Integration
    await this.runTest('Neo4j', 'Database Manager Integration', async () => {
      const health = await this.databaseManager.healthCheck();
      if (!health.neo4j) {
        throw new Error('Neo4j health check failed');
      }
    });

    // Test 3: Graph Schema Validation
    await this.runTest('Neo4j', 'Graph Schema Validation', async () => {
      await this.databaseManager.runNeo4jMigrations();

      // Verify constraints and indexes
      const constraintsResult = await this.databaseManager.runCypherQuery(`
        SHOW CONSTRAINTS
      `);

      const expectedConstraints = ['cognitive_element_id', 'conversation_id', 'user_id'];
      const actualConstraints = constraintsResult.records.map(
        record => record.get('name')
      );

      for (const expectedConstraint of expectedConstraints) {
        if (!actualConstraints.includes(expectedConstraint)) {
          throw new Error(`Missing constraint: ${expectedConstraint}`);
        }
      }
    });

    // Test 4: Cognitive Element Creation
    await this.runTest('Neo4j', 'Cognitive Element Creation', async () => {
      const elementId = 'test-cognitive-element-123';

      // Create cognitive element
      await this.databaseManager.runCypherQuery(`
        CREATE (c:CognitiveElement {
          id: $id,
          type: $type,
          content: $content,
          confidence: $confidence,
          createdAt: datetime()
        })
      `, {
        id: elementId,
        type: 'factual_retrieval',
        content: 'Test cognitive content',
        confidence: 0.95
      });

      // Verify creation
      const result = await this.databaseManager.runCypherQuery(`
        MATCH (c:CognitiveElement {id: $id})
        RETURN c
      `, { id: elementId });

      if (result.records.length !== 1) {
        throw new Error('Cognitive element not created');
      }

      // Clean up
      await this.databaseManager.runCypherQuery(`
        MATCH (c:CognitiveElement {id: $id})
        DELETE c
      `, { id: elementId });
    });

    // Test 5: Cognitive Relationship Creation
    await this.runTest('Neo4j', 'Cognitive Relationship Creation', async () => {
      const element1Id = 'test-element-1';
      const element2Id = 'test-element-2';

      // Create two cognitive elements
      await this.databaseManager.runCypherQuery(`
        CREATE (c1:CognitiveElement {id: $id1, type: 'factual', confidence: 0.9}),
               (c2:CognitiveElement {id: $id2, type: 'logical', confidence: 0.85})
      `, { id1: element1Id, id2: element2Id });

      // Create relationship
      await this.databaseManager.runCypherQuery(`
        MATCH (c1:CognitiveElement {id: $id1}), (c2:CognitiveElement {id: $id2})
        CREATE (c1)-[r:COGNITIVE_RELATIONSHIP {strength: 0.8, type: 'supports'}]->(c2)
      `, { id1: element1Id, id2: element2Id });

      // Verify relationship
      const result = await this.databaseManager.runCypherQuery(`
        MATCH (c1:CognitiveElement {id: $id1})-[r:COGNITIVE_RELATIONSHIP]->(c2:CognitiveElement {id: $id2})
        RETURN r
      `, { id1: element1Id, id2: element2Id });

      if (result.records.length !== 1) {
        throw new Error('Cognitive relationship not created');
      }

      // Clean up
      await this.databaseManager.runCypherQuery(`
        MATCH (c:CognitiveElement)
        WHERE c.id IN [$id1, $id2]
        DETACH DELETE c
      `, { id1: element1Id, id2: element2Id });
    });

    // Test 6: Graph Traversal Performance
    await this.runTest('Neo4j', 'Graph Traversal Performance', async () => {
      // Create test graph structure
      const numNodes = 50;
      const nodes = Array(numNodes).fill(null).map((_, i) => ({
        id: `traversal-test-${i}`,
        type: i % 2 === 0 ? 'factual' : 'logical',
        confidence: 0.5 + Math.random() * 0.5
      }));

      // Batch create nodes
      await this.databaseManager.runCypherQuery(`
        UNWIND $nodes AS node
        CREATE (c:CognitiveElement {id: node.id, type: node.type, confidence: node.confidence})
      `, { nodes });

      // Create relationships between consecutive nodes
      await this.databaseManager.runCypherQuery(`
        MATCH (c1:CognitiveElement), (c2:CognitiveElement)
        WHERE c1.id STARTS WITH 'traversal-test-' AND c2.id STARTS WITH 'traversal-test-'
        WITH c1, c2, toInteger(split(c1.id, '-')[2]) AS idx1, toInteger(split(c2.id, '-')[2]) AS idx2
        WHERE idx2 = idx1 + 1
        CREATE (c1)-[:COGNITIVE_RELATIONSHIP {strength: 0.7}]->(c2)
      `);

      // Test traversal performance
      const startTime = Date.now();
      const result = await this.databaseManager.runCypherQuery(`
        MATCH path = (start:CognitiveElement {id: $startId})-[:COGNITIVE_RELATIONSHIP*5]->(end)
        RETURN path
        LIMIT 10
      `, { startId: 'traversal-test-0' });

      const traversalTime = Date.now() - startTime;

      // Clean up test data
      await this.databaseManager.runCypherQuery(`
        MATCH (c:CognitiveElement)
        WHERE c.id STARTS WITH 'traversal-test-'
        DETACH DELETE c
      `);

      if (traversalTime > 500) {
        throw new Error(`Graph traversal performance poor: ${traversalTime}ms`);
      }
    });

    // Test 7: Complex Cypher Query
    await this.runTest('Neo4j', 'Complex Cypher Query', async () => {
      // Create a small cognitive fabric for testing
      const fabricData = {
        conversation: { id: 'test-conversation', title: 'Test Conversation' },
        elements: [
          { id: 'elem1', type: 'factual', confidence: 0.95, content: 'Fact A' },
          { id: 'elem2', type: 'logical', confidence: 0.88, content: 'Logic B' },
          { id: 'elem3', type: 'creative', confidence: 0.75, content: 'Creative C' }
        ]
      };

      // Create conversation and elements
      await this.databaseManager.runCypherQuery(`
        CREATE (conv:Conversation {id: $convId, title: $convTitle, createdAt: datetime()})
      `, { convId: fabricData.conversation.id, convTitle: fabricData.conversation.title });

      for (const element of fabricData.elements) {
        await this.databaseManager.runCypherQuery(`
          MATCH (conv:Conversation {id: $convId})
          CREATE (conv)-[:HAS_ELEMENT]->(elem:CognitiveElement {
            id: $elemId,
            type: $elemType,
            confidence: $elemConfidence,
            content: $elemContent,
            createdAt: datetime()
          })
        `, {
          convId: fabricData.conversation.id,
          elemId: element.id,
          elemType: element.type,
          elemConfidence: element.confidence,
          elemContent: element.content
        });
      }

      // Complex query: Find high-confidence logical elements and their relationships
      const result = await this.databaseManager.runCypherQuery(`
        MATCH (conv:Conversation {id: $convId})-[:HAS_ELEMENT]->(elem:CognitiveElement)
        WHERE elem.type = 'logical' AND elem.confidence > 0.8
        OPTIONAL MATCH (elem)-[r:COGNITIVE_RELATIONSHIP]-(related:CognitiveElement)
        RETURN elem, COUNT(r) as relationshipCount, AVG(related.confidence) as avgRelatedConfidence
      `, { convId: fabricData.conversation.id });

      // Clean up
      await this.databaseManager.runCypherQuery(`
        MATCH (conv:Conversation {id: $convId})
        DETACH DELETE conv
      `, { convId: fabricData.conversation.id });

      if (result.records.length === 0) {
        throw new Error('Complex query returned no results');
      }
    });
  }

  // ==================== REDIS TESTS ====================

  async testRedis(): Promise<void> {
    console.log('\n🔴 Testing Redis...');

    // Test 1: Connection Establishment
    await this.runTest('Redis', 'Connection Establishment', async () => {
      const redisUrl = process.env.REDIS_URL || `redis://${this.config.redis.host}:${this.config.redis.port}`;
      const client = createClient({
        url: redisUrl,
        password: this.config.redis.password,
        database: this.config.redis.db
      });

      client.on('error', (err) => {
        throw new Error(`Redis connection error: ${err.message}`);
      });

      await client.connect();
      const pong = await client.ping();
      await client.quit();

      if (pong !== 'PONG') {
        throw new Error('Redis PING failed');
      }
    });

    // Test 2: Database Manager Integration
    await this.runTest('Redis', 'Database Manager Integration', async () => {
      const health = await this.databaseManager.healthCheck();
      if (!health.redis) {
        throw new Error('Redis health check failed');
      }
    });

    // Test 3: Basic CRUD Operations
    await this.runTest('Redis', 'Basic CRUD Operations', async () => {
      const testKey = 'test:key:crud';
      const testValue = { message: 'Hello Redis!', timestamp: Date.now() };

      // SET
      await this.databaseManager.setCache(testKey, testValue);

      // GET
      const retrieved = await this.databaseManager.getCache(testKey);
      if (!retrieved || retrieved.message !== testValue.message) {
        throw new Error('Redis GET operation failed');
      }

      // DELETE
      await this.databaseManager.deleteCache(testKey);

      // Verify deletion
      const deleted = await this.databaseManager.getCache(testKey);
      if (deleted !== null) {
        throw new Error('Redis DELETE operation failed');
      }
    });

    // Test 4: TTL Management
    await this.runTest('Redis', 'TTL Management', async () => {
      const testKey = 'test:key:ttl';
      const testValue = { message: 'Expires soon' };
      const ttl = 2; // 2 seconds

      // SET with TTL
      await this.databaseManager.setCache(testKey, testValue, ttl);

      // Verify exists immediately
      const immediate = await this.databaseManager.getCache(testKey);
      if (!immediate) {
        throw new Error('Key should exist immediately after SET');
      }

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, (ttl + 1) * 1000));

      // Verify expired
      const expired = await this.databaseManager.getCache(testKey);
      if (expired !== null) {
        throw new Error('Key should have expired');
      }
    });

    // Test 5: Data Types Operations
    await this.runTest('Redis', 'Data Types Operations', async () => {
      const client = this.databaseManager.redis;

      // String operations
      await client.set('test:string', 'hello world');
      const stringValue = await client.get('test:string');
      if (stringValue !== 'hello world') {
        throw new Error('String operations failed');
      }

      // Hash operations
      await client.hSet('test:hash', {
        field1: 'value1',
        field2: 'value2',
        field3: 'value3'
      });
      const hashValue = await client.hGetAll('test:hash');
      if (Object.keys(hashValue).length !== 3) {
        throw new Error('Hash operations failed');
      }

      // List operations
      await client.lPush('test:list', ['item1', 'item2', 'item3']);
      const listLength = await client.lLen('test:list');
      if (listLength !== 3) {
        throw new Error('List operations failed');
      }

      // Set operations
      await client.sAdd('test:set', ['member1', 'member2', 'member3']);
      const setMembers = await client.sMembers('test:set');
      if (setMembers.length !== 3) {
        throw new Error('Set operations failed');
      }

      // Clean up
      await client.del('test:string', 'test:hash', 'test:list', 'test:set');
    });

    // Test 6: Performance Testing
    await this.runTest('Redis', 'Performance Testing', async () => {
      const numOperations = 1000;
      const client = this.databaseManager.redis;

      // Test SET performance
      const setStartTime = Date.now();
      for (let i = 0; i < numOperations; i++) {
        await client.set(`perf:test:${i}`, `value${i}`);
      }
      const setTime = Date.now() - setStartTime;

      // Test GET performance
      const getStartTime = Date.now();
      for (let i = 0; i < numOperations; i++) {
        await client.get(`perf:test:${i}`);
      }
      const getTime = Date.now() - getStartTime;

      // Clean up performance test data
      const keys = Array(numOperations).fill(null).map((_, i) => `perf:test:${i}`);
      await client.del(keys);

      // Performance assertions (should handle 1000 operations in reasonable time)
      if (setTime > 1000) {
        throw new Error(`SET performance poor: ${setTime}ms for ${numOperations} operations`);
      }

      if (getTime > 1000) {
        throw new Error(`GET performance poor: ${getTime}ms for ${numOperations} operations`);
      }
    });

    // Test 7: Memory Usage Monitoring
    await this.runTest('Redis', 'Memory Usage Monitoring', async () => {
      const client = this.databaseManager.redis;

      // Get initial memory usage
      const initialMemory = await client.info('memory');
      const initialMemoryMatch = initialMemory.match(/used_memory:(\d+)/);
      const initialMemoryBytes = initialMemoryMatch ? parseInt(initialMemoryMatch[1]) : 0;

      // Create test data to increase memory usage
      const testData = Array(100).fill(null).map((_, i) => ({
        key: `memory:test:${i}`,
        value: 'x'.repeat(1000) // 1KB per key
      }));

      for (const data of testData) {
        await client.set(data.key, data.value);
      }

      // Check memory usage after adding data
      const afterMemory = await client.info('memory');
      const afterMemoryMatch = afterMemory.match(/used_memory:(\d+)/);
      const afterMemoryBytes = afterMemoryMatch ? parseInt(afterMemoryMatch[1]) : 0;

      // Memory should have increased
      if (afterMemoryBytes <= initialMemoryBytes) {
        throw new Error('Memory usage did not increase as expected');
      }

      // Clean up
      await client.del(testData.map(d => d.key));
    });

    // Test 8: Pub/Sub Functionality
    await this.runTest('Redis', 'Pub/Sub Functionality', async () => {
      const redisUrl = process.env.REDIS_URL || `redis://${this.config.redis.host}:${this.config.redis.port}`;
      const subscriber = createClient({
        url: redisUrl,
        password: this.config.redis.password,
        database: this.config.redis.db
      });

      await subscriber.connect();

      const channel = 'test:cognitive:updates';
      const testMessage = { type: 'update', data: 'test data' };

      let messageReceived = false;
      let receivedMessage = null;

      // Subscribe to channel
      await subscriber.subscribe(channel, (message) => {
        messageReceived = true;
        receivedMessage = JSON.parse(message);
      });

      // Publish message
      await this.databaseManager.redis.publish(channel, JSON.stringify(testMessage));

      // Wait for message to be received
      await new Promise(resolve => setTimeout(resolve, 100));

      if (!messageReceived) {
        throw new Error('Pub/Sub message not received');
      }

      if (receivedMessage.type !== testMessage.type) {
        throw new Error('Pub/Sub message content mismatch');
      }

      await subscriber.quit();
    });
  }

  // ==================== INTEGRATION TESTS ====================

  async testIntegration(): Promise<void> {
    console.log('\n🔗 Running Integration Tests...');

    // Test 1: Cross-Database Operations
    await this.runTest('Integration', 'Cross-Database Operations', async () => {
      // Create user in PostgreSQL
      const userResult = await this.databaseManager.query(`
        INSERT INTO users (email, username, full_name, password_hash, role)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, email, username
      `, ['integration@example.com', 'integration_user', 'Integration User', 'hashed_password', 'viewer']);

      const userId = userResult.rows[0].id;

      // Create conversation in PostgreSQL
      const convResult = await this.databaseManager.query(`
        INSERT INTO conversations (title, user_id, processing_status)
        VALUES ($1, $2, $3)
        RETURNING id, title
      `, ['Integration Test Conversation', userId, 'completed']);

      const conversationId = convResult.rows[0].id;

      // Create conversation node in Neo4j
      await this.databaseManager.runCypherQuery(`
        CREATE (c:Conversation {
          id: $convId,
          title: $title,
          postgresId: $postgresId,
          createdAt: datetime()
        })
      `, {
        convId: `neo4j-${conversationId}`,
        title: 'Integration Test Conversation',
        postgresId: conversationId
      });

      // Cache conversation summary in Redis
      await this.databaseManager.setCache(
        `conversation:${conversationId}:summary`,
        {
          id: conversationId,
          title: 'Integration Test Conversation',
          userId: userId,
          status: 'completed'
        },
        3600
      );

      // Verify integration
      const cachedSummary = await this.databaseManager.getCache(`conversation:${conversationId}:summary`);
      if (!cachedSummary || cachedSummary.id !== conversationId) {
        throw new Error('Integration test failed: caching not working');
      }

      // Clean up integration test data
      await this.databaseManager.query('DELETE FROM conversations WHERE id = $1', [conversationId]);
      await this.databaseManager.query('DELETE FROM users WHERE id = $1', [userId]);
      await this.databaseManager.runCypherQuery(`
        MATCH (c:Conversation {postgresId: $convId})
        DELETE c
      `, { convId: conversationId });
      await this.databaseManager.deleteCache(`conversation:${conversationId}:summary`);
    });

    // Test 2: Concurrent Access
    await this.runTest('Integration', 'Concurrent Access', async () => {
      const concurrentOperations = 20;
      const promises = [];

      // Concurrent PostgreSQL operations
      for (let i = 0; i < concurrentOperations; i++) {
        promises.push(
          this.databaseManager.query('SELECT pg_sleep(0.1), $1 as operation_id', [i])
        );
      }

      // Concurrent Neo4j operations
      for (let i = 0; i < concurrentOperations; i++) {
        promises.push(
          this.databaseManager.runCypherQuery('RETURN $i as operation_id', { i })
        );
      }

      // Concurrent Redis operations
      for (let i = 0; i < concurrentOperations; i++) {
        promises.push(
          this.databaseManager.setCache(`concurrent:test:${i}`, { value: i }, 60)
        );
      }

      const startTime = Date.now();
      await Promise.all(promises);
      const duration = Date.now() - startTime;

      // Should complete efficiently with proper connection pooling
      if (duration > 5000) {
        throw new Error(`Concurrent access performance poor: ${duration}ms`);
      }

      // Clean up Redis test data
      const redisKeys = Array(concurrentOperations).fill(null).map((_, i) => `concurrent:test:${i}`);
      for (const key of redisKeys) {
        await this.databaseManager.deleteCache(key);
      }
    });
  }

  // ==================== REPORT GENERATION ====================

  async runFullTestSuite(): Promise<void> {
    console.log('🚀 Starting Comprehensive Database Validation Test Suite...\n');

    const overallStartTime = Date.now();

    try {
      // Initialize database manager
      await this.databaseManager.initialize({
        postgres: this.config.postgres,
        neo4j: this.config.neo4j,
        redis: this.config.redis
      });

      // Run individual database tests
      await this.testPostgreSQL();
      await this.testNeo4j();
      await this.testRedis();
      await this.testIntegration();

    } catch (error) {
      console.error('Test suite initialization failed:', error);
      this.results.push({
        database: 'Test Suite',
        test: 'Initialization',
        status: 'FAIL',
        message: error.message,
        duration: 0,
        details: error
      });
    } finally {
      // Clean up database connections
      try {
        await this.databaseManager.close();
      } catch (error) {
        console.error('Error closing database connections:', error);
      }
    }

    const totalDuration = Date.now() - overallStartTime;
    this.generateReport(totalDuration);
  }

  private generateReport(totalDuration: number): void {
    console.log('\n' + '='.repeat(80));
    console.log('📊 DATABASE VALIDATION TEST SUITE REPORT');
    console.log('='.repeat(80));

    const byDatabase = this.results.reduce((acc, result) => {
      if (!acc[result.database]) {
        acc[result.database] = { pass: 0, fail: 0, skip: 0, total: 0 };
      }
      acc[result.database][result.status.toLowerCase()]++;
      acc[result.database].total++;
      return acc;
    }, {} as Record<string, any>);

    // Summary by database
    console.log('\n📈 SUMMARY BY DATABASE:');
    for (const [database, stats] of Object.entries(byDatabase)) {
      const passRate = ((stats.pass / stats.total) * 100).toFixed(1);
      console.log(`\n${database}:`);
      console.log(`  ✅ Pass: ${stats.pass}/${stats.total} (${passRate}%)`);
      console.log(`  ❌ Fail: ${stats.fail}/${stats.total}`);
      console.log(`  ⏭️  Skip: ${stats.skip}/${stats.total}`);
    }

    // Overall summary
    const totalTests = this.results.length;
    const passedTests = this.results.filter(r => r.status === 'PASS').length;
    const failedTests = this.results.filter(r => r.status === 'FAIL').length;
    const overallPassRate = ((passedTests / totalTests) * 100).toFixed(1);

    console.log(`\n🎯 OVERALL SUMMARY:`);
    console.log(`  Total Tests: ${totalTests}`);
    console.log(`  Passed: ${passedTests} (${overallPassRate}%)`);
    console.log(`  Failed: ${failedTests}`);
    console.log(`  Total Duration: ${totalDuration}ms`);

    // Failed tests details
    const failedResults = this.results.filter(r => r.status === 'FAIL');
    if (failedResults.length > 0) {
      console.log(`\n❌ FAILED TESTS:`);
      for (const result of failedResults) {
        console.log(`  [${result.database}] ${result.test}: ${result.message}`);
      }
    }

    // Performance analysis
    const avgTestDuration = this.results.reduce((sum, r) => sum + r.duration, 0) / totalTests;
    const slowestTest = this.results.reduce((max, r) => r.duration > max.duration ? r : max);
    const fastestTest = this.results.reduce((min, r) => r.duration < min.duration ? r : min);

    console.log(`\n⚡ PERFORMANCE ANALYSIS:`);
    console.log(`  Average Test Duration: ${avgTestDuration.toFixed(2)}ms`);
    console.log(`  Fastest Test: ${fastestTest.test} (${fastestTest.duration}ms)`);
    console.log(`  Slowest Test: ${slowestTest.test} (${slowestTest.duration}ms)`);

    // Validation criteria assessment
    console.log(`\n✅ VALIDATION CRITERIA ASSESSMENT:`);
    console.log(`  PostgreSQL Connectivity: ${byDatabase['PostgreSQL']?.pass > 0 ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`  Neo4j Connectivity: ${byDatabase['Neo4j']?.pass > 0 ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`  Redis Connectivity: ${byDatabase['Redis']?.pass > 0 ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`  Schema Validation: ${this.results.some(r => r.test.includes('Schema') && r.status === 'PASS') ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`  CRUD Operations: ${this.results.some(r => r.test.includes('CRUD') && r.status === 'PASS') ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`  Performance Targets: ${this.results.filter(r => r.test.includes('Performance')).every(r => r.status === 'PASS') ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`  Integration Tests: ${byDatabase['Integration']?.pass > 0 ? '✅ PASS' : '❌ FAIL'}`);

    // Recommendation
    const isOverallSuccess = parseFloat(overallPassRate) >= 95;
    console.log(`\n🎯 OVERALL STATUS: ${isOverallSuccess ? '✅ READY FOR PRODUCTION' : '❌ NEEDS ATTENTION'}`);

    if (!isOverallSuccess) {
      console.log('\n⚠️  RECOMMENDATIONS:');
      if (failedTests > 0) {
        console.log('  - Address failed tests before deploying to production');
      }
      if (parseFloat(overallPassRate) < 90) {
        console.log('  - Significant database issues detected - immediate attention required');
      }
      if (slowestTest.duration > 1000) {
        console.log('  - Optimize slow database operations');
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log('END OF DATABASE VALIDATION REPORT');
    console.log('='.repeat(80));
  }
}

// Export for direct execution
export { DatabaseValidationSuite };

// Run if executed directly
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  const suite = new DatabaseValidationSuite();
  suite.runFullTestSuite().catch(console.error);
}