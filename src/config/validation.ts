import { environment } from './environment';
import { Pool } from 'pg';
import neo4j from 'neo4j-driver';
import { createClient } from 'redis';
import axios from 'axios';

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  services: ServiceStatus[];
}

interface ServiceStatus {
  name: string;
  status: 'connected' | 'disconnected' | 'error';
  message?: string;
  responseTime?: number;
}

export class ConfigurationValidator {
  private results: ValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
    services: []
  };

  async validateAll(): Promise<ValidationResult> {
    console.log('🔍 Starting comprehensive configuration validation...\n');

    await this.validateEnvironmentVariables();
    await this.validateDatabaseConnections();
    await this.validateAPIKeys();
    await this.validateSecurityConfiguration();
    await this.validatePerformanceConfiguration();

    this.results.valid = this.results.errors.length === 0;
    return this.results;
  }

  private async validateEnvironmentVariables(): Promise<void> {
    console.log('📋 Validating environment variables...');

    // Check critical environment variables
    const criticalVars = [
      'NODE_ENV',
      'PORT',
      'DB_HOST',
      'DB_NAME',
      'DB_USER',
      'DB_PASSWORD',
      'NEO4J_URI',
      'NEO4J_USER',
      'NEO4J_PASSWORD',
      'REDIS_URL',
      'JWT_SECRET'
    ];

    for (const varName of criticalVars) {
      const value = process.env[varName];
      if (!value) {
        this.results.errors.push(`Missing critical environment variable: ${varName}`);
      }
    }

    // Check JWT secret strength
    if (environment.JWT_SECRET.length < 32) {
      this.results.errors.push('JWT secret must be at least 32 characters long');
    }

    // Check if using default/development secrets in production
    if (environment.NODE_ENV === 'production') {
      if (environment.JWT_SECRET.includes('development') ||
          environment.JWT_SECRET.includes('secret')) {
        this.results.errors.push('Using development secrets in production is not allowed');
      }

      if (environment.DB_PASSWORD === 'password' ||
          environment.NEO4J_PASSWORD === 'password') {
        this.results.errors.push('Using default passwords in production is not allowed');
      }
    }

    // Validate port ranges
    if (environment.PORT < 1 || environment.PORT > 65535) {
      this.results.errors.push(`Invalid port number: ${environment.PORT}`);
    }

    // Validate verification threshold
    if (environment.VERIFICATION_THRESHOLD < 0 || environment.VERIFICATION_THRESHOLD > 1) {
      this.results.errors.push('Verification threshold must be between 0 and 1');
    }

    console.log(`✅ Environment validation completed. Errors: ${this.results.errors.length}, Warnings: ${this.results.warnings.length}\n`);
  }

  private async validateDatabaseConnections(): Promise<void> {
    console.log('🗄️  Validating database connections...');

    // Test PostgreSQL connection
    try {
      const startTime = Date.now();
      const pool = new Pool({
        host: environment.DB_HOST,
        port: environment.DB_PORT,
        database: environment.DB_NAME,
        user: environment.DB_USER,
        password: environment.DB_PASSWORD,
        ssl: environment.DB_SSL,
        max: 1,
        connectionTimeoutMillis: 5000
      });

      const client = await pool.connect();
      await client.query('SELECT 1');
      client.release();
      await pool.end();

      const responseTime = Date.now() - startTime;
      this.results.services.push({
        name: 'PostgreSQL',
        status: 'connected',
        responseTime
      });
      console.log(`✅ PostgreSQL connected successfully (${responseTime}ms)`);
    } catch (error) {
      this.results.services.push({
        name: 'PostgreSQL',
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
      this.results.errors.push(`PostgreSQL connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      console.log(`❌ PostgreSQL connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Test Neo4j connection
    try {
      const startTime = Date.now();
      const driver = neo4j.driver(
        environment.NEO4J_URI,
        neo4j.auth.basic(environment.NEO4J_USER, environment.NEO4J_PASSWORD)
      );

      const session = driver.session();
      await session.run('RETURN 1');
      await session.close();
      await driver.close();

      const responseTime = Date.now() - startTime;
      this.results.services.push({
        name: 'Neo4j',
        status: 'connected',
        responseTime
      });
      console.log(`✅ Neo4j connected successfully (${responseTime}ms)`);
    } catch (error) {
      this.results.services.push({
        name: 'Neo4j',
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
      this.results.errors.push(`Neo4j connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      console.log(`❌ Neo4j connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Test Redis connection
    try {
      const startTime = Date.now();
      const client = createClient({
        url: environment.REDIS_URL,
        password: environment.REDIS_PASSWORD
      });

      await client.connect();
      await client.ping();
      await client.quit();

      const responseTime = Date.now() - startTime;
      this.results.services.push({
        name: 'Redis',
        status: 'connected',
        responseTime
      });
      console.log(`✅ Redis connected successfully (${responseTime}ms)`);
    } catch (error) {
      this.results.services.push({
        name: 'Redis',
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
      this.results.errors.push(`Redis connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      console.log(`❌ Redis connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    console.log(`✅ Database validation completed\n`);
  }

  private async validateAPIKeys(): Promise<void> {
    console.log('🔑 Validating API keys...');

    // Test OpenAI API key
    if (environment.OPENAI_API_KEY) {
      try {
        const startTime = Date.now();
        const response = await axios.get('https://api.openai.com/v1/models', {
          headers: {
            'Authorization': `Bearer ${environment.OPENAI_API_KEY}`
          },
          timeout: 5000
        });

        const responseTime = Date.now() - startTime;
        this.results.services.push({
          name: 'OpenAI API',
          status: 'connected',
          responseTime
        });
        console.log(`✅ OpenAI API key valid (${responseTime}ms)`);
      } catch (error) {
        this.results.services.push({
          name: 'OpenAI API',
          status: 'error',
          message: error instanceof Error ? error.message : 'Invalid API key'
        });
        this.results.warnings.push(`OpenAI API key validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        console.log(`⚠️  OpenAI API key validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    } else {
      this.results.warnings.push('OpenAI API key not configured');
      console.log('⚠️  OpenAI API key not configured');
    }

    // Test Anthropic API key
    if (environment.ANTHROPIC_API_KEY) {
      try {
        const startTime = Date.now();
        const response = await axios.get('https://api.anthropic.com/v1/messages', {
          headers: {
            'x-api-key': environment.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json'
          },
          data: {
            model: 'claude-3-haiku-20240307',
            max_tokens: 1,
            messages: [{ role: 'user', content: 'test' }]
          },
          timeout: 5000
        });

        const responseTime = Date.now() - startTime;
        this.results.services.push({
          name: 'Anthropic API',
          status: 'connected',
          responseTime
        });
        console.log(`✅ Anthropic API key valid (${responseTime}ms)`);
      } catch (error) {
        this.results.services.push({
          name: 'Anthropic API',
          status: 'error',
          message: error instanceof Error ? error.message : 'Invalid API key'
        });
        this.results.warnings.push(`Anthropic API key validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        console.log(`⚠️  Anthropic API key validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    } else {
      this.results.warnings.push('Anthropic API key not configured');
      console.log('⚠️  Anthropic API key not configured');
    }

    // Test Rasa webhook URL
    if (environment.RASA_WEBHOOK_URL) {
      try {
        const startTime = Date.now();
        const response = await axios.get(environment.RASA_WEBHOOK_URL.replace('/webhooks/rest/webhook', '/status'), {
          timeout: 5000
        });

        const responseTime = Date.now() - startTime;
        this.results.services.push({
          name: 'Rasa Service',
          status: 'connected',
          responseTime
        });
        console.log(`✅ Rasa service accessible (${responseTime}ms)`);
      } catch (error) {
        this.results.services.push({
          name: 'Rasa Service',
          status: 'disconnected',
          message: error instanceof Error ? error.message : 'Service not accessible'
        });
        this.results.warnings.push(`Rasa service not accessible: ${error instanceof Error ? error.message : 'Unknown error'}`);
        console.log(`⚠️  Rasa service not accessible: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    } else {
      this.results.warnings.push('Rasa webhook URL not configured');
      console.log('⚠️  Rasa webhook URL not configured');
    }

    console.log(`✅ API key validation completed\n`);
  }

  private async validateSecurityConfiguration(): Promise<void> {
    console.log('🔒 Validating security configuration...');

    // Validate JWT secret complexity
    const hasUppercase = /[A-Z]/.test(environment.JWT_SECRET);
    const hasLowercase = /[a-z]/.test(environment.JWT_SECRET);
    const hasNumbers = /\d/.test(environment.JWT_SECRET);
    const hasSpecialChars = /[!@#$%^&*(),.?":{}|<>]/.test(environment.JWT_SECRET);

    if (!hasUppercase || !hasLowercase || !hasNumbers || !hasSpecialChars) {
      this.results.warnings.push('JWT secret should contain uppercase, lowercase, numbers, and special characters');
    }

    // Check file upload size limits
    const maxSizeMB = environment.MAX_FILE_SIZE / (1024 * 1024);
    if (maxSizeMB > 100) {
      this.results.warnings.push(`File upload size limit is very high: ${maxSizeMB}MB`);
    }

    // Validate rate limiting
    if (environment.RATE_LIMIT_MAX_REQUESTS > 1000) {
      this.results.warnings.push('Rate limit allows many requests, consider reducing for better security');
    }

    // Check for HTTPS in production
    if (environment.NODE_ENV === 'production') {
      this.results.warnings.push('HTTPS should be enabled in production');
    }

    console.log(`✅ Security validation completed\n`);
  }

  private async validatePerformanceConfiguration(): Promise<void> {
    console.log('⚡ Validating performance configuration...');

    // Validate timeout configurations
    if (environment.COGNITIVE_PROCESSING_TIMEOUT < 10000) {
      this.results.warnings.push('Cognitive processing timeout is very low, may cause processing failures');
    }

    if (environment.WEBSOCKET_HEARTBEAT < 15000) {
      this.results.warnings.push('WebSocket heartbeat interval is very frequent, may increase overhead');
    }

    // Validate connection limits
    if (environment.MAX_CONCURRENT_CONNECTIONS > 1000) {
      this.results.warnings.push('High concurrent connection limit may cause resource exhaustion');
    }

    // Check verification threshold
    if (environment.VERIFICATION_THRESHOLD > 0.99) {
      this.results.warnings.push('Very high verification threshold may cause most operations to fail');
    } else if (environment.VERIFICATION_THRESHOLD < 0.8) {
      this.results.warnings.push('Low verification threshold may allow low-quality results');
    }

    console.log(`✅ Performance validation completed\n`);
  }

  generateReport(): string {
    const report = [
      '# Configuration Validation Report',
      '=' .repeat(50),
      '',
      `Generated: ${new Date().toISOString()}`,
      `Environment: ${environment.NODE_ENV}`,
      `Overall Status: ${this.results.valid ? '✅ PASSED' : '❌ FAILED'}`,
      '',
      `Errors: ${this.results.errors.length}`,
      `Warnings: ${this.results.warnings.length}`,
      `Services Checked: ${this.results.services.length}`,
      '',
      '## Service Status',
      '-' .repeat(30),
      ''
    ];

    this.results.services.forEach(service => {
      const status = service.status === 'connected' ? '✅' :
                    service.status === 'disconnected' ? '⚠️' : '❌';
      const responseTime = service.responseTime ? ` (${service.responseTime}ms)` : '';
      const message = service.message ? ` - ${service.message}` : '';
      report.push(`${status} ${service.name}${responseTime}${message}`);
    });

    if (this.results.errors.length > 0) {
      report.push('', '## Errors', '-' .repeat(30), '');
      this.results.errors.forEach(error => {
        report.push(`❌ ${error}`);
      });
    }

    if (this.results.warnings.length > 0) {
      report.push('', '## Warnings', '-' .repeat(30), '');
      this.results.warnings.forEach(warning => {
        report.push(`⚠️  ${warning}`);
      });
    }

    report.push('', '## Configuration Summary', '-' .repeat(30), '');
    report.push(`Port: ${environment.PORT}`);
    report.push(`Database: ${environment.DB_HOST}:${environment.DB_PORT}/${environment.DB_NAME}`);
    report.push(`Neo4j: ${environment.NEO4J_URI}`);
    report.push(`Redis: ${environment.REDIS_URL}`);
    report.push(`JWT Expiration: ${environment.JWT_EXPIRES_IN}`);
    report.push(`Verification Threshold: ${environment.VERIFICATION_THRESHOLD}`);
    report.push(`Max Connections: ${environment.MAX_CONCURRENT_CONNECTIONS}`);
    report.push(`File Upload Limit: ${environment.MAX_FILE_SIZE / (1024 * 1024)}MB`);

    return report.join('\n');
  }
}

// Export singleton instance
export const configValidator = new ConfigurationValidator();