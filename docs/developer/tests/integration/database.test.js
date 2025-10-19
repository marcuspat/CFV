/**
 * Database integration tests
 * Tests database operations, transactions, and data consistency across PostgreSQL, Neo4j, and Redis
 */

import { Pool } from 'pg';
import neo4j from 'neo4j-driver';
import { createClient } from 'redis';
import database from '../../src/server/config/database';
import { createTestData } from '../setup/database.setup';

describe('Database Integration Tests', () => {
  let postgresPool;
  let neo4jDriver;
  let redisClient;
  let testConfig;

  beforeAll(async () => {
    // Test database configuration
    testConfig = {
      postgres: {
        host: process.env.TEST_POSTGRES_HOST || 'localhost',
        port: parseInt(process.env.TEST_POSTGRES_PORT) || 5432,
        database: process.env.TEST_POSTGRES_DB || 'cfv_test',
        user: process.env.TEST_POSTGRES_USER || 'test_user',
        password: process.env.TEST_POSTGRES_PASSWORD || 'test_password',
        max: 5,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
      },
      neo4j: {
        uri: process.env.TEST_NEO4J_URI || 'bolt://localhost:7687',
        database: process.env.TEST_NEO4J_DB || 'cfv_test',
        user: process.env.TEST_NEO4J_USER || 'neo4j',
        password: process.env.TEST_NEO4J_PASSWORD || 'test_password',
        maxConnectionLifetime: 3600000,
        maxConnectionPoolSize: 5,
      },
      redis: {
        host: process.env.TEST_REDIS_HOST || 'localhost',
        port: parseInt(process.env.TEST_REDIS_PORT) || 6379,
        db: parseInt(process.env.TEST_REDIS_DB) || 1,
        retryDelayOnFailover: 100,
        enableReadyCheck: false,
        maxRetriesPerRequest: null,
      }
    };

    // Initialize database connections
    await setupTestDatabases();
  });

  afterAll(async () => {
    await cleanupTestDatabases();
  });

  describe('PostgreSQL Integration', () => {
    describe('Connection Management', () => {
      test('should establish PostgreSQL connection', async () => {
        expect(postgresPool).toBeDefined();

        const client = await postgresPool.connect();
        expect(client).toBeDefined();

        const result = await client.query('SELECT NOW() as current_time');
        expect(result.rows).toHaveLength(1);
        expect(result.rows[0].current_time).toBeValidDate();

        client.release();
      });

      test('should handle connection pool limits', async () => {
        const connections = [];

        // Acquire maximum connections
        for (let i = 0; i < testConfig.postgres.max; i++) {
          const client = await postgresPool.connect();
          connections.push(client);
        }

        // Additional connection should timeout or wait
        const extraConnectionPromise = postgresPool.connect();
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Connection timeout')), 2000)
        );

        await expect(Promise.race([extraConnectionPromise, timeoutPromise]))
          .rejects.toThrow('Connection timeout');

        // Release connections
        connections.forEach(client => client.release());
      });

      test('should handle connection errors gracefully', async () => {
        // Create connection with invalid parameters
        const invalidPool = new Pool({
          host: 'invalid-host',
          port: 9999,
          database: 'invalid_db',
          user: 'invalid_user',
          password: 'invalid_password',
          connectionTimeoutMillis: 1000,
        });

        await expect(invalidPool.connect()).rejects.toThrow();
        await invalidPool.end();
      });
    });

    describe('CRUD Operations', () => {
      let testConversationId;
      let testUserId;

      beforeAll(async () => {
        // Create test user
        const userData = createTestData.user();
        const userResult = await postgresPool.query(`
          INSERT INTO users (email, username, password_hash, full_name, metadata)
          VALUES ($1, $2, $3, $4, $5)
          RETURNING id
        `, [
          userData.email,
          userData.username,
          userData.password_hash,
          userData.full_name,
          JSON.stringify(userData.metadata)
        ]);
        testUserId = userResult.rows[0].id;

        // Create test conversation
        const conversationData = createTestData.conversation({ user_id: testUserId });
        const convResult = await postgresPool.query(`
          INSERT INTO conversations (title, participants, metadata, user_id)
          VALUES ($1, $2, $3, $4)
          RETURNING id
        `, [
          conversationData.title,
          JSON.stringify(conversationData.participants),
          JSON.stringify(conversationData.metadata),
          testUserId
        ]);
        testConversationId = convResult.rows[0].id;
      });

      afterAll(async () => {
        // Cleanup test data
        await postgresPool.query('DELETE FROM conversations WHERE user_id = $1', [testUserId]);
        await postgresPool.query('DELETE FROM users WHERE id = $1', [testUserId]);
      });

      test('should create conversation record', async () => {
        const result = await postgresPool.query(`
          SELECT * FROM conversations WHERE id = $1
        `, [testConversationId]);

        expect(result.rows).toHaveLength(1);
        const conversation = result.rows[0];
        expect(conversation.title).toBeDefined();
        expect(conversation.participants).toBeDefined();
        expect(conversation.metadata).toBeDefined();
        expect(conversation.created_at).toBeValidDate();
        expect(conversation.updated_at).toBeValidDate();
      });

      test('should update conversation record', async () => {
        const updateData = { title: 'Updated Conversation Title' };

        await postgresPool.query(`
          UPDATE conversations
          SET title = $1, updated_at = NOW()
          WHERE id = $2
        `, [updateData.title, testConversationId]);

        const result = await postgresPool.query(`
          SELECT title, updated_at FROM conversations WHERE id = $1
        `, [testConversationId]);

        expect(result.rows[0].title).toBe(updateData.title);
        expect(result.rows[0].updated_at).toBeValidDate();
      });

      test('should read conversation with joins', async () => {
        const result = await postgresPool.query(`
          SELECT c.*, u.email as user_email, u.username as user_username
          FROM conversations c
          JOIN users u ON c.user_id = u.id
          WHERE c.id = $1
        `, [testConversationId]);

        expect(result.rows).toHaveLength(1);
        const row = result.rows[0];
        expect(row.user_email).toBeDefined();
        expect(row.user_username).toBeDefined();
        expect(row.id).toBe(testConversationId);
      });

      test('should delete conversation record', async () => {
        // Create a conversation for deletion test
        const deleteConvResult = await postgresPool.query(`
          INSERT INTO conversations (title, participants, metadata, user_id)
          VALUES ($1, $2, $3, $4)
          RETURNING id
        `, [
          'Delete Test Conversation',
          JSON.stringify(['Test User']),
          JSON.stringify({}),
          testUserId
        ]);
        const deleteConvId = deleteConvResult.rows[0].id;

        // Delete the conversation
        await postgresPool.query('DELETE FROM conversations WHERE id = $1', [deleteConvId]);

        // Verify deletion
        const result = await postgresPool.query(
          'SELECT * FROM conversations WHERE id = $1',
          [deleteConvId]
        );
        expect(result.rows).toHaveLength(0);
      });
    });

    describe('Transactions', () => {
      test('should commit successful transaction', async () => {
        const client = await postgresPool.connect();

        try {
          await client.query('BEGIN');

          const userData = createTestData.user();
          const userResult = await client.query(`
            INSERT INTO users (email, username, password_hash, full_name, metadata)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id
          `, [
            userData.email,
            userData.username,
            userData.password_hash,
            userData.full_name,
            JSON.stringify(userData.metadata)
          ]);

          const userId = userResult.rows[0].id;

          const conversationData = createTestData.conversation({ user_id: userId });
          await client.query(`
            INSERT INTO conversations (title, participants, metadata, user_id)
            VALUES ($1, $2, $3, $4)
          `, [
            conversationData.title,
            JSON.stringify(conversationData.participants),
            JSON.stringify(conversationData.metadata),
            userId
          ]);

          await client.query('COMMIT');

          // Verify data was committed
          const userCheck = await postgresPool.query(
            'SELECT * FROM users WHERE id = $1',
            [userId]
          );
          expect(userCheck.rows).toHaveLength(1);

        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
      });

      test('should rollback failed transaction', async () => {
        const client = await postgresPool.connect();

        try {
          await client.query('BEGIN');

          const userData = createTestData.user({
            email: 'rollback_test@example.com'
          });
          const userResult = await client.query(`
            INSERT INTO users (email, username, password_hash, full_name, metadata)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id
          `, [
            userData.email,
            userData.username,
            userData.password_hash,
            userData.full_name,
            JSON.stringify(userData.metadata)
          ]);

          const userId = userResult.rows[0].id;

          // Try to insert invalid data that should fail
          await client.query(`
            INSERT INTO conversations (title, participants, metadata, user_id)
            VALUES ($1, $2, $3, $4)
          `, [
            null, // This should fail due to NOT NULL constraint
            JSON.stringify([]),
            JSON.stringify({}),
            userId
          ]);

          await client.query('COMMIT');

        } catch (error) {
          await client.query('ROLLBACK');

          // Verify data was rolled back
          const userCheck = await postgresPool.query(
            'SELECT * FROM users WHERE email = $1',
            ['rollback_test@example.com']
          );
          expect(userCheck.rows).toHaveLength(0);
        } finally {
          client.release();
        }
      });

      test('should handle nested transactions with savepoints', async () => {
        const client = await postgresPool.connect();

        try {
          await client.query('BEGIN');

          const userData = createTestData.user({
            email: 'savepoint_test@example.com'
          });
          const userResult = await client.query(`
            INSERT INTO users (email, username, password_hash, full_name, metadata)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id
          `, [
            userData.email,
            userData.username,
            userData.password_hash,
            userData.full_name,
            JSON.stringify(userData.metadata)
          ]);

          const userId = userResult.rows[0].id;

          // Create savepoint
          await client.query('SAVEPOINT test_savepoint');

          try {
            // This should fail
            await client.query(`
              INSERT INTO conversations (title, participants, metadata, user_id)
              VALUES ($1, $2, $3, $4)
            `, [
              null, // Invalid
              JSON.stringify([]),
              JSON.stringify({}),
              userId
            ]);
          } catch (error) {
            // Rollback to savepoint
            await client.query('ROLLBACK TO SAVEPOINT test_savepoint');
          }

          // Continue with valid operations
          const conversationData = createTestData.conversation({ user_id: userId });
          await client.query(`
            INSERT INTO conversations (title, participants, metadata, user_id)
            VALUES ($1, $2, $3, $4)
          `, [
            conversationData.title,
            JSON.stringify(conversationData.participants),
            JSON.stringify(conversationData.metadata),
            userId
          ]);

          await client.query('COMMIT');

          // Verify data was committed correctly
          const userCheck = await postgresPool.query(
            'SELECT * FROM users WHERE email = $1',
            ['savepoint_test@example.com']
          );
          expect(userCheck.rows).toHaveLength(1);

          const convCheck = await postgresPool.query(
            'SELECT * FROM conversations WHERE user_id = $1',
            [userCheck.rows[0].id]
          );
          expect(convCheck.rows).toHaveLength(1);

        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
      });
    });

    describe('Performance Tests', () => {
      test('should handle bulk inserts efficiently', async () => {
        const batchSize = 1000;
        const testUsers = Array.from({ length: batchSize }, (_, i) =>
          createTestData.user({
            email: `bulk_test_${i}@example.com`,
            username: `bulk_user_${i}`
          })
        );

        const startTime = process.hrtime.bigint();

        await postgresPool.query(`
          INSERT INTO users (email, username, password_hash, full_name, metadata)
          SELECT * FROM UNNEST($1::text[], $2::text[], $3::text[], $4::text[], $5::jsonb[])
        `, [
          testUsers.map(u => u.email),
          testUsers.map(u => u.username),
          testUsers.map(u => u.password_hash),
          testUsers.map(u => u.full_name),
          testUsers.map(u => JSON.stringify(u.metadata))
        ]);

        const endTime = process.hrtime.bigint();
        const duration = Number(endTime - startTime) / 1000000;

        expect(duration).toBeLessThan(5000); // Should complete within 5 seconds

        // Verify insertion
        const result = await postgresPool.query(
          "SELECT COUNT(*) FROM users WHERE email LIKE 'bulk_test_%@example.com'"
        );
        expect(parseInt(result.rows[0].count)).toBe(batchSize);

        // Cleanup
        await postgresPool.query(
          "DELETE FROM users WHERE email LIKE 'bulk_test_%@example.com'"
        );
      });

      test('should handle complex queries efficiently', async () => {
        // Create test data
        const userIds = [];
        for (let i = 0; i < 10; i++) {
          const userData = createTestData.user({
            email: `complex_test_${i}@example.com`,
            username: `complex_user_${i}`
          });
          const userResult = await postgresPool.query(`
            INSERT INTO users (email, username, password_hash, full_name, metadata)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id
          `, [
            userData.email,
            userData.username,
            userData.password_hash,
            userData.full_name,
            JSON.stringify(userData.metadata)
          ]);
          userIds.push(userResult.rows[0].id);
        }

        // Create conversations for each user
        for (const userId of userIds) {
          for (let i = 0; i < 5; i++) {
            await postgresPool.query(`
              INSERT INTO conversations (title, participants, metadata, user_id)
              VALUES ($1, $2, $3, $4)
            `, [
              `Conversation ${i} for user ${userId}`,
              JSON.stringify([`User${i}`, `Other${i}`]),
              JSON.stringify({ test: true }),
              userId
            ]);
          }
        }

        const startTime = process.hrtime.bigint();

        // Run complex query with joins and aggregations
        const result = await postgresPool.query(`
          SELECT
            u.id,
            u.username,
            COUNT(c.id) as conversation_count,
            MAX(c.created_at) as latest_conversation,
            AVG(
              CASE
                WHEN c.metadata->>'test' = 'true' THEN 1
                ELSE 0
              END
            )::float as test_conversation_ratio
          FROM users u
          LEFT JOIN conversations c ON u.id = c.user_id
          WHERE u.email LIKE 'complex_test_%@example.com'
          GROUP BY u.id, u.username
          ORDER BY conversation_count DESC
        `);

        const endTime = process.hrtime.bigint();
        const duration = Number(endTime - startTime) / 1000000;

        expect(duration).toBeLessThan(1000); // Should complete within 1 second
        expect(result.rows).toHaveLength(10);

        result.rows.forEach(row => {
          expect(parseInt(row.conversation_count)).toBe(5);
          expect(row.test_conversation_ratio).toBe(1.0);
        });

        // Cleanup
        await postgresPool.query(
          "DELETE FROM conversations WHERE user_id = ANY($1)",
          [userIds]
        );
        await postgresPool.query(
          "DELETE FROM users WHERE email LIKE 'complex_test_%@example.com'"
        );
      });
    });
  });

  describe('Neo4j Integration', () => {
    describe('Connection Management', () => {
      test('should establish Neo4j connection', async () => {
        expect(neo4jDriver).toBeDefined();

        const session = neo4jDriver.session();
        expect(session).toBeDefined();

        const result = await session.run('RETURN 1 as test');
        expect(result.records).toHaveLength(1);
        expect(result.records[0].get('test').toNumber()).toBe(1);

        await session.close();
      });

      test('should handle session management', async () => {
        const session1 = neo4jDriver.session();
        const session2 = neo4jDriver.session();

        // Both sessions should work independently
        await session1.run('CREATE (n:TestNode {id: 1})');
        await session2.run('CREATE (n:TestNode {id: 2})');

        const result1 = await session1.run('MATCH (n:TestNode {id: 1}) RETURN n');
        const result2 = await session2.run('MATCH (n:TestNode {id: 2}) RETURN n');

        expect(result1.records).toHaveLength(1);
        expect(result2.records).toHaveLength(1);

        await session1.close();
        await session2.close();

        // Cleanup
        const cleanupSession = neo4jDriver.session();
        await cleanupSession.run('MATCH (n:TestNode) DELETE n');
        await cleanupSession.close();
      });
    });

    describe('Graph Operations', () => {
      let testConversationId;
      let testAnalysisId;

      beforeAll(async () => {
        testConversationId = 'test-conv-neo4j-' + Date.now();
        testAnalysisId = 'test-analysis-neo4j-' + Date.now();
      });

      afterAll(async () => {
        // Cleanup test data
        const session = neo4jDriver.session();
        await session.run(`
          MATCH (c:Conversation {id: $conversationId})
          DETACH DELETE c
        `, { conversationId: testConversationId });
        await session.close();
      });

      test('should create conversation node', async () => {
        const session = neo4jDriver.session();

        await session.run(`
          CREATE (c:Conversation {
            id: $id,
            title: $title,
            created_at: datetime($createdAt),
            metadata: $metadata
          })
        `, {
          id: testConversationId,
          title: 'Neo4j Test Conversation',
          createdAt: new Date().toISOString(),
          metadata: { test: true }
        });

        const result = await session.run(`
          MATCH (c:Conversation {id: $id})
          RETURN c
        `, { id: testConversationId });

        expect(result.records).toHaveLength(1);
        const node = result.records[0].get('c');
        expect(node.properties.id).toBe(testConversationId);
        expect(node.properties.title).toBe('Neo4j Test Conversation');

        await session.close();
      });

      test('should create cognitive dimension nodes and relationships', async () => {
        const session = neo4jDriver.session();

        // Create cognitive dimension nodes
        await session.run(`
          MATCH (c:Conversation {id: $conversationId})
          CREATE (c)-[:HAS_ANALYSIS]->(a:Analysis {
            id: $analysisId,
            created_at: datetime($createdAt)
          })
          CREATE (a)-[:HAS_DIMENSION]->(fr:FactualRetrieval {
            score: 0.92,
            confidence: 0.89
          })
          CREATE (a)-[:HAS_DIMENSION]->(li:LogicalInference {
            score: 0.85,
            confidence: 0.81
          })
          CREATE (a)-[:HAS_DIMENSION]->(cs:CreativeSynthesis {
            score: 0.60,
            confidence: 0.55
          })
          CREATE (a)-[:HAS_DIMENSION]->(mc:MetaCognition {
            score: 0.96,
            confidence: 0.93
          })
        `, {
          conversationId: testConversationId,
          analysisId: testAnalysisId,
          createdAt: new Date().toISOString()
        });

        const result = await session.run(`
          MATCH (c:Conversation {id: $conversationId})-[:HAS_ANALYSIS]->(a:Analysis)
          MATCH (a)-[r:HAS_DIMENSION]->(d)
          RETURN d.type as type, d.score as score, d.confidence as confidence
        `, { conversationId: testConversationId });

        expect(result.records).toHaveLength(4);

        const dimensions = {};
        result.records.forEach(record => {
          dimensions[record.get('type')] = {
            score: record.get('score'),
            confidence: record.get('confidence')
          };
        });

        expect(dimensions.FactualRetrieval.score).toBe(0.92);
        expect(dimensions.LogicalInference.score).toBe(0.85);
        expect(dimensions.CreativeSynthesis.score).toBe(0.60);
        expect(dimensions.MetaCognition.score).toBe(0.96);

        await session.close();
      });

      test('should query graph with complex patterns', async () => {
        const session = neo4jDriver.session();

        const result = await session.run(`
          MATCH (c:Conversation {id: $conversationId})-[:HAS_ANALYSIS]->(a:Analysis)
          MATCH (a)-[:HAS_DIMENSION]->(d)
          WHERE d.score >= 0.8
          RETURN c.id as conversationId,
                 collect(d.type) as highScoreDimensions,
                 avg(d.score) as averageScore
        `, { conversationId: testConversationId });

        expect(result.records).toHaveLength(1);
        const record = result.records[0];
        expect(record.get('conversationId')).toBe(testConversationId);
        expect(record.get('highScoreDimensions')).toContain('FactualRetrieval');
        expect(record.get('highScoreDimensions')).toContain('MetaCognition');
        expect(record.get('averageScore')).toBeGreaterThan(0.8);

        await session.close();
      });

      test('should update node properties', async () => {
        const session = neo4jDriver.session();

        await session.run(`
          MATCH (a:Analysis {id: $analysisId})
          SET a.processing_time = $processingTime,
              a.model_version = $modelVersion,
              a.updated_at = datetime($updatedAt)
        `, {
          analysisId: testAnalysisId,
          processingTime: 2.5,
          modelVersion: '1.0.0',
          updatedAt: new Date().toISOString()
        });

        const result = await session.run(`
          MATCH (a:Analysis {id: $analysisId})
          RETURN a.processing_time as processingTime, a.model_version as version
        `, { analysisId: testAnalysisId });

        expect(result.records).toHaveLength(1);
        const record = result.records[0];
        expect(record.get('processingTime')).toBe(2.5);
        expect(record.get('version')).toBe('1.0.0');

        await session.close();
      });
    });

    describe('Graph Traversals and Path Queries', () => {
      test('should find shortest paths between nodes', async () => {
        const session = neo4jDriver.session();

        // Create additional nodes for path testing
        await session.run(`
          MATCH (c:Conversation {id: $conversationId})-[:HAS_ANALYSIS]->(a:Analysis)
          CREATE (a)-[:HAS_ELEMENT]->(e1:CognitiveElement {
            id: 'elem1',
            text: 'AI healthcare ethics',
            type: 'fact'
          })
          CREATE (a)-[:HAS_ELEMENT]->(e2:CognitiveElement {
            id: 'elem2',
            text: 'Patient privacy protection',
            type: 'principle'
          })
          CREATE (e1)-[:SUPPORTS]->(e2 {weight: 0.8})
        `, { conversationId: testConversationId });

        const result = await session.run(`
          MATCH (c:Conversation {id: $conversationId}),
                (e1:CognitiveElement {id: 'elem1'}),
                (e2:CognitiveElement {id: 'elem2'})
          MATCH path = shortestPath((c)-[*..5]-(e2))
          RETURN length(path) as pathLength
        `, { conversationId: testConversationId });

        expect(result.records).toHaveLength(1);
        expect(result.records[0].get('pathLength')).toBeGreaterThan(0);

        await session.close();
      });

      test('should perform graph aggregations', async () => {
        const session = neo4jDriver.session();

        const result = await session.run(`
          MATCH (c:Conversation {id: $conversationId})-[:HAS_ANALYSIS]->(a:Analysis)
          MATCH (a)-[:HAS_DIMENSION]->(d)
          OPTIONAL MATCH (a)-[:HAS_ELEMENT]->(e)
          RETURN c.id as conversationId,
                 count(DISTINCT d) as dimensionCount,
                 count(DISTINCT e) as elementCount,
                 avg(d.score) as averageDimensionScore,
                 max(d.confidence) as maxConfidence
        `, { conversationId: testConversationId });

        expect(result.records).toHaveLength(1);
        const record = result.records[0];
        expect(record.get('dimensionCount')).toBe(4);
        expect(record.get('elementCount')).toBe(2);
        expect(record.get('averageDimensionScore')).toBeGreaterThan(0);
        expect(record.get('maxConfidence')).toBeLessThanOrEqual(1.0);

        await session.close();
      });
    });
  });

  describe('Redis Integration', () => {
    describe('Connection Management', () => {
      test('should establish Redis connection', async () => {
        expect(redisClient).toBeDefined();

        await redisClient.connect();
        const pong = await redisClient.ping();
        expect(pong).toBe('PONG');
      });

      test('should handle connection errors', async () => {
        const invalidClient = createClient({
          host: 'invalid-host',
          port: 9999,
          socket: {
            connectTimeout: 1000
          }
        });

        await expect(invalidClient.connect()).rejects.toThrow();
      });
    });

    describe('Cache Operations', () => {
      test('should set and get string values', async () => {
        const key = 'test:string:' + Date.now();
        const value = 'test value';

        await redisClient.set(key, value);
        const retrievedValue = await redisClient.get(key);
        expect(retrievedValue).toBe(value);

        await redisClient.del(key);
      });

      test('should set and get JSON values', async () => {
        const key = 'test:json:' + Date.now();
        const value = {
          id: 'test-object',
          name: 'Test Object',
          data: { nested: true },
          timestamp: Date.now()
        };

        await redisClient.set(key, JSON.stringify(value));
        const retrievedValue = await redisClient.get(key);
        const parsedValue = JSON.parse(retrievedValue);
        expect(parsedValue).toEqual(value);

        await redisClient.del(key);
      });

      test('should handle expiration', async () => {
        const key = 'test:expiration:' + Date.now();
        const value = 'expiring value';

        await redisClient.setEx(key, 1, value); // 1 second expiration
        const retrievedValue = await redisClient.get(key);
        expect(retrievedValue).toBe(value);

        // Wait for expiration
        await new Promise(resolve => setTimeout(resolve, 1100));
        const expiredValue = await redisClient.get(key);
        expect(expiredValue).toBeNull();
      });

      test('should handle hash operations', async () => {
        const hashKey = 'test:hash:' + Date.now();
        const fieldValues = {
          field1: 'value1',
          field2: 'value2',
          field3: 'value3'
        };

        // Set hash fields
        await Promise.all(
          Object.entries(fieldValues).map(([field, value]) =>
            redisClient.hSet(hashKey, field, value)
          )
        );

        // Get individual fields
        for (const [field, expectedValue] of Object.entries(fieldValues)) {
          const value = await redisClient.hGet(hashKey, field);
          expect(value).toBe(expectedValue);
        }

        // Get all hash fields
        const allFields = await redisClient.hGetAll(hashKey);
        expect(allFields).toEqual(fieldValues);

        await redisClient.del(hashKey);
      });

      test('should handle list operations', async () => {
        const listKey = 'test:list:' + Date.now();
        const values = ['item1', 'item2', 'item3'];

        // Push items to list
        await Promise.all(
          values.map(value => redisClient.rPush(listKey, value))
        );

        // Get list length
        const length = await redisClient.lLen(listKey);
        expect(length).toBe(values.length);

        // Get range of items
        const range = await redisClient.lRange(listKey, 0, -1);
        expect(range).toEqual(values);

        await redisClient.del(listKey);
      });

      test('should handle set operations', async () => {
        const setKey = 'test:set:' + Date.now();
        const members = ['member1', 'member2', 'member3', 'member2']; // Duplicate

        // Add members to set
        await Promise.all(
          members.map(member => redisClient.sAdd(setKey, member))
        );

        // Get set members
        const setMembers = await redisClient.sMembers(setKey);
        expect(setMembers).toHaveLength(3); // Duplicates should be removed
        expect(setMembers).toContain('member1');
        expect(setMembers).toContain('member2');
        expect(setMembers).toContain('member3');

        await redisClient.del(setKey);
      });
    });

    describe('Performance Tests', () => {
      test('should handle high-frequency operations efficiently', async () => {
        const operationCount = 10000;
        const keyPrefix = 'perf:test:' + Date.now() + ':';

        const startTime = process.hrtime.bigint();

        // Perform many set operations
        const setPromises = [];
        for (let i = 0; i < operationCount; i++) {
          setPromises.push(redisClient.set(keyPrefix + i, `value${i}`));
        }
        await Promise.all(setPromises);

        const setEndTime = process.hrtime.bigint();
        const setDuration = Number(setEndTime - startTime) / 1000000;

        // Perform many get operations
        const getPromises = [];
        for (let i = 0; i < operationCount; i++) {
          getPromises.push(redisClient.get(keyPrefix + i));
        }
        const getResults = await Promise.all(getPromises);

        const getEndTime = process.hrtime.bigint();
        const getDuration = Number(getEndTime - setEndTime) / 1000000;

        // Verify results
        expect(getResults).toHaveLength(operationCount);
        getResults.forEach((result, i) => {
          expect(result).toBe(`value${i}`);
        });

        expect(setDuration).toBeLessThan(5000); // Sets within 5 seconds
        expect(getDuration).toBeLessThan(3000); // Gets within 3 seconds

        // Cleanup
        const keys = Array.from({ length: operationCount }, (_, i) => keyPrefix + i);
        await redisClient.del(keys);
      });

      test('should handle pipelined operations efficiently', async () => {
        const pipeline = redisClient.multi();
        const operationCount = 1000;
        const keyPrefix = 'pipeline:test:' + Date.now() + ':';

        const startTime = process.hrtime.bigint();

        // Add operations to pipeline
        for (let i = 0; i < operationCount; i++) {
          pipeline.set(keyPrefix + i, `pipeline_value${i}`);
        }

        for (let i = 0; i < operationCount; i++) {
          pipeline.get(keyPrefix + i);
        }

        // Execute pipeline
        const results = await pipeline.exec();

        const endTime = process.hrtime.bigint();
        const duration = Number(endTime - startTime) / 1000000;

        expect(results).toHaveLength(operationCount * 2);
        expect(duration).toBeLessThan(2000); // Should complete within 2 seconds

        // Verify get results
        for (let i = 0; i < operationCount; i++) {
          const setResult = results[i];
          const getResult = results[operationCount + i];

          expect(setResult[0]).toBeNull(); // No error
          expect(getResult[0]).toBeNull(); // No error
          expect(getResult[1]).toBe(`pipeline_value${i}`);
        }

        // Cleanup
        const keys = Array.from({ length: operationCount }, (_, i) => keyPrefix + i);
        await redisClient.del(keys);
      });
    });
  });

  describe('Cross-Database Integration', () => {
    test('should maintain data consistency across databases', async () => {
      const conversationId = 'cross-db-test-' + Date.now();
      const userId = 'cross-db-user-' + Date.now();

      // Create user in PostgreSQL
      const userResult = await postgresPool.query(`
        INSERT INTO users (email, username, password_hash, full_name, metadata)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id
      `, [
        'crossdb@example.com',
        'crossdb_user',
        'hashed_password',
        'Cross DB User',
        JSON.stringify({ test: true })
      ]);

      // Create conversation in PostgreSQL
      await postgresPool.query(`
        INSERT INTO conversations (id, title, participants, metadata, user_id)
        VALUES ($1, $2, $3, $4, $5)
      `, [
        conversationId,
        'Cross-DB Test Conversation',
        JSON.stringify(['Alice', 'Bob']),
        JSON.stringify({ test: true }),
        userResult.rows[0].id
      ]);

      // Create analysis nodes in Neo4j
      const neo4jSession = neo4jDriver.session();
      await neo4jSession.run(`
        CREATE (c:Conversation {id: $id})
        CREATE (c)-[:HAS_ANALYSIS]->(a:Analysis {
          id: $analysisId,
          created_at: datetime()
        })
        CREATE (a)-[:HAS_DIMENSION]->(fr:FactualRetrieval {
          score: 0.9,
          confidence: 0.85
        })
      `, {
        id: conversationId,
        analysisId: 'cross-db-analysis-' + Date.now()
      });
      await neo4jSession.close();

      // Cache conversation summary in Redis
      await redisClient.setEx(
        `conversation:${conversationId}:summary`,
        3600,
        JSON.stringify({
          id: conversationId,
          participantCount: 2,
          hasAnalysis: true,
          averageScore: 0.9
        })
      );

      // Verify data across all databases
      const pgResult = await postgresPool.query(
        'SELECT * FROM conversations WHERE id = $1',
        [conversationId]
      );
      expect(pgResult.rows).toHaveLength(1);

      const neo4jResult = await neo4jDriver.session().then(session =>
        session.run('MATCH (c:Conversation {id: $id}) RETURN c', { id: conversationId })
          .then(result => {
            session.close();
            return result;
          })
      );
      expect(neo4jResult.records).toHaveLength(1);

      const redisResult = await redisClient.get(`conversation:${conversationId}:summary`);
      expect(redisResult).toBeDefined();
      const summary = JSON.parse(redisResult);
      expect(summary.id).toBe(conversationId);

      // Cleanup
      await postgresPool.query('DELETE FROM conversations WHERE id = $1', [conversationId]);
      await postgresPool.query('DELETE FROM users WHERE id = $1', [userResult.rows[0].id]);

      const cleanupSession = neo4jDriver.session();
      await cleanupSession.run('MATCH (c:Conversation {id: $id}) DETACH DELETE c', { id: conversationId });
      await cleanupSession.close();

      await redisClient.del(`conversation:${conversationId}:summary`);
    });
  });

  /**
   * Setup test database connections
   */
  async function setupTestDatabases() {
    try {
      // PostgreSQL
      postgresPool = new Pool(testConfig.postgres);
      await postgresPool.query('SELECT NOW()'); // Test connection

      // Neo4j
      neo4jDriver = neo4j.driver(
        testConfig.neo4j.uri,
        neo4j.auth.basic(testConfig.neo4j.user, testConfig.neo4j.password)
      );
      const neo4jSession = neo4jDriver.session();
      await neo4jSession.run('RETURN 1');
      await neo4jSession.close();

      // Redis
      redisClient = createClient(testConfig.redis);
      await redisClient.connect();
    } catch (error) {
      console.error('Failed to setup test databases:', error);
      throw error;
    }
  }

  /**
   * Cleanup test database connections
   */
  async function cleanupTestDatabases() {
    try {
      if (postgresPool) {
        await postgresPool.end();
      }
      if (neo4jDriver) {
        await neo4jDriver.close();
      }
      if (redisClient) {
        await redisClient.quit();
      }
    } catch (error) {
      console.error('Error during database cleanup:', error);
    }
  }
});