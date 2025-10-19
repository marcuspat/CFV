# Deployment Guide

## Overview

This guide provides comprehensive instructions for deploying the Cognitive Fabric Visualizer across different environments, from local development to production Kubernetes clusters. It includes prerequisites, step-by-step procedures, and troubleshooting guidance.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Local Development Setup](#local-development-setup)
3. [Staging Environment Deployment](#staging-environment-deployment)
4. [Production Environment Deployment](#production-environment-deployment)
5. [Configuration Management](#configuration-management)
6. [Monitoring and Observability Setup](#monitoring-and-observability-setup)
7. [Backup and Disaster Recovery](#backup-and-disaster-recovery)
8. [Troubleshooting Guide](#troubleshooting-guide)

## Prerequisites

### System Requirements

#### Local Development
- **OS**: macOS 10.15+, Ubuntu 20.04+, or Windows 10+ with WSL2
- **RAM**: Minimum 16GB, recommended 32GB
- **Storage**: Minimum 50GB free space
- **CPU**: 4+ cores, recommended 8+ cores

#### Production Environment
- **Kubernetes**: v1.28+ with EKS, GKE, or AKS
- **Nodes**: Minimum 3 worker nodes
- **GPU Nodes**: At least 2 nodes with NVIDIA GPUs (V100 or A100 recommended)
- **Storage**: 500GB+ SSD storage with IOPS optimization
- **Network**: 10Gbps+ network bandwidth

### Required Software

#### Development Tools
```bash
# Core development tools
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Docker and Docker Compose
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# kubectl and helm
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
sudo install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl

curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash

# Additional tools
sudo apt-get install -y git make build-essential python3 python3-pip
pip3 install --user ansible
```

#### Cloud Provider CLI
```bash
# AWS CLI
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install

# Google Cloud CLI
curl https://sdk.cloud.google.com | bash
exec -l $SHELL

# Azure CLI
curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash
```

## Local Development Setup

### 1. Repository Clone and Setup
```bash
# Clone the repository
git clone https://github.com/cfv/cognitive-fabric-visualizer.git
cd cognitive-fabric-visualizer

# Install development dependencies
npm install

# Setup Python virtual environment for ML services
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Setup pre-commit hooks
npm run setup:pre-commit
```

### 2. Environment Configuration
```bash
# Copy environment templates
cp .env.example .env.local
cp config/environments/development.yaml.example config/environments/development.yaml

# Edit environment configuration
nano .env.local
```

#### .env.local Configuration
```bash
# Database Configuration
DATABASE_URL=postgresql://postgres:password@localhost:5432/cfv_dev
NEO4J_URL=bolt://localhost:7687
NEO4J_AUTH=neo4j/password
REDIS_URL=redis://localhost:6379

# API Keys (replace with actual keys)
OPENAI_API_KEY=your_openai_api_key_here
ANTHROPIC_API_KEY=your_anthropic_api_key_here
GOOGLE_AI_API_KEY=your_google_ai_api_key_here

# JWT Configuration
JWT_SECRET=your_jwt_secret_here
JWT_REFRESH_SECRET=your_jwt_refresh_secret_here

# Storage Configuration
AWS_ACCESS_KEY_ID=your_aws_access_key
AWS_SECRET_ACCESS_KEY=your_aws_secret_key
AWS_S3_BUCKET=cfv-dev-storage
AWS_REGION=us-west-2

# Monitoring
SENTRY_DSN=your_sentry_dsn_here
```

### 3. Development Services Startup
```bash
# Start all services with Docker Compose
docker-compose up -d

# Initialize databases
npm run db:migrate
npm run db:seed

# Start development servers
npm run dev
```

### 4. Service Verification
```bash
# Check API Gateway
curl http://localhost:3000/health

# Check ML Service
curl http://localhost:8000/health

# Check Frontend
curl http://localhost:3001

# View service logs
docker-compose logs -f api-gateway
docker-compose logs -f ml-service
```

## Staging Environment Deployment

### 1. Infrastructure Provisioning
```bash
# Create staging namespace
kubectl create namespace cfv-staging

# Apply infrastructure manifests
kubectl apply -f k8s/staging/infrastructure/

# Verify infrastructure setup
kubectl get all -n cfv-staging
```

### 2. Database Setup
```bash
# Deploy PostgreSQL
kubectl apply -f k8s/staging/databases/postgres.yaml

# Deploy Neo4j
kubectl apply -f k8s/staging/databases/neo4j.yaml

# Deploy Redis
kubectl apply -f k8s/staging/databases/redis.yaml

# Wait for databases to be ready
kubectl wait --for=condition=ready pod -l app=postgres -n cfv-staging --timeout=300s
kubectl wait --for=condition=ready pod -l app=neo4j -n cfv-staging --timeout=300s
kubectl wait --for=condition=ready pod -l app=redis -n cfv-staging --timeout=300s
```

### 3. Application Deployment
```bash
# Deploy application services
kubectl apply -f k8s/staging/applications/

# Deploy ingress and networking
kubectl apply -f k8s/staging/networking/

# Deploy monitoring
kubectl apply -f k8s/staging/monitoring/
```

### 4. Configuration Management
```bash
# Create staging secrets
kubectl create secret generic cfv-staging-secrets \
  --from-literal=database-url=$STAGING_DATABASE_URL \
  --from-literal=redis-url=$STAGING_REDIS_URL \
  --from-literal=neo4j-url=$STAGING_NEO4J_URL \
  --from-literal=jwt-secret=$STAGING_JWT_SECRET \
  --from-literal=openai-api-key=$STAGING_OPENAI_API_KEY \
  -n cfv-staging

# Apply ConfigMaps
kubectl apply -f k8s/staging/configmaps/
```

### 5. Deployment Verification
```bash
# Check deployment status
kubectl get deployments -n cfv-staging
kubectl get pods -n cfv-staging

# Check service endpoints
kubectl get services -n cfv-staging

# Test API connectivity
kubectl port-forward svc/api-gateway-service 3000:80 -n cfv-staging
curl http://localhost:3000/health
```

## Production Environment Deployment

### 1. Production Infrastructure Setup

#### Kubernetes Cluster Creation (AWS EKS)
```bash
# Create EKS cluster
aws eks create-cluster \
  --name cfv-production \
  --region us-west-2 \
  --kubernetes-version 1.28 \
  --nodegroup-name standard-workers \
  --node-type t3.large \
  --nodes 3 \
  --nodes-min 3 \
  --nodes-max 10 \
  --managed

# Create GPU node group
aws eks create-nodegroup \
  --cluster-name cfv-production \
  --nodegroup-name gpu-workers \
  --node-type p3.2xlarge \
  --nodes 2 \
  --nodes-min 2 \
  --nodes-max 8 \
  --ami-type AL2_x86_64_GPU \
  --instance-types p3.2xlarge,p3.8xlarge

# Update kubeconfig
aws eks update-kubeconfig --region us-west-2 --name cfv-production
```

#### Storage Setup
```bash
# Create storage classes
kubectl apply -f k8s/production/storage/storage-classes.yaml

# Create persistent volumes for databases
kubectl apply -f k8s/production/storage/postgres-pv.yaml
kubectl apply -f k8s/production/storage/neo4j-pv.yaml
kubectl apply -f k8s/production/storage/model-cache-pv.yaml
```

### 2. Production Database Deployment

#### PostgreSQL High Availability Cluster
```bash
# Deploy CloudNativePG operator
kubectl apply -f https://raw.githubusercontent.com/cloudnative-pg/cloudnative-pg/release-1.21/releases/cnpg-1.21.0.yaml

# Deploy PostgreSQL cluster
kubectl apply -f k8s/production/databases/postgres-cluster.yaml

# Configure backup and replication
kubectl apply -f k8s/production/databases/postgres-backup.yaml

# Verify cluster status
kubectl get cluster -n cfv-production
kubectl get pods -n cfv-production -l cnpg.io/cluster=postgres-cluster
```

#### Neo4j Enterprise Cluster
```bash
# Deploy Neo4j operator
helm repo add neo4j https://helm.neo4j.com/neo4j
helm install neo4j-operator neo4j/neo4j-operator

# Deploy Neo4j cluster
kubectl apply -f k8s/production/databases/neo4j-cluster.yaml

# Verify cluster status
kubectl get neo4jcluster -n cfv-production
kubectl get pods -n cfv-production -l app=neo4j
```

### 3. Production Application Deployment

#### Core Services Deployment
```bash
# Create production namespace
kubectl create namespace cfv-production

# Deploy secrets and configmaps
kubectl apply -f k8s/production/secrets/
kubectl apply -f k8s/production/configmaps/

# Deploy core services
kubectl apply -f k8s/production/services/api-gateway.yaml
kubectl apply -f k8s/production/services/ml-service.yaml
kubectl apply -f k8s/production/services/frontend.yaml

# Deploy supporting services
kubectl apply -f k8s/production/services/cache-service.yaml
kubectl apply -f k8s/production/services/monitoring-service.yaml
```

#### Ingress and Load Balancing
```bash
# Install NGINX Ingress Controller
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo update
helm install ingress-nginx ingress-nginx/ingress-nginx \
  --namespace ingress-nginx \
  --create-namespace

# Install cert-manager for SSL certificates
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.12.0/cert-manager.yaml

# Deploy application ingress
kubectl apply -f k8s/production/networking/ingress.yaml

# Configure SSL certificates
kubectl apply -f k8s/production/networking/certificates.yaml
```

### 4. Production Monitoring Setup

#### Prometheus Stack
```bash
# Install Prometheus Operator
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

# Deploy Prometheus
helm install prometheus prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --create-namespace \
  --values k8s/production/monitoring/prometheus-values.yaml

# Deploy custom monitoring
kubectl apply -f k8s/production/monitoring/custom-metrics.yaml
```

#### Logging Stack
```bash
# Install Elastic Stack
helm repo add elastic https://helm.elastic.co
helm repo update

# Deploy Elasticsearch
helm install elasticsearch elastic/elasticsearch \
  --namespace logging \
  --create-namespace \
  --values k8s/production/logging/elasticsearch-values.yaml

# Deploy Kibana
helm install kibana elastic/kibana \
  --namespace logging \
  --create-namespace \
  --values k8s/production/logging/kibana-values.yaml

# Deploy Logstash
helm install logstash elastic/logstash \
  --namespace logging \
  --create-namespace \
  --values k8s/production/logging/logstash-values.yaml
```

### 5. Production Verification
```bash
# Check all deployments
kubectl get deployments -n cfv-production
kubectl get pods -n cfv-production

# Check service status
kubectl get services -n cfv-production
kubectl get ingress -n cfv-production

# Check autoscaling
kubectl get hpa -n cfv-production

# Run health checks
./scripts/health-check.sh production
```

## Configuration Management

### Environment-Specific Configuration

#### Development Configuration
```yaml
# config/environments/development.yaml
environment: development
debug: true
log_level: debug

api_gateway:
  port: 3000
  cors_origins: ["http://localhost:3001"]
  rate_limiting:
    enabled: false

ml_service:
  port: 8000
  model_cache_size: 100
  inference_timeout_ms: 30000

database:
  postgres:
    host: localhost
    port: 5432
    database: cfv_dev
    pool_size: 5
  neo4j:
    uri: bolt://localhost:7687
    username: neo4j
    password: password
  redis:
    host: localhost
    port: 6379
    database: 0

monitoring:
  prometheus:
    enabled: true
    port: 9090
  jaeger:
    enabled: true
    port: 16686
```

#### Production Configuration
```yaml
# config/environments/production.yaml
environment: production
debug: false
log_level: info

api_gateway:
  port: 3000
  cors_origins: ["https://app.cfv.com"]
  rate_limiting:
    enabled: true
    requests_per_minute: 1000

ml_service:
  port: 8000
  model_cache_size: 1000
  inference_timeout_ms: 60000
  gpu_enabled: true

database:
  postgres:
    host: postgres-rw.cfv-production.svc.cluster.local
    port: 5432
    database: cfv_production
    pool_size: 20
    ssl_mode: require
  neo4j:
    uri: bolt://neo4j-core.cfv-production.svc.cluster.local:7687
    username: neo4j
    password: ${NEO4J_PASSWORD}
    ssl_enabled: true
  redis:
    host: redis-cluster.cfv-production.svc.cluster.local
    port: 6379
    database: 0
    ssl_enabled: true

monitoring:
  prometheus:
    enabled: true
    port: 9090
  jaeger:
    enabled: true
    port: 16686
  alerting:
    enabled: true
    slack_webhook: ${SLACK_WEBHOOK_URL}

security:
  jwt:
    secret: ${JWT_SECRET}
    expiry_minutes: 15
    refresh_expiry_days: 7
  encryption:
    key: ${ENCRYPTION_KEY}
    algorithm: AES-256-GCM
```

### Secret Management

#### Kubernetes Secrets
```bash
# Create application secrets
kubectl create secret generic cfv-secrets \
  --from-literal=database-url=$DATABASE_URL \
  --from-literal=redis-url=$REDIS_URL \
  --from-literal=neo4j-url=$NEO4J_URL \
  --from-literal=jwt-secret=$JWT_SECRET \
  --from-literal=encryption-key=$ENCRYPTION_KEY \
  --from-literal=openai-api-key=$OPENAI_API_KEY \
  --from-literal=anthropic-api-key=$ANTHROPIC_API_KEY \
  -n cfv-production

# Create TLS certificates
kubectl create secret tls cfv-tls \
  --cert=path/to/tls.crt \
  --key=path/to/tls.key \
  -n cfv-production

# Create backup credentials
kubectl create secret generic backup-credentials \
  --from-literal=aws-access-key-id=$AWS_ACCESS_KEY_ID \
  --from-literal=aws-secret-access-key=$AWS_SECRET_ACCESS_KEY \
  -n cfv-production
```

## Monitoring and Observability Setup

### Prometheus Configuration
```yaml
# monitoring/prometheus.yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

rule_files:
  - "alert_rules.yml"
  - "recording_rules.yml"

alerting:
  alertmanagers:
    - static_configs:
        - targets:
          - alertmanager:9093

scrape_configs:
  - job_name: 'kubernetes-apiservers'
    kubernetes_sd_configs:
    - role: endpoints
    scheme: https
    tls_config:
      ca_file: /var/run/secrets/kubernetes.io/serviceaccount/ca.crt
    bearer_token_file: /var/run/secrets/kubernetes.io/serviceaccount/token
    relabel_configs:
    - source_labels: [__meta_kubernetes_namespace, __meta_kubernetes_service_name, __meta_kubernetes_endpoint_port_name]
      action: keep
      regex: default;kubernetes;https

  - job_name: 'kubernetes-nodes'
    kubernetes_sd_configs:
    - role: node
    relabel_configs:
    - action: labelmap
      regex: __meta_kubernetes_node_label_(.+)

  - job_name: 'kubernetes-pods'
    kubernetes_sd_configs:
    - role: pod
    relabel_configs:
    - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_scrape]
      action: keep
      regex: true
    - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_path]
      action: replace
      target_label: __metrics_path__
      regex: (.+)
```

### Alerting Rules
```yaml
# monitoring/alert_rules.yml
groups:
- name: cfv-production.rules
  rules:
  - alert: HighErrorRate
    expr: rate(http_requests_total{status=~"5.."}[5m]) / rate(http_requests_total[5m]) > 0.05
    for: 5m
    labels:
      severity: critical
    annotations:
      summary: "High error rate detected"
      description: "Error rate is {{ $value | humanizePercentage }} for {{ $labels.job }}"

  - alert: HighResponseTime
    expr: histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) > 1
    for: 5m
    labels:
      severity: warning
    annotations:
      summary: "High response time detected"
      description: "95th percentile response time is {{ $value }}s for {{ $labels.job }}"

  - alert: DatabaseConnectionsHigh
    expr: pg_stat_database_numbackends / pg_settings_max_connections > 0.8
    for: 5m
    labels:
      severity: warning
    annotations:
      summary: "Database connection usage high"
      description: "Database connections at {{ $value | humanizePercentage }} capacity"

  - alert: PodCrashLooping
    expr: rate(kube_pod_container_status_restarts_total[15m]) > 0
    for: 5m
    labels:
      severity: critical
    annotations:
      summary: "Pod is crash looping"
      description: "Pod {{ $labels.namespace }}/{{ $labels.pod }} is crash looping"
```

### Grafana Dashboard Setup
```bash
# Import dashboards
kubectl create configmap grafana-dashboards \
  --from-file=monitoring/dashboards/ \
  -n monitoring

# Configure Grafana datasources
kubectl apply -f monitoring/grafana/datasources.yaml

# Deploy Grafana
helm install grafana grafana/grafana \
  --namespace monitoring \
  --values monitoring/grafana/values.yaml
```

## Backup and Disaster Recovery

### Database Backup Configuration

#### PostgreSQL Backups
```bash
# Create backup script
cat > scripts/postgres-backup.sh << 'EOF'
#!/bin/bash

NAMESPACE="cfv-production"
CLUSTER_NAME="postgres-cluster"
BACKUP_BUCKET="cfv-backups"
RETENTION_DAYS=30

# Create backup
kubectl exec -n $NAMESPACE $CLUSTER_NAME-1 -- pg_dumpall -U postgres > backup-$(date +%Y%m%d-%H%M%S).sql

# Upload to S3
aws s3 cp backup-$(date +%Y%m%d-%H%M%S).sql s3://$BACKUP_BUCKET/postgres/

# Clean up old backups
aws s3 ls s3://$BACKUP_BUCKET/postgres/ | while read -r line; do
    createDate=$(echo $line | awk '{print $1" "$2}')
    createDate=$(date -d "$createDate" +%s)
    olderThan=$(date -d "$RETENTION_DAYS days ago" +%s)
    if [[ $createDate -lt $olderThan ]]; then
        fileName=$(echo $line | awk '{print $4}')
        aws s3 rm s3://$BACKUP_BUCKET/postgres/$fileName
    fi
done
EOF

chmod +x scripts/postgres-backup.sh

# Create cron job
kubectl apply -f k8s/production/backup/postgres-backup-cron.yaml
```

#### Neo4j Backups
```bash
# Neo4j backup configuration
cat > scripts/neo4j-backup.sh << 'EOF'
#!/bin/bash

NAMESPACE="cfv-production"
BACKUP_BUCKET="cfv-backups"

# Trigger backup
kubectl exec -n $NAMESPACE neo4j-core-0 -- neo4j-admin backup \
  --from=neo4j://neo4j-core:6362 \
  --backup-dir=/backups \
  --name=backup-$(date +%Y%m%d-%H%M%S)

# Upload to S3
kubectl exec -n $NAMESPACE neo4j-core-0 -- aws s3 cp /backups/backup-$(date +%Y%m%d-%H%M%S) s3://$BACKUP_BUCKET/neo4j/
EOF

chmod +x scripts/neo4j-backup.sh
```

### Disaster Recovery Procedures

#### 1. Database Recovery
```bash
# PostgreSQL recovery
kubectl exec -n cfv-production postgres-cluster-1 -- psql -U postgres -d cfv_production < backup-file.sql

# Neo4j recovery
kubectl exec -n cfv-production neo4j-core-0 -- neo4j-admin restore \
  --from=neo4j://neo4j-core:6362 \
  --backup-dir=/backups \
  --name=backup-to-restore
```

#### 2. Full Cluster Recovery
```bash
# Restore from Velero backup
velero restore create --from-backup backup-name --namespace-mappings cfv-production:cfv-production-restored

# Verify restored resources
kubectl get all -n cfv-production-restored

# Switch traffic to restored cluster
kubectl patch service api-gateway-service -n cfv-production -p '{"spec":{"selector":{"version":"restored"}}}'
```

## Troubleshooting Guide

### Common Issues and Solutions

#### 1. Pod Startup Issues
```bash
# Check pod status and events
kubectl describe pod <pod-name> -n cfv-production

# Check pod logs
kubectl logs <pod-name> -n cfv-production --previous

# Check resource usage
kubectl top pods -n cfv-production
```

#### 2. Database Connection Issues
```bash
# Test database connectivity
kubectl exec -it -n cfv-production api-gateway-pod -- ping postgres-rw.cfv-production.svc.cluster.local

# Check database logs
kubectl logs postgres-cluster-1 -n cfv-production

# Verify database credentials
kubectl get secret cfv-secrets -n cfv-production -o yaml
```

#### 3. Performance Issues
```bash
# Check resource utilization
kubectl top nodes
kubectl top pods -n cfv-production

# Check HPA status
kubectl get hpa -n cfv-production
kubectl describe hpa api-gateway-hpa -n cfv-production

# Analyze metrics
kubectl port-forward svc/prometheus-server 9090:80 -n monitoring
# Access http://localhost:9090
```

#### 4. Network Issues
```bash
# Check service endpoints
kubectl get endpoints -n cfv-production

# Test network policies
kubectl exec -it -n cfv-production api-gateway-pod -- nslookup ml-service.cfv-production.svc.cluster.local

# Check ingress status
kubectl get ingress -n cfv-production
kubectl describe ingress cfv-ingress -n cfv-production
```

### Health Check Scripts

#### Automated Health Check
```bash
#!/bin/bash
# scripts/health-check.sh

ENVIRONMENT=${1:-development}
NAMESPACE="cfv-$ENVIRONMENT"

echo "Running health check for $ENVIRONMENT environment..."

# Check deployments
echo "Checking deployments..."
kubectl get deployments -n $NAMESPACE
if [ $? -ne 0 ]; then
    echo "ERROR: Failed to get deployments"
    exit 1
fi

# Check pods
echo "Checking pods..."
kubectl get pods -n $NAMESPACE
if [ $? -ne 0 ]; then
    echo "ERROR: Failed to get pods"
    exit 1
fi

# Check services
echo "Checking services..."
kubectl get services -n $NAMESPACE
if [ $? -ne 0 ]; then
    echo "ERROR: Failed to get services"
    exit 1
fi

# Run application health checks
echo "Running application health checks..."

API_URL=$(kubectl get ingress cfv-ingress -n $NAMESPACE -o jsonpath='{.spec.rules[0].host}')
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" https://$API_URL/health)

if [ $RESPONSE -eq 200 ]; then
    echo "✅ API Gateway health check passed"
else
    echo "❌ API Gateway health check failed (HTTP $RESPONSE)"
    exit 1
fi

echo "All health checks passed for $ENVIRONMENT environment"
```

This deployment guide provides comprehensive instructions for deploying the Cognitive Fabric Visualizer across all environments with proper configuration, monitoring, and troubleshooting procedures.