# Infrastructure & DevOps Architecture

## Overview

The Infrastructure architecture provides a scalable, containerized deployment strategy supporting 99.5% uptime with automated scaling, comprehensive monitoring, and zero-downtime deployments. This design leverages Kubernetes orchestration, GitOps workflows, and infrastructure as code practices for production-grade reliability.

## Architecture Components

### Infrastructure Overview
```
┌─────────────────────────────────────────────────────────────────────────┐
│                        CDN & Edge Layer                                │
├─────────────────────────────────────────────────────────────────────────┤
│  CloudFlare CDN     │ AWS CloudFront    │ Edge Locations             │
│  Static Assets      │ API Caching        │ Global Distribution        │
│  DDoS Protection    │ Latency Reduction  │ Geographic Redundancy      │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
┌─────────────────────────────────────────────────────────────────────────┐
│                        Load Balancer Layer                             │
├─────────────────────────────────────────────────────────────────────────┤
│  AWS ALB/NLB        │ TLS Termination   │ Health Checks              │
│  Path-based Routing │ SSL Certificates  │ Failover Logic             │
│  Sticky Sessions    │ WAF Protection    │ Rate Limiting              │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
┌─────────────────────────────────────────────────────────────────────────┐
│                    Kubernetes Cluster                                   │
├─────────────────────────────────────────────────────────────────────────┤
│  Master Nodes       │ Worker Nodes       │ ETCD Cluster              │
│  Control Plane      │ Application Pods   │ Configuration Storage     │
│  Scheduler          │ GPU Nodes          │ Backup & Replication      │
├─────────────────────────────────────────────────────────────────────────┤
│  Services           │ Ingress            │ Namespaces                │
│  Load Balancing     │ SSL Termination    │ Resource Quotas           │
│  Service Mesh       │ Traffic Routing    │ Network Policies          │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
┌─────────────────────────────────────────────────────────────────────────┐
│                    Application Services                                │
├─────────────────────────────────────────────────────────────────────────┤
│  API Gateway        │ ML Services        │ Web Services              │
│  Authentication     │ GPU Pods           | Visualization Engine      │
│  Rate Limiting      │ Model Inference    | Real-time Collaboration  │
├─────────────────────────────────────────────────────────────────────────┤
│  Databases          │ Caching Layer      │ Storage                   │
│  PostgreSQL Cluster │ Redis Cluster      │ S3 Buckets               │
│  Neo4j Cluster      │ Session Store      │ Model Storage             │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
┌─────────────────────────────────────────────────────────────────────────┐
│                    Monitoring & Observability                           │
├─────────────────────────────────────────────────────────────────────────┤
│  Prometheus         │ Grafana           │ AlertManager              │
│  Metrics Collection │ Dashboards        | Alert Routing             │
│  Custom Metrics     │ Business KPIs     | Notification Channels     │
├─────────────────────────────────────────────────────────────────────────┤
│  Logging            │ Tracing           │ APM                       │
│  ELK Stack          | Jaeger            | Distributed Tracing      │
│  Log Aggregation    │ Request Tracing   | Performance Monitoring    │
└─────────────────────────────────────────────────────────────────────────┘
```

### Technology Stack
- **Container Orchestration**: Kubernetes 1.28+ with AWS EKS
- **Service Mesh**: Istio for microservice communication
- **Ingress**: NGINX Ingress Controller with cert-manager
- **CI/CD**: GitLab CI with ArgoCD for GitOps
- **Monitoring**: Prometheus + Grafana + AlertManager
- **Logging**: ELK Stack (Elasticsearch, Logstash, Kibana)
- **Tracing**: Jaeger for distributed tracing
- **Security Falco**: Runtime security monitoring
- **Backup**: Velero for cluster backup and restore

## Container Architecture

### Multi-Stage Docker Builds
```dockerfile
# =====================================================
-- API Gateway Dockerfile
-- =====================================================

# Build Stage
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy source code
COPY src/ ./src/

# Build application
RUN npm run build

# Production Stage
FROM node:18-alpine AS production

# Security hardening
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    apk add --no-cache dumb-init

WORKDIR /app

# Copy built application
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/package.json ./package.json

# Switch to non-root user
USER nodejs

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Expose port
EXPOSE 3000

# Use dumb-init as PID 1
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]
```

```dockerfile
# =====================================================
-- ML Processing Service Dockerfile
-- =====================================================

# Base Stage with GPU support
FROM nvidia/cuda:11.8-devel-ubuntu20.04 AS base

# Install Python and dependencies
RUN apt-get update && apt-get install -y \
    python3.9 \
    python3.9-pip \
    python3.9-dev \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Create app user
RUN useradd --create-home --shell /bin/bash app

WORKDIR /home/app

# Copy requirements
COPY requirements.txt .

# Install Python dependencies
RUN pip3.9 install --no-cache-dir -r requirements.txt

# Copy application code
COPY --chown=app:app . .

# Switch to app user
USER app

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD python3 -c "import torch; print('GPU available:', torch.cuda.is_available())" || exit 1

# Expose port
EXPOSE 8000

# Start application
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### Docker Compose Development Environment
```yaml
# =====================================================
-- docker-compose.yml for Development
-- =====================================================

version: '3.8'

services:
  # API Gateway
  api-gateway:
    build:
      context: ./services/api-gateway
      dockerfile: Dockerfile.dev
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=development
      - DATABASE_URL=postgresql://postgres:password@postgres:5432/cfv_dev
      - REDIS_URL=redis://redis:6379
      - NEO4J_URL=bolt://neo4j:7687
    volumes:
      - ./services/api-gateway/src:/app/src
      - /app/node_modules
    depends_on:
      - postgres
      - redis
      - neo4j
    networks:
      - cfv-network

  # ML Processing Service
  ml-service:
    build:
      context: ./services/ml-processing
      dockerfile: Dockerfile.dev
    ports:
      - "8000:8000"
    environment:
      - PYTHONPATH=/home/app
      - DATABASE_URL=postgresql://postgres:password@postgres:5432/cfv_dev
      - REDIS_URL=redis://redis:6379
      - NEO4J_URL=bolt://neo4j:7687
      - CUDA_VISIBLE_DEVICES=0
    volumes:
      - ./services/ml-processing/src:/home/app/src
      - ./models:/home/app/models
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
    depends_on:
      - postgres
      - redis
      - neo4j
    networks:
      - cfv-network

  # PostgreSQL Database
  postgres:
    image: postgres:15-alpine
    environment:
      - POSTGRES_DB=cfv_dev
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=password
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./database/init:/docker-entrypoint-initdb.d
    networks:
      - cfv-network

  # Neo4j Graph Database
  neo4j:
    image: neo4j:5.12-enterprise
    environment:
      - NEO4J_AUTH=neo4j/password
      - NEO4J_ACCEPT_LICENSE_AGREEMENT=yes
      - NEO4J_PLUGINS=["apoc", "graph-data-science"]
      - NEO4J_dbms_security_procedures_unrestricted=apoc.*,gds.*
    ports:
      - "7474:7474"
      - "7687:7687"
    volumes:
      - neo4j_data:/data
      - neo4j_logs:/logs
      - neo4j_import:/var/lib/neo4j/import
      - neo4j_plugins:/plugins
    networks:
      - cfv-network

  # Redis Cache
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
      - ./redis/redis.conf:/usr/local/etc/redis/redis.conf
    command: redis-server /usr/local/etc/redis/redis.conf
    networks:
      - cfv-network

  # Frontend Development Server
  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile.dev
    ports:
      - "3001:3000"
    environment:
      - REACT_APP_API_URL=http://localhost:3000
      - REACT_APP_WS_URL=ws://localhost:3000
    volumes:
      - ./frontend/src:/app/src
      - ./frontend/public:/app/public
    depends_on:
      - api-gateway
    networks:
      - cfv-network

  # Monitoring Stack
  prometheus:
    image: prom/prometheus:latest
    ports:
      - "9090:9090"
    volumes:
      - ./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus_data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--web.console.libraries=/etc/prometheus/console_libraries'
      - '--web.console.templates=/etc/prometheus/consoles'
    networks:
      - cfv-network

  grafana:
    image: grafana/grafana:latest
    ports:
      - "3002:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
    volumes:
      - grafana_data:/var/lib/grafana
      - ./monitoring/grafana/dashboards:/etc/grafana/provisioning/dashboards
      - ./monitoring/grafana/datasources:/etc/grafana/provisioning/datasources
    depends_on:
      - prometheus
    networks:
      - cfv-network

volumes:
  postgres_data:
  neo4j_data:
  neo4j_logs:
  neo4j_import:
  neo4j_plugins:
  redis_data:
  prometheus_data:
  grafana_data:

networks:
  cfv-network:
    driver: bridge
```

## Kubernetes Deployment

### Namespace Configuration
```yaml
# =====================================================
-- Namespace and Resource Configuration
-- =====================================================

apiVersion: v1
kind: Namespace
metadata:
  name: cfv-production
  labels:
    name: cfv-production
    environment: production
---
apiVersion: v1
kind: ResourceQuota
metadata:
  name: cfv-production-quota
  namespace: cfv-production
spec:
  hard:
    requests.cpu: "10"
    requests.memory: 20Gi
    limits.cpu: "20"
    limits.memory: 40Gi
    persistentvolumeclaims: "10"
    services: "20"
    secrets: "20"
    configmaps: "20"
---
apiVersion: v1
kind: LimitRange
metadata:
  name: cfv-production-limits
  namespace: cfv-production
spec:
  limits:
  - default:
      cpu: "500m"
      memory: "512Mi"
    defaultRequest:
      cpu: "100m"
      memory: "128Mi"
    type: Container
  - max:
      cpu: "2"
      memory: "4Gi"
    min:
      cpu: "50m"
      memory: "64Mi"
    type: Container
```

### API Gateway Deployment
```yaml
# =====================================================
-- API Gateway Kubernetes Deployment
-- =====================================================

apiVersion: apps/v1
kind: Deployment
metadata:
  name: api-gateway
  namespace: cfv-production
  labels:
    app: api-gateway
    version: v1
spec:
  replicas: 3
  selector:
    matchLabels:
      app: api-gateway
  template:
    metadata:
      labels:
        app: api-gateway
        version: v1
      annotations:
        prometheus.io/scrape: "true"
        prometheus.io/port: "3000"
        prometheus.io/path: "/metrics"
    spec:
      containers:
      - name: api-gateway
        image: cfv/api-gateway:latest
        ports:
        - containerPort: 3000
          name: http
        env:
        - name: NODE_ENV
          value: "production"
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: cfv-secrets
              key: database-url
        - name: REDIS_URL
          valueFrom:
            secretKeyRef:
              name: cfv-secrets
              key: redis-url
        - name: JWT_SECRET
          valueFrom:
            secretKeyRef:
              name: cfv-secrets
              key: jwt-secret
        resources:
          requests:
            cpu: 200m
            memory: 256Mi
          limits:
            cpu: 500m
            memory: 512Mi
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
        securityContext:
          runAsNonRoot: true
          runAsUser: 1001
          allowPrivilegeEscalation: false
          readOnlyRootFilesystem: true
          capabilities:
            drop:
            - ALL
        volumeMounts:
        - name: tmp
          mountPath: /tmp
      volumes:
      - name: tmp
        emptyDir: {}
      securityContext:
        fsGroup: 1001
---
apiVersion: v1
kind: Service
metadata:
  name: api-gateway-service
  namespace: cfv-production
  labels:
    app: api-gateway
spec:
  selector:
    app: api-gateway
  ports:
  - port: 80
    targetPort: 3000
    protocol: TCP
    name: http
  type: ClusterIP
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: api-gateway-hpa
  namespace: cfv-production
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: api-gateway
  minReplicas: 3
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
      - type: Percent
        value: 10
        periodSeconds: 60
    scaleUp:
      stabilizationWindowSeconds: 60
      policies:
      - type: Percent
        value: 50
        periodSeconds: 60
```

### ML Service with GPU Support
```yaml
# =====================================================
-- ML Processing Service with GPU Support
-- =====================================================

apiVersion: apps/v1
kind: Deployment
metadata:
  name: ml-service
  namespace: cfv-production
  labels:
    app: ml-service
    version: v1
spec:
  replicas: 2
  selector:
    matchLabels:
      app: ml-service
  template:
    metadata:
      labels:
        app: ml-service
        version: v1
      annotations:
        prometheus.io/scrape: "true"
        prometheus.io/port: "8000"
        prometheus.io/path: "/metrics"
    spec:
      nodeSelector:
        accelerator: nvidia-tesla-v100
      containers:
      - name: ml-service
        image: cfv/ml-service:latest
        ports:
        - containerPort: 8000
          name: http
        env:
        - name: PYTHONPATH
          value: "/home/app"
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: cfv-secrets
              key: database-url
        - name: REDIS_URL
          valueFrom:
            secretKeyRef:
              name: cfv-secrets
              key: redis-url
        - name: NEO4J_URL
          valueFrom:
            secretKeyRef:
              name: cfv-secrets
              key: neo4j-url
        - name: CUDA_VISIBLE_DEVICES
          value: "0"
        resources:
          requests:
            cpu: 1000m
            memory: 4Gi
            nvidia.com/gpu: 1
          limits:
            cpu: 2000m
            memory: 8Gi
            nvidia.com/gpu: 1
        livenessProbe:
          httpGet:
            path: /health
            port: 8000
          initialDelaySeconds: 60
          periodSeconds: 30
        readinessProbe:
          httpGet:
            path: /ready
            port: 8000
          initialDelaySeconds: 30
          periodSeconds: 10
        securityContext:
          runAsNonRoot: true
          runAsUser: 1000
          allowPrivilegeEscalation: false
        volumeMounts:
        - name: model-cache
          mountPath: /home/app/models
        - name: tmp
          mountPath: /tmp
      volumes:
      - name: model-cache
        persistentVolumeClaim:
          claimName: ml-model-cache-pvc
      - name: tmp
        emptyDir: {}
      tolerations:
      - key: nvidia.com/gpu
        operator: Exists
        effect: NoSchedule
---
apiVersion: v1
kind: Service
metadata:
  name: ml-service
  namespace: cfv-production
  labels:
    app: ml-service
spec:
  selector:
    app: ml-service
  ports:
  - port: 80
    targetPort: 8000
    protocol: TCP
    name: http
  type: ClusterIP
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: ml-model-cache-pvc
  namespace: cfv-production
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 50Gi
  storageClassName: gp3-ssd
```

### Database Deployments

#### PostgreSQL Cluster
```yaml
# =====================================================
-- PostgreSQL Deployment with High Availability
-- =====================================================

apiVersion: postgresql.cnpg.io/v1
kind: Cluster
metadata:
  name: postgres-cluster
  namespace: cfv-production
spec:
  instances: 3
  primaryUpdateStrategy: unsupervised

  postgresql:
    parameters:
      max_connections: "200"
      shared_buffers: "256MB"
      effective_cache_size: "1GB"
      maintenance_work_mem: "64MB"
      checkpoint_completion_target: "0.9"
      wal_buffers: "16MB"
      default_statistics_target: "100"
      random_page_cost: "1.1"
      effective_io_concurrency: "200"

  bootstrap:
    initdb:
      database: cfv_production
      owner: cfv_user
      secret:
        name: postgres-credentials

  storage:
    size: 100Gi
    storageClass: gp3-ssd

  monitoring:
    enabled: true

  backup:
    retentionPolicy: "30d"
    barmanObjectStore:
      destinationPath: "s3://cfv-backups/postgres"
      s3Credentials:
        accessKeyId:
          name: backup-credentials
          key: ACCESS_KEY_ID
        secretAccessKey:
          name: backup-credentials
          key: SECRET_ACCESS_KEY

  externalClusters:
    - name: postgres-external
      connectionParameters:
        host: postgres-external.example.com
        user: replication_user
        dbname: postgres
      password:
        name: postgres-external-credentials
        key: password

---
apiVersion: v1
kind: Service
metadata:
  name: postgres-rw
  namespace: cfv-production
spec:
  type: ClusterIP
  ports:
  - port: 5432
  selector:
    cnpg.io/cluster: postgres-cluster
    role: primary
---
apiVersion: v1
kind: Service
metadata:
  name: postgres-ro
  namespace: cfv-production
spec:
  type: ClusterIP
  ports:
  - port: 5432
  selector:
    cnpg.io/cluster: postgres-cluster
    role: replica
```

#### Neo4j Graph Database
```yaml
# =====================================================
-- Neo4j Cluster Deployment
-- =====================================================

apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: neo4j-core
  namespace: cfv-production
spec:
  serviceName: neo4j-core
  replicas: 3
  selector:
    matchLabels:
      app: neo4j
      role: core
  template:
    metadata:
      labels:
        app: neo4j
        role: core
    spec:
      containers:
      - name: neo4j
        image: neo4j:5.12-enterprise
        ports:
        - containerPort: 7474
          name: http
        - containerPort: 7687
          name: bolt
        env:
        - name: NEO4J_AUTH
          valueFrom:
            secretKeyRef:
              name: neo4j-credentials
              key: auth
        - name: NEO4J_ACCEPT_LICENSE_AGREEMENT
          value: "yes"
        - name: NEO4J_causal__clustering_minimum__core__cluster__size__at__formation
          value: "3"
        - name: NEO4J_causal__clustering_minimum__core__cluster__size__at__runtime
          value: "3"
        - name: NEO4J_causal__clustering_initial__discovery__members
          value: "neo4j-core-0.neo4j-core:5000,neo4j-core-1.neo4j-core:5000,neo4j-core-2.neo4j-core:5000"
        - name: NEO4J_causal__clustering_discovery__advertised__address
          value: $(POD_NAME).neo4j-core:5000
        - name: NEO4J_causal__clustering_transaction__advertised__address
          value: $(POD_NAME).neo4j-core:6000
        - name: NEO4J_causal__clustering_raft__advertised__address
          value: $(POD_NAME).neo4j-core:7000
        - name: POD_NAME
          valueFrom:
            fieldRef:
              fieldPath: metadata.name
        - name: NEO4J_dbms_security_procedures_unrestricted
          value: "apoc.*,gds.*"
        - name: NEO4J_dbms_memory_heap_initial__size
          value: "2G"
        - name: NEO4J_dbms_memory_heap_max__size
          value: "4G"
        - name: NEO4J_dbms_memory_pagecache_size
          value: "2G"
        resources:
          requests:
            cpu: 1000m
            memory: 8Gi
          limits:
            cpu: 2000m
            memory: 12Gi
        volumeMounts:
        - name: neo4j-data
          mountPath: /data
        - name: neo4j-logs
          mountPath: /logs
        livenessProbe:
          httpGet:
            path: /
            port: 7474
          initialDelaySeconds: 60
          periodSeconds: 30
        readinessProbe:
          httpGet:
            path: /
            port: 7474
          initialDelaySeconds: 30
          periodSeconds: 10
  volumeClaimTemplates:
  - metadata:
      name: neo4j-data
    spec:
      accessModes: ["ReadWriteOnce"]
      storageClassName: gp3-ssd
      resources:
        requests:
          storage: 200Gi
  - metadata:
      name: neo4j-logs
    spec:
      accessModes: ["ReadWriteOnce"]
      storageClassName: gp3-ssd
      resources:
        requests:
          storage: 50Gi
---
apiVersion: v1
kind: Service
metadata:
  name: neo4j-core
  namespace: cfv-production
spec:
  clusterIP: None
  selector:
    app: neo4j
    role: core
  ports:
  - port: 7474
    name: http
  - port: 7687
    name: bolt
  - port: 5000
    name: discovery
  - port: 6000
    name: transaction
  - port: 7000
    name: raft
```

## GitOps Configuration

### ArgoCD Application
```yaml
# =====================================================
-- ArgoCD Application for GitOps Deployment
-- =====================================================

apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: cfv-production
  namespace: argocd
  finalizers:
  - resources-finalizer.argocd.argoproj.io
spec:
  project: default
  source:
    repoURL: https://github.com/cfv/infrastructure.git
    targetRevision: HEAD
    path: k8s/production
  destination:
    server: https://kubernetes.default.svc
    namespace: cfv-production
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
      allowEmpty: false
    syncOptions:
    - CreateNamespace=true
    - PrunePropagationPolicy=foreground
    - PruneLast=true
    retry:
      limit: 5
      backoff:
        duration: 5s
        factor: 2
        maxDuration: 3m
  revisionHistoryLimit: 3
```

### Kustomize Configuration
```yaml
# =====================================================
-- kustomization.yaml for Environment Management
-- =====================================================

apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

namespace: cfv-production

resources:
- namespace.yaml
- api-gateway/
- ml-service/
- databases/
- frontend/
- monitoring/
- networking/

configMapGenerator:
- name: cfv-config
  literals:
  - ENVIRONMENT=production
  - LOG_LEVEL=info
  - METRICS_ENABLED=true

secretGenerator:
- name: cfv-secrets
  envs:
  - .env.production

patchesStrategicMerge:
- replica-counts.yaml
- resource-limits.yaml
- hpa-config.yaml

commonLabels:
  app.kubernetes.io/name: cfv
  app.kubernetes.io/environment: production
  app.kubernetes.io/managed-by: argocd

images:
- name: cfv/api-gateway
  newTag: v1.2.3
- name: cfv/ml-service
  newTag: v1.2.3
- name: cfv/frontend
  newTag: v1.2.3
```

## Monitoring & Observability

### Prometheus Configuration
```yaml
# =====================================================
-- Prometheus Configuration
-- =====================================================

apiVersion: v1
kind: ConfigMap
metadata:
  name: prometheus-config
  namespace: monitoring
data:
  prometheus.yml: |
    global:
      scrape_interval: 15s
      evaluation_interval: 15s
      external_labels:
        cluster: cfv-production
        region: us-west-2

    rule_files:
    - "/etc/prometheus/rules/*.yml"

    scrape_configs:
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
      - source_labels: [__address__, __meta_kubernetes_pod_annotation_prometheus_io_port]
        action: replace
        regex: ([^:]+)(?::\d+)?;(\d+)
        replacement: $1:$2
        target_label: __address__

    - job_name: 'api-gateway'
      static_configs:
      - targets: ['api-gateway-service:80']
      metrics_path: /metrics
      scrape_interval: 10s

    - job_name: 'ml-service'
      static_configs:
      - targets: ['ml-service:80']
      metrics_path: /metrics
      scrape_interval: 30s

    - job_name: 'postgres-exporter'
      static_configs:
      - targets: ['postgres-exporter:9187']

    - job_name: 'neo4j-exporter'
      static_configs:
      - targets: ['neo4j-exporter:2004']

    - job_name: 'redis-exporter'
      static_configs:
      - targets: ['redis-exporter:9121']

    - job_name: 'kubernetes-nodes'
      kubernetes_sd_configs:
      - role: node
      relabel_configs:
      - action: labelmap
        regex: __meta_kubernetes_node_label_(.+)

    - job_name: 'kubernetes-cadvisor'
      kubernetes_sd_configs:
      - role: node
      relabel_configs:
      - action: labelmap
        regex: __meta_kubernetes_node_label_(.+)
      - target_label: __address__
        replacement: kubernetes.default.svc:443
      - source_labels: [__meta_kubernetes_node_name]
        regex: (.+)
        target_label: __metrics_path__
        replacement: /api/v1/nodes/${1}/proxy/metrics/cadvisor

  alerting.yml: |
    global:
      smtp_smarthost: 'localhost:587'
      smtp_from: 'alerts@cfv.com'

    route:
      group_by: ['alertname', 'cluster', 'service']
      group_wait: 10s
      group_interval: 10s
      repeat_interval: 1h
      receiver: 'default'
      routes:
      - match:
          severity: critical
        receiver: 'critical-alerts'
      - match:
          severity: warning
        receiver: 'warning-alerts'

    receivers:
    - name: 'default'
      email_configs:
      - to: 'team@cfv.com'
        subject: '[CFV Alert] {{ .GroupLabels.alertname }}'
        body: |
          {{ range .Alerts }}
          Alert: {{ .Annotations.summary }}
          Description: {{ .Annotations.description }}
          {{ end }}

    - name: 'critical-alerts'
      email_configs:
      - to: 'oncall@cfv.com'
        subject: '[CRITICAL] CFV Alert: {{ .GroupLabels.alertname }}'
        body: |
          CRITICAL ALERT:
          {{ range .Alerts }}
          Alert: {{ .Annotations.summary }}
          Description: {{ .Annotations.description }}
          Runbook: {{ .Annotations.runbook_url }}
          {{ end }}
      slack_configs:
      - api_url: 'SLACK_WEBHOOK_URL'
        channel: '#alerts'
        title: 'Critical CFV Alert'
        text: '{{ range .Alerts }}{{ .Annotations.summary }}{{ end }}'

    - name: 'warning-alerts'
      slack_configs:
      - api_url: 'SLACK_WEBHOOK_URL'
        channel: '#warnings'
        title: 'CFV Warning'
        text: '{{ range .Alerts }}{{ .Annotations.summary }}{{ end }}'

    inhibit_rules:
    - source_match:
        severity: 'critical'
      target_match:
        severity: 'warning'
      equal: ['alertname', 'cluster', 'service']
```

### Grafana Dashboard Configuration
```json
{
  "dashboard": {
    "id": null,
    "title": "CFV Production Dashboard",
    "tags": ["cfv", "production"],
    "timezone": "browser",
    "panels": [
      {
        "id": 1,
        "title": "API Gateway Request Rate",
        "type": "graph",
        "targets": [
          {
            "expr": "rate(http_requests_total{job=\"api-gateway\"}[5m])",
            "legendFormat": "{{method}} {{endpoint}}"
          }
        ],
        "yAxes": [
          {
            "label": "Requests/sec"
          }
        ]
      },
      {
        "id": 2,
        "title": "API Response Time",
        "type": "graph",
        "targets": [
          {
            "expr": "histogram_quantile(0.95, rate(http_request_duration_seconds_bucket{job=\"api-gateway\"}[5m]))",
            "legendFormat": "95th percentile"
          },
          {
            "expr": "histogram_quantile(0.50, rate(http_request_duration_seconds_bucket{job=\"api-gateway\"}[5m]))",
            "legendFormat": "50th percentile"
          }
        ],
        "yAxes": [
          {
            "label": "Response Time (s)"
          }
        ]
      },
      {
        "id": 3,
        "title": "ML Service Performance",
        "type": "graph",
        "targets": [
          {
            "expr": "rate(ml_inference_requests_total[5m])",
            "legendFormat": "Inference Rate"
          },
          {
            "expr": "ml_inference_duration_seconds",
            "legendFormat": "Inference Duration"
          }
        ]
      },
      {
        "id": 4,
        "title": "Database Connections",
        "type": "graph",
        "targets": [
          {
            "expr": "pg_stat_database_numbackends{job=\"postgres-exporter\"}",
            "legendFormat": "PostgreSQL Connections"
          },
          {
            "expr": "neo4j_database_pool_total_used{job=\"neo4j-exporter\"}",
            "legendFormat": "Neo4j Connections"
          }
        ]
      },
      {
        "id": 5,
        "title": "Resource Usage",
        "type": "graph",
        "targets": [
          {
            "expr": "rate(container_cpu_usage_seconds_total[5m])",
            "legendFormat": "{{pod}}"
          },
          {
            "expr": "container_memory_usage_bytes / 1024 / 1024",
            "legendFormat": "{{pod}}"
          }
        ]
      }
    ],
    "time": {
      "from": "now-1h",
      "to": "now"
    },
    "refresh": "5s"
  }
}
```

## Security Configuration

### Network Policies
```yaml
# =====================================================
-- Network Policies for Security
-- =====================================================

apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: api-gateway-netpol
  namespace: cfv-production
spec:
  podSelector:
    matchLabels:
      app: api-gateway
  policyTypes:
  - Ingress
  - Egress
  ingress:
  - from:
    - namespaceSelector:
        matchLabels:
          name: ingress-nginx
    - namespaceSelector:
        matchLabels:
          name: monitoring
    ports:
    - protocol: TCP
      port: 3000
  egress:
  - to:
    - podSelector:
        matchLabels:
          app: postgres-cluster
    ports:
    - protocol: TCP
      port: 5432
  - to:
    - podSelector:
        matchLabels:
          app: redis
    ports:
    - protocol: TCP
      port: 6379
  - to:
    - podSelector:
        matchLabels:
          app: neo4j
    ports:
    - protocol: TCP
      port: 7687
  - to: []
    ports:
    - protocol: TCP
      port: 53
    - protocol: UDP
      port: 53
    - protocol: TCP
      port: 443
---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: ml-service-netpol
  namespace: cfv-production
spec:
  podSelector:
    matchLabels:
      app: ml-service
  policyTypes:
  - Ingress
  - Egress
  ingress:
  - from:
    - podSelector:
        matchLabels:
          app: api-gateway
    ports:
    - protocol: TCP
      port: 8000
  egress:
  - to:
    - podSelector:
        matchLabels:
          app: postgres-cluster
    ports:
    - protocol: TCP
      port: 5432
  - to:
    - podSelector:
        matchLabels:
          app: redis
    ports:
    - protocol: TCP
      port: 6379
  - to:
    - podSelector:
        matchLabels:
          app: neo4j
    ports:
    - protocol: TCP
      port: 7687
  - to: []
    ports:
    - protocol: TCP
      port: 443
```

This Infrastructure & DevOps architecture provides a comprehensive, production-ready deployment strategy with high availability, automated scaling, comprehensive monitoring, and robust security controls for the Cognitive Fabric Visualizer.