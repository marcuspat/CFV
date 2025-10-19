# Installation Guide - Cognitive Fabric Visualizer

## Prerequisites

### System Requirements

- **Operating System**: Linux (Ubuntu 20.04+), macOS (10.15+), or Windows 10+ with WSL2
- **Memory**: Minimum 16GB RAM (32GB recommended for ML processing)
- **Storage**: 10GB available disk space
- **Network**: Internet connection for LLM API calls

### Required Software

**Node.js Environment**
```bash
Node.js: >= 18.0.0 (exact tested: 18.19.0)
npm: >= 8.0.0 (exact tested: 10.2.3)
```

**Python Environment**
```bash
Python: >= 3.10.0 (exact tested: 3.11.6)
pip: >= 23.0.0
```

**Database Systems**
```bash
PostgreSQL: 15.5
Neo4j: 5.15.0
Redis: 7.2.4
```

**API Keys Required**
- OpenAI API: GPT-4 access
- Anthropic API: Claude-3 access

## Installation Steps

### 1. System Preparation

**Update System Packages**
```bash
# Ubuntu/Debian
sudo apt update && sudo apt upgrade -y
sudo apt install -y build-essential git curl wget

# macOS
brew update && brew upgrade
brew install git curl wget

# Windows (WSL2)
sudo apt update && sudo apt upgrade -y
sudo apt install -y build-essential git curl wget
```

**Install Node.js**
```bash
# Install Node.js 18.x
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify installation
node --version  # Should be v18.x.x
npm --version   # Should be >= 8.x.x
```

**Install Python 3.11**
```bash
# Ubuntu/Debian
sudo apt install -y python3.11 python3.11-venv python3.11-dev python3-pip

# Create virtual environment
python3.11 -m venv cognitive_env
source cognitive_env/bin/activate

# Verify installation
python --version  # Should be Python 3.11.x
pip --version     # Should be >= 23.x.x
```

### 2. Database Installation

**Install PostgreSQL 15.5**
```bash
# Install PostgreSQL
sudo apt install -y postgresql-15 postgresql-contrib-15

# Start service
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Create database and user
sudo -u postgres psql << EOF
CREATE DATABASE cognitive_fabric;
CREATE USER cf_user WITH PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE cognitive_fabric TO cf_user;
\q
EOF
```

**Install Neo4j 5.15.0**
```bash
# Add Neo4j repository
wget -O - https://debian.neo4j.com/neotechnology.gpg.key | sudo apt-key add -
echo 'deb https://debian.neo4j.com stable 5.15' | sudo tee /etc/apt/sources.list.d/neo4j.list

# Install Neo4j
sudo apt update
sudo apt install -y neo4j=5.15.0

# Configure and start
sudo systemctl enable neo4j
sudo systemctl start neo4j

# Set initial password (replace with secure password)
curl -X POST -H "Content-Type: application/json" \
  -d '{"password": "your_secure_password"}' \
  -u neo4j:neo4j \
  http://localhost:7474/user/neo4j/password
```

**Install Redis 7.2.4**
```bash
# Install Redis
sudo apt install -y redis-server=7.2.4*

# Configure Redis
sudo sed -i 's/supervised no/supervised systemd/' /etc/redis/redis.conf

# Start and enable
sudo systemctl restart redis.service
sudo systemctl enable redis

# Verify installation
redis-cli ping  # Should return PONG
```

### 3. Application Setup

**Clone Repository**
```bash
git clone https://github.com/marcuspat/CFV.git
cd CFV
```

**Install Dependencies**
```bash
# Install root dependencies
npm install

# Install client dependencies
cd src/client
npm install
cd ../..
```

**Configure Environment Variables**
```bash
# Copy environment template
cp .env.example .env

# Edit environment file
nano .env
```

**Required `.env` configuration:**
```bash
# Server Configuration
PORT=3001
NODE_ENV=development

# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=cognitive_fabric
DB_USER=cf_user
DB_PASSWORD=your_secure_password

# Neo4j Configuration
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=your_secure_password

# Redis Configuration
REDIS_URL=redis://localhost:6379

# API Keys (REQUIRED - add your actual keys)
OPENAI_API_KEY=sk-your-actual-openai-api-key
ANTHROPIC_API_KEY=sk-ant-your-actual-anthropic-api-key

# Security
JWT_SECRET=generate-256-bit-secret-key-here
JWT_EXPIRES_IN=7d

# Performance Configuration
VERIFICATION_THRESHOLD=0.95
COGNITIVE_PROCESSING_TIMEOUT=30000
ML_SERVICE_URL=http://localhost:8000
```

### 4. Python ML Environment Setup

**Install Python Dependencies**
```bash
# Navigate to ML directory
cd src/ml

# Install Python requirements
pip install -r requirements.txt

# Install spaCy models
python -m spacy download en_core_web_lg

# Install additional NLTK data
python -c "
import nltk
nltk.download('punkt')
nltk.download('stopwords')
nltk.download('wordnet')
"

# Return to project root
cd ../..
```

### 5. Database Initialization

**Initialize PostgreSQL Schema**
```bash
# Run database migrations (automatic on server start)
npm run migrate
```

**Initialize Neo4j Constraints**
```bash
# Connect to Neo4j and run constraints
cypher-shell -u neo4j -p your_secure_password << EOF
CREATE CONSTRAINT cognitive_element_id IF NOT EXISTS FOR (c:CognitiveElement) REQUIRE c.id IS UNIQUE;
CREATE CONSTRAINT conversation_id IF NOT EXISTS FOR (c:Conversation) REQUIRE c.id IS UNIQUE;
CREATE CONSTRAINT user_id IF NOT EXISTS FOR (u:User) REQUIRE u.id IS UNIQUE;
EOF
```

### 6. Starting the Application

**Development Mode**

Open three terminal windows:

**Terminal 1 - Start ML API Service:**
```bash
cd /path/to/CFV/src/api
python main.py
# Service runs on http://localhost:8000
```

**Terminal 2 - Start Express Server:**
```bash
cd /path/to/CFV
npm run dev
# Server runs on http://localhost:3001
```

**Terminal 3 - Start React Client:**
```bash
cd /path/to/CFV/src/client
npm start
# Client runs on http://localhost:3000
```

**Production Mode**
```bash
# Build React client
cd src/client
npm run build

# Start production server
cd ../..
npm run start
```

## Service Endpoints

| Service | Port | URL | Description |
|---------|------|-----|-------------|
| React Client | 3000 | http://localhost:3000 | Frontend application |
| Express Server | 3001 | http://localhost:3001 | Backend API server |
| Python ML API | 8000 | http://localhost:8000 | ML processing service |
| PostgreSQL | 5432 | localhost:5432 | Primary database |
| Neo4j HTTP | 7474 | http://localhost:7474 | Neo4j web interface |
| Neo4j Bolt | 7687 | bolt://localhost:7687 | Neo4j protocol |
| Redis | 6379 | localhost:6379 | Cache server |

## Health Verification

**Check Service Status**
```bash
# Check ML API health
curl http://localhost:8000/health

# Check server health
curl http://localhost:3001/health

# Check database connections
curl http://localhost:3001/health/databases
```

**Expected Health Response**
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "uptime": 123.45,
  "components": {
    "cognitive_decomposer": true,
    "confidence_scorer": true,
    "redis": true,
    "postgres": true,
    "neo4j": true
  },
  "performance_metrics": {
    "average_processing_time": 2.3,
    "cache_hit_rate": 0.85,
    "error_rate": 0.02
  }
}
```

## Troubleshooting

### Common Installation Issues

**Node.js Version Conflicts**
```bash
# Problem: Node.js version incompatible
# Solution: Use nvm to manage versions
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc
nvm install 18
nvm use 18
```

**Python Environment Issues**
```bash
# Problem: Python modules not found
# Solution: Ensure virtual environment is activated
source cognitive_env/bin/activate
pip install -r src/ml/requirements.txt

# Problem: spaCy model download fails
# Solution: Download manually
python -m spacy download en_core_web_lg --user
```

**Database Connection Failures**
```bash
# Problem: PostgreSQL connection refused
# Solution: Check service status
sudo systemctl status postgresql
sudo systemctl start postgresql

# Problem: Neo4j authentication fails
# Solution: Reset password
sudo neo4j-admin set-initial-password your_new_password
```

**API Key Configuration Errors**
```bash
# Problem: Invalid OpenAI API key
# Solution: Verify key format and permissions
export OPENAI_API_KEY=sk-...
curl -H "Authorization: Bearer $OPENAI_API_KEY" https://api.openai.com/v1/models
```

### Performance Issues

**Slow Processing**
```bash
# Check ML service health
curl http://localhost:8000/metrics

# Monitor resource usage
htop
iostat -x 1
```

**Memory Issues**
```bash
# Increase swap space
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

## Docker Installation (Alternative)

### Quick Start with Docker

```bash
# Clone repository
git clone https://github.com/marcuspat/CFV.git
cd CFV

# Copy and configure environment
cp .env.example .env
# Edit .env with your API keys and passwords

# Start all services
docker-compose up -d

# View logs
docker-compose logs -f
```

### Docker Services

- **cfv-frontend**: React application (port 3000)
- **cfv-api**: Express server (port 3001)
- **cfv-ml**: Python ML service (port 8000)
- **postgres**: PostgreSQL database (port 5432)
- **neo4j**: Neo4j graph database (ports 7474, 7687)
- **redis**: Redis cache (port 6379)

## Next Steps

1. **Verify Installation**: Access http://localhost:3000 to confirm the application is running
2. **Create Account**: Register for an account or use the demo credentials
3. **Upload Conversation**: Try analyzing your first conversation
4. **Explore Visualization**: Interact with the cognitive fabric visualization
5. **Review Documentation**: Read the User Guide for advanced features

For additional support, see the [Troubleshooting Guide](TROUBLESHOOTING.md) or [User Guide](USER_GUIDE.md).