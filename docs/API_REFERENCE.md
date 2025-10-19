# API Reference - Cognitive Fabric Visualizer

## Overview

The Cognitive Fabric Visualizer provides a comprehensive RESTful API for cognitive analysis, visualization data, and system management. All API endpoints use JSON format and support standard HTTP methods.

## Base URL

```
Development: http://localhost:3001/api/v1
Production: https://your-domain.com/api/v1
```

## Authentication

### JWT Authentication

All API endpoints (except health checks) require JWT authentication:

```bash
# Login to get token
POST /auth/login
{
  "email": "user@example.com",
  "password": "password"
}

# Response
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "user_123",
    "email": "user@example.com"
  },
  "expiresIn": "7d"
}

# Use token in requests
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## Core Endpoints

### Analysis Endpoints

#### Analyze Conversation

```bash
POST /analyze
Content-Type: application/json
Authorization: Bearer {token}

{
  "text": "Conversation text here...",
  "options": {
    "include_visualization": true,
    "confidence_threshold": 0.8,
    "enable_realtime": false,
    "analysis_depth": "comprehensive"
  }
}
```

**Response:**
```json
{
  "analysis_id": "analysis_123",
  "status": "completed",
  "processing_time": 4.2,
  "results": {
    "cognitive_dimensions": {
      "factual_retrieval": {
        "elements": [...],
        "confidence": 0.94,
        "accuracy": 0.92
      },
      "logical_inference": {
        "elements": [...],
        "confidence": 0.87,
        "precision": 0.85
      },
      "creative_synthesis": {
        "elements": [...],
        "confidence": 0.78,
        "rouge_l": 0.62
      },
      "meta_cognition": {
        "elements": [...],
        "confidence": 0.96,
        "f1_score": 0.96
      }
    },
    "visualization": {
      "nodes": [...],
      "edges": [...],
      "layout": "force_directed"
    },
    "metrics": {
      "overall_confidence": 0.89,
      "cognitive_diversity": 0.73,
      "reasoning_complexity": 0.81
    }
  }
}
```

#### Get Analysis Results

```bash
GET /analyze/{analysis_id}
Authorization: Bearer {token}
```

#### Batch Analysis

```bash
POST /analyze/batch
Content-Type: application/json
Authorization: Bearer {token}

{
  "conversations": [
    {"id": "conv_1", "text": "First conversation..."},
    {"id": "conv_2", "text": "Second conversation..."}
  ],
  "options": {
    "parallel_processing": true,
    "confidence_threshold": 0.8
  }
}
```

### Visualization Endpoints

#### Get Visualization Data

```bash
GET /visualize/{analysis_id}
Authorization: Bearer {token}

# Query Parameters
# - format: json|graphml|cytoscape
# - include_metadata: true|false
# - confidence_filter: 0.0-1.0
```

**Response:**
```json
{
  "analysis_id": "analysis_123",
  "visualization": {
    "nodes": [
      {
        "id": "node_1",
        "type": "factual_retrieval",
        "label": "Market research shows...",
        "confidence": 0.94,
        "position": {"x": 100, "y": 200, "z": 50},
        "metadata": {
          "timestamp": "2024-01-15T10:30:00Z",
          "speaker": "Alice",
          "duration": 3.2
        }
      }
    ],
    "edges": [
      {
        "id": "edge_1",
        "source": "node_1",
        "target": "node_2",
        "type": "supports",
        "weight": 0.87,
        "relationship": "logical_support"
      }
    ],
    "layout": {
      "algorithm": "force_directed",
      "iterations": 1000,
      "physics": {
        "repulsion": 1000,
        "attraction": 0.01,
        "gravity": 0.1
      }
    }
  }
}
```

#### Export Visualization

```bash
POST /visualize/{analysis_id}/export
Authorization: Bearer {token}

{
  "format": "png|svg|html|json",
  "options": {
    "width": 1920,
    "height": 1080,
    "include_labels": true,
    "color_scheme": "cognitive_dimensions",
    "layout": "circular"
  }
}
```

**Response:**
```json
{
  "export_id": "export_123",
  "download_url": "/exports/export_123",
  "format": "png",
  "size": "2.4MB",
  "expires_at": "2024-01-22T10:30:00Z"
}
```

### Conversation Management

#### Create Conversation

```bash
POST /conversations
Authorization: Bearer {token}

{
  "title": "Product Strategy Meeting",
  "description": "Discussion about Q2 product roadmap",
  "participants": ["alice@company.com", "bob@company.com"],
  "metadata": {
    "date": "2024-01-15",
    "duration": 3600,
    "type": "strategy_meeting"
  }
}
```

#### Upload Conversation File

```bash
POST /conversations/{conversation_id}/upload
Content-Type: multipart/form-data
Authorization: Bearer {token}

# Form data:
# - file: (audio, video, or transcript file)
# - format: auto|transcript|audio|video
# - language: en|es|fr|de|...
```

#### List Conversations

```bash
GET /conversations
Authorization: Bearer {token}

# Query Parameters:
# - limit: 1-100 (default: 20)
# - offset: pagination offset (default: 0)
# - sort: date|title|duration (default: date)
# - order: asc|desc (default: desc)
# - filter: filter string
```

### Real-time Endpoints

#### Start Real-time Analysis

```bash
POST /realtime/analyze
Authorization: Bearer {token}

{
  "websocket_url": "wss://your-domain.com/realtime/analysis_123",
  "options": {
    "analysis_interval": 5000,  // ms
    "confidence_threshold": 0.7,
    "enable_predictions": true
  }
}
```

#### WebSocket Connection

```javascript
// Connect to real-time analysis
const ws = new WebSocket('wss://localhost:3001/realtime/analysis_123');

// Send conversation data
ws.send(JSON.stringify({
  type: 'utterance',
  data: {
    speaker: 'Alice',
    text: 'I think we should consider the market trends...',
    timestamp: Date.now()
  }
}));

// Receive analysis updates
ws.onmessage = (event) => {
  const analysis = JSON.parse(event.data);
  console.log('Cognitive update:', analysis);
  /*
  {
    "type": "cognitive_update",
    "data": {
      "utterance_id": "utt_123",
      "cognitive_classification": {
        "primary": "logical_inference",
        "confidence": 0.87,
        "secondary": "factual_retrieval"
      },
      "visualization_update": {
        "nodes": [...],
        "edges": [...]
      }
    }
  }
  */
};
```

## System Endpoints

### Health Check

```bash
GET /health
```

**Response:**
```json
{
  "status": "healthy",
  "version": "1.2.0",
  "uptime": 86400,
  "timestamp": "2024-01-15T10:30:00Z",
  "components": {
    "database": {
      "postgres": "healthy",
      "neo4j": "healthy",
      "redis": "healthy"
    },
    "ml_services": {
      "cognitive_decomposer": "healthy",
      "confidence_scorer": "healthy",
      "visualization_engine": "healthy"
    },
    "external_apis": {
      "openai": "healthy",
      "anthropic": "healthy"
    }
  },
  "performance": {
    "average_response_time": 85,
    "requests_per_minute": 45,
    "error_rate": 0.02,
    "memory_usage": "68%"
  }
}
```

### System Metrics

```bash
GET /metrics
Authorization: Bearer {token}
```

**Response:**
```json
{
  "system_metrics": {
    "processing_performance": {
      "average_analysis_time": 4.2,
      "accuracy_metrics": {
        "factual_retrieval": 0.92,
        "logical_inference": 0.85,
        "creative_synthesis": 0.61,
        "meta_cognition": 0.96
      }
    },
    "usage_statistics": {
      "total_analyses": 1247,
      "active_users": 89,
      "conversations_processed": 3421,
      "average_confidence": 0.87
    },
    "resource_utilization": {
      "cpu_usage": 45.2,
      "memory_usage": 68.7,
      "disk_usage": 34.1,
      "network_throughput": 12.4
    }
  }
}
```

## Error Handling

### Error Response Format

```json
{
  "error": {
    "code": "INVALID_INPUT",
    "message": "Conversation text is required",
    "details": {
      "field": "text",
      "constraint": "must be non-empty string"
    },
    "timestamp": "2024-01-15T10:30:00Z",
    "request_id": "req_123"
  }
}
```

### Common Error Codes

| Code | HTTP Status | Description |
|------|------------|-------------|
| `UNAUTHORIZED` | 401 | Invalid or missing authentication token |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `INVALID_INPUT` | 400 | Request validation failed |
| `RATE_LIMITED` | 429 | Too many requests |
| `PROCESSING_ERROR` | 500 | ML service error |
| `DATABASE_ERROR` | 500 | Database connection error |
| `EXTERNAL_API_ERROR` | 502 | External API (OpenAI/Anthropic) error |

## Rate Limiting

### Rate Limits

| Endpoint | Limit | Window |
|----------|-------|--------|
| `/analyze` | 100 requests | 1 hour |
| `/visualize/*` | 200 requests | 1 hour |
| `/realtime/*` | 50 connections | 15 minutes |
| `/metrics` | 1000 requests | 1 hour |

### Rate Limit Headers

```bash
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 87
X-RateLimit-Reset: 1642248600
```

## SDK Examples

### JavaScript/Node.js

```javascript
const CFV = require('@cfv/sdk');

// Initialize client
const client = new CFV.Client({
  baseURL: 'http://localhost:3001/api/v1',
  apiKey: 'your-api-key'
});

// Analyze conversation
async function analyzeConversation(text) {
  try {
    const result = await client.analyze(text, {
      includeVisualization: true,
      confidenceThreshold: 0.8
    });

    console.log('Analysis completed:', result.analysis_id);
    return result;
  } catch (error) {
    console.error('Analysis failed:', error);
  }
}

// Get visualization
async function getVisualization(analysisId) {
  const viz = await client.getVisualization(analysisId, {
    format: 'json',
    confidenceFilter: 0.7
  });

  return viz;
}
```

### Python

```python
import cfv_sdk

# Initialize client
client = cfv_sdk.Client(
    base_url='http://localhost:3001/api/v1',
    api_key='your-api-key'
)

# Analyze conversation
def analyze_conversation(text):
    try:
        result = client.analyze(text, options={
            'include_visualization': True,
            'confidence_threshold': 0.8
        })

        print(f"Analysis completed: {result.analysis_id}")
        return result
    except Exception as error:
        print(f"Analysis failed: {error}")

# Real-time analysis
def start_realtime_analysis():
    ws = client.realtime_connect()

    def on_analysis_update(data):
        print(f"Cognitive update: {data}")

    ws.on('analysis_update', on_analysis_update)
    ws.start()
```

## Integration Examples

### Webhook Integration

```bash
# Configure webhook for analysis completion
POST /webhooks
Authorization: Bearer {token}

{
  "url": "https://your-app.com/webhooks/cfv-analysis",
  "events": ["analysis_completed", "analysis_failed"],
  "secret": "your-webhook-secret"
}
```

**Webhook Payload:**
```json
{
  "event": "analysis_completed",
  "analysis_id": "analysis_123",
  "timestamp": "2024-01-15T10:30:00Z",
  "data": {
    "confidence_score": 0.89,
    "processing_time": 4.2,
    "cognitive_breakdown": {...}
  },
  "signature": "sha256=abc123..."
}
```

### Third-Party Integration

```bash
# Export to external tools
POST /export/{analysis_id}/third-party
Authorization: Bearer {token}

{
  "platform": "notion|slack|jira|confluence",
  "format": "structured_report",
  "options": {
    "include_visualization": true,
    "generate_summary": true,
    "custom_fields": {
      "project_id": "proj_123",
      "team": "product"
    }
  }
}
```

## SDK and Libraries

- **JavaScript**: `npm install @cfv/sdk`
- **Python**: `pip install cfv-sdk`
- **Java**: Maven dependency available
- **C#**: NuGet package available

For detailed implementation examples and advanced usage patterns, see the [SDK Documentation](https://docs.cfv.dev/sdk).