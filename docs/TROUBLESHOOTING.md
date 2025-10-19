# Troubleshooting Guide - Cognitive Fabric Visualizer

## Common Issues and Solutions

This guide covers the most common issues users may encounter when installing, configuring, or using the Cognitive Fabric Visualizer.

## Installation Issues

### Database Connection Failures

#### PostgreSQL Connection Refused
**Symptoms:**
- Error: `ECONNREFUSED` when connecting to PostgreSQL
- Application fails to start with database errors

**Solutions:**
```bash
# Check if PostgreSQL is running
sudo systemctl status postgresql

# Start PostgreSQL if not running
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Verify connection
sudo -u postgres psql -c "SELECT version();"

# Check configuration in .env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=cognitive_fabric
DB_USER=cf_user
DB_PASSWORD=your_secure_password
```

#### Neo4j Authentication Failed
**Symptoms:**
- Error: "Authentication failed" for Neo4j
- HTTP 401 unauthorized from Neo4j

**Solutions:**
```bash
# Reset Neo4j password
sudo neo4j-admin set-initial-password your_new_password

# Verify Neo4j is running
sudo systemctl status neo4j
sudo systemctl start neo4j

# Test connection
curl -u neo4j:your_password http://localhost:7474/db/data/

# Check .env configuration
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=your_secure_password
```

#### Redis Connection Timeout
**Symptoms:**
- Redis connection timeouts
- Caching not working properly

**Solutions:**
```bash
# Check Redis status
sudo systemctl status redis
sudo systemctl start redis

# Test connection
redis-cli ping
# Should return: PONG

# Check Redis configuration
sudo nano /etc/redis/redis.conf
# Ensure: bind 127.0.0.1 ::1

# Verify .env configuration
REDIS_URL=redis://localhost:6379
```

### Node.js and npm Issues

#### Node.js Version Incompatible
**Symptoms:**
- Build errors during npm install
- Module compatibility issues

**Solutions:**
```bash
# Check current Node.js version
node --version

# Use nvm to manage versions
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc

# Install Node.js 18
nvm install 18
nvm use 18

# Verify version
node --version  # Should be v18.x.x
npm --version   # Should be >= 8.x.x
```

#### npm Install Fails
**Symptoms:**
- `npm install` fails with dependency errors
- Permission denied errors

**Solutions:**
```bash
# Clear npm cache
npm cache clean --force

# Remove node_modules and package-lock.json
rm -rf node_modules package-lock.json

# Install with legacy peer deps
npm install --legacy-peer-deps

# If permission errors, fix npm permissions
npm config set prefix ~/.npm-global
export PATH=~/.npm-global/bin:$PATH
```

### Python Environment Issues

#### Python Module Import Errors
**Symptoms:**
- ImportError for ML modules
- Python packages not found

**Solutions:**
```bash
# Check Python version
python --version  # Should be 3.10+

# Ensure virtual environment is activated
source cognitive_env/bin/activate

# Install requirements
cd src/ml
pip install -r requirements.txt

# Install spaCy models
python -m spacy download en_core_web_lg

# Verify installation
python -c "import torch, transformers, spacy; print('ML ready')"
```

#### spaCy Model Download Fails
**Symptoms:**
- spaCy model download errors
- NLTK data download failures

**Solutions:**
```bash
# Download spaCy models manually
python -m spacy download en_core_web_lg --user

# Download NLTK data
python -c "
import nltk
nltk.download('punkt', download_dir='/usr/local/share/nltk_data')
nltk.download('stopwords', download_dir='/usr/local/share/nltk_data')
nltk.download('wordnet', download_dir='/usr/local/share/nltk_data')
"

# Set NLTK_DATA environment variable
export NLTK_DATA=/usr/local/share/nltk_data
```

## API and Service Issues

### API Key Configuration

#### OpenAI API Key Invalid
**Symptoms:**
- "Invalid API key" errors
- 401 unauthorized from OpenAI

**Solutions:**
```bash
# Verify API key format
export OPENAI_API_KEY=sk-actual-key-here

# Test API key
curl -H "Authorization: Bearer $OPENAI_API_KEY" \
     https://api.openai.com/v1/models

# Check .env file (no extra spaces or quotes)
OPENAI_API_KEY=sk-your-actual-openai-api-key
```

#### Anthropic API Key Issues
**Symptoms:**
- Anthropic API access denied
- Invalid API key format

**Solutions:**
```bash
# Verify API key format (sk-ant-...)
export ANTHROPIC_API_KEY=sk-ant-actual-key-here

# Test API key
curl -H "x-api-key: $ANTHROPIC_API_KEY" \
     https://api.anthropic.com/v1/messages

# Update .env file
ANTHROPIC_API_KEY=sk-ant-your-actual-anthropic-api-key
```

### Service Startup Failures

#### Port Already in Use
**Symptoms:**
- "Port 3000 already in use"
- Services fail to start

**Solutions:**
```bash
# Find process using port
lsof -ti:3000 | xargs kill -9

# Or use different port
PORT=3001 npm start

# Check all application ports
netstat -tlnp | grep -E ':(3000|3001|8000|5432|6379|7474|7687)'
```

#### Service Health Check Fails
**Symptoms:**
- Health endpoints return errors
- Services not responding

**Solutions:**
```bash
# Check all service statuses
sudo systemctl status postgresql neo4j redis

# Check application logs
npm run dev 2>&1 | tee dev.log

# Check ML service
cd src/api
python main.py
# Should output: "ML service running on http://localhost:8000"

# Test health endpoints
curl http://localhost:3001/health
curl http://localhost:8000/health
```

## Performance Issues

### Slow Processing

#### Analysis Taking Too Long
**Symptoms:**
- Analysis takes >10 seconds
- Timeout errors

**Solutions:**
```bash
# Check ML service performance
curl http://localhost:8000/metrics

# Monitor resource usage
htop
iostat -x 1

# Optimize by:
# 1. Reducing conversation length
# 2. Lowering confidence threshold
# 3. Enabling caching

# Check API response times
curl -w "@curl-format.txt" -o /dev/null -s http://localhost:3001/health
```

#### Memory Issues
**Symptoms:**
- Out of memory errors
- System becomes unresponsive

**Solutions:**
```bash
# Check memory usage
free -h
ps aux --sort=-%mem | head

# Increase swap space
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# Add to /etc/fstab for persistence
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# Configure JVM for Neo4j (if needed)
sudo nano /etc/neo4j/neo4j.conf
# Add: dbms.memory.heap.initial_size=1G
#      dbms.memory.heap.max_size=2G
```

### Database Performance

#### Slow Database Queries
**Symptoms:**
- Database queries take too long
- Timeouts in database operations

**Solutions:**
```bash
# PostgreSQL optimization
sudo -u postgres psql -d cognitive_fabric -c "
ANALYZE;
REINDEX DATABASE cognitive_fabric;
"

# Check slow queries
sudo -u postgres psql -d cognitive_fabric -c "
SELECT query, mean_time, calls
FROM pg_stat_statements
ORDER BY mean_time DESC
LIMIT 10;
"

# Neo4j optimization
# Connect to Neo4j and run:
# CREATE INDEX ON :CognitiveElement(id);
# CREATE INDEX ON :Conversation(id);
```

## Frontend Issues

### React Application Problems

#### Frontend Won't Load
**Symptoms:**
- Blank white screen
- React application errors

**Solutions:**
```bash
# Check client directory
cd src/client

# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install

# Check for TypeScript errors
npm run typecheck

# Start development server
npm start

# Check browser console for errors
# Open developer tools (F12)
```

#### WebSocket Connection Failed
**Symptoms:**
- Real-time updates not working
- WebSocket connection errors

**Solutions:**
```bash
# Check WebSocket server
curl -i -N -H "Connection: Upgrade" \
     -H "Upgrade: websocket" \
     -H "Sec-WebSocket-Key: test" \
     -H "Sec-WebSocket-Version: 13" \
     http://localhost:3001/socket.io/

# Check firewall settings
sudo ufw status
sudo ufw allow 3001

# Verify WebSocket configuration in client
# Check: const socket = io('http://localhost:3001');
```

### Visualization Issues

#### 3D Rendering Problems
**Symptoms:**
- 3D visualization not displaying
- Poor rendering performance

**Solutions:**
```bash
# Check WebGL support
# Open browser console and run:
# const gl = document.createElement('canvas').getContext('webgl');
# console.log('WebGL supported:', !!gl);

# Update graphics drivers
# Ubuntu:
sudo apt update
sudo apt install mesa-utils

# Check GPU acceleration
glxinfo | grep "OpenGL renderer"

# Enable hardware acceleration in browser
# Chrome: Settings > Advanced > System > Use hardware acceleration
```

## API Usage Issues

### Rate Limiting

#### API Rate Limit Exceeded
**Symptoms:**
- 429 Too Many Requests errors
- API temporarily blocked

**Solutions:**
```bash
# Check rate limit headers
curl -I http://localhost:3001/api/v1/analyze

# Implement exponential backoff
# Example in JavaScript:
async function analyzeWithBackoff(text, attempts = 3) {
  for (let i = 0; i < attempts; i++) {
    try {
      return await analyzeConversation(text);
    } catch (error) {
      if (error.status === 429 && i < attempts - 1) {
        const delay = Math.pow(2, i) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
}
```

### Authentication Issues

#### JWT Token Expired
**Symptoms:**
- 401 Unauthorized errors
- Token expiration messages

**Solutions:**
```javascript
// Implement token refresh
async function refreshAuthToken() {
  try {
    const response = await fetch('/auth/refresh', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${oldToken}`
      }
    });
    const data = await response.json();
    localStorage.setItem('token', data.token);
    return data.token;
  } catch (error) {
    // Redirect to login
    window.location.href = '/login';
  }
}

// Use in API calls
async function authenticatedFetch(url, options = {}) {
  const token = localStorage.getItem('token');
  const response = await fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      'Authorization': `Bearer ${token}`
    }
  });

  if (response.status === 401) {
    await refreshAuthToken();
    // Retry request with new token
    return authenticatedFetch(url, options);
  }

  return response;
}
```

## Docker Issues

### Container Problems

#### Docker Build Fails
**Symptoms:**
- Docker build errors
- Container won't start

**Solutions:**
```bash
# Check Docker daemon
sudo systemctl status docker
sudo systemctl start docker

# Build with no cache
docker-compose build --no-cache

# Check build logs
docker-compose logs api
docker-compose logs frontend
docker-compose logs ml

# Common Docker issues:
# 1. Port conflicts: Change ports in docker-compose.yml
# 2. Volume permissions: Check directory ownership
# 3. Memory limits: Increase Docker memory allocation
```

#### Docker Container Resource Issues
**Symptoms:**
- Containers keep restarting
- Out of memory errors

**Solutions:**
```bash
# Check container resource usage
docker stats

# Increase memory limits in docker-compose.yml
services:
  api:
    mem_limit: 2g
    memswap_limit: 2g

# Check container logs
docker-compose logs -f api

# Restart services
docker-compose down
docker-compose up -d
```

## Getting Help

### Debug Information Collection

Before seeking help, collect this information:

```bash
# System information
uname -a
node --version
python --version

# Service status
sudo systemctl status postgresql neo4j redis

# Application logs
journalctl -u cfv-api -f

# Network connectivity
netstat -tlnp | grep -E ':(3000|3001|8000|5432|6379|7474|7687)'

# Error logs
tail -f /var/log/postgresql/postgresql-15-main.log
tail -f /var/log/neo4j/neo4j.log
```

### Support Resources

1. **Documentation**: [User Guide](USER_GUIDE.md)
2. **GitHub Issues**: [Report bugs here](https://github.com/marcuspat/CFV/issues)
3. **Community**: [Discord Server](https://discord.gg/cfv)
4. **Email**: support@cfv.dev

### Creating Bug Reports

Include the following in bug reports:

1. **System Information**: OS, versions, specifications
2. **Error Messages**: Full error logs and stack traces
3. **Steps to Reproduce**: Detailed reproduction steps
4. **Expected Behavior**: What should happen
5. **Actual Behavior**: What actually happened
6. **Configuration**: Relevant .env settings (remove secrets)

---

For additional support or questions not covered in this guide, please refer to our comprehensive [documentation](README.md#documentation) or contact our support team.