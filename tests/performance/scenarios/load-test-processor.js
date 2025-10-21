/**
 * Artillery load test processor functions
 * Custom logic for dynamic test data generation and response processing
 */

// Generate random cognitive analysis data
function generateCognitiveData() {
  const elements = [];
  const numElements = Math.floor(Math.random() * 50) + 10;

  for (let i = 0; i < numElements; i++) {
    elements.push({
      id: `element-${i}`,
      type: ['concept', 'relationship', 'pattern', 'insight'][Math.floor(Math.random() * 4)],
      content: `Cognitive element ${i}`,
      confidence: Math.random(),
      position: {
        x: Math.random() * 1000,
        y: Math.random() * 1000,
        z: Math.random() * 100
      },
      connections: Array.from({ length: Math.floor(Math.random() * 5) }, (_, j) => `element-${j}`)
    });
  }

  return {
    elements,
    metadata: {
      totalElements: elements.length,
      complexity: Math.random(),
      confidence: Math.random()
    }
  };
}

// Generate conversation transcript data
function generateTranscript() {
  const speakers = ['user', 'assistant', 'system'];
  const messages = [];
  const numMessages = Math.floor(Math.random() * 20) + 5;

  for (let i = 0; i < numMessages; i++) {
    messages.push({
      sequence: i + 1,
      speaker: speakers[Math.floor(Math.random() * speakers.length)],
      content: `Sample message content ${i}: ${Math.random().toString(36).substring(7)}`,
      timestamp: new Date(Date.now() - (numMessages - i) * 60000).toISOString()
    });
  }

  return messages;
}

// Generate visualization data
function generateVisualizationData(conversationId) {
  return {
    conversationId,
    visualizationType: 'cognitive',
    data: {
      nodes: Array.from({ length: 20 }, (_, i) => ({
        id: `node-${i}`,
        label: `Concept ${i}`,
        type: 'concept',
        size: Math.random() * 50 + 10,
        color: `hsl(${Math.random() * 360}, 70%, 50%)`,
        x: Math.random() * 1000,
        y: Math.random() * 1000
      })),
      edges: Array.from({ length: 30 }, (_, i) => ({
        source: `node-${Math.floor(Math.random() * 20)}`,
        target: `node-${Math.floor(Math.random() * 20)}`,
        weight: Math.random(),
        type: 'cognitive'
      }))
    },
    config: {
      layout: 'force',
      includeConnections: true,
      depth: 3
    }
  };
}

// Process authentication responses
function processAuthResponse(requestParams, response, context) {
  if (response.statusCode >= 200 && response.statusCode < 300) {
    try {
      const data = JSON.parse(response.body);
      if (data.token) {
        context.vars.authToken = data.token;
      }
      if (data.user && data.user.id) {
        context.vars.userId = data.user.id;
      }
    } catch (error) {
      console.error('Failed to parse auth response:', error);
    }
  }
}

// Process conversation creation response
function processConversationResponse(requestParams, response, context) {
  if (response.statusCode >= 200 && response.statusCode < 300) {
    try {
      const data = JSON.parse(response.body);
      if (data.id) {
        context.vars.conversationId = data.id;
        context.vars.createdConversationId = data.id;
      }
    } catch (error) {
      console.error('Failed to parse conversation response:', error);
    }
  }
}

// Process analysis response
function processAnalysisResponse(requestParams, response, context) {
  if (response.statusCode >= 200 && response.statusCode < 300) {
    try {
      const data = JSON.parse(response.body);
      if (data.id) {
        context.vars.analysisId = data.id;
      }
      if (data.status === 'completed') {
        context.vars.analysisComplete = true;
      }
    } catch (error) {
      console.error('Failed to parse analysis response:', error);
    }
  }
}

// Custom request logging for performance analysis
function logRequest(requestParams, response, context) {
  const timestamp = new Date().toISOString();
  const duration = response.timings ? response.timings.total : 0;

  console.log(`[${timestamp}] ${requestParams.method} ${requestParams.url} - ${response.statusCode} - ${duration}ms`);

  // Log slow requests
  if (duration > 1000) {
    console.warn(`[SLOW REQUEST] ${requestParams.method} ${requestParams.url} took ${duration}ms`);
  }

  // Log errors
  if (response.statusCode >= 400) {
    console.error(`[ERROR] ${requestParams.method} ${requestParams.url} returned ${response.statusCode}`);
  }
}

// Generate realistic load patterns
function generateLoadPattern(context) {
  const timeOfDay = new Date().getHours();
  let loadMultiplier = 1;

  // Simulate realistic usage patterns
  if (timeOfDay >= 9 && timeOfDay <= 17) {
    loadMultiplier = 2; // Business hours
  } else if (timeOfDay >= 18 && timeOfDay <= 22) {
    loadMultiplier = 1.5; // Evening usage
  } else {
    loadMultiplier = 0.5; // Night time
  }

  // Add some randomness
  loadMultiplier *= (0.8 + Math.random() * 0.4);

  context.vars.loadMultiplier = loadMultiplier;
}

// Database simulation functions
function simulateDatabaseLoad() {
  const operations = ['read', 'write', 'update', 'delete'];
  return {
    operation: operations[Math.floor(Math.random() * operations.length)],
    complexity: Math.random(),
    duration: Math.random() * 100
  };
}

// WebSocket connection simulation
function simulateWebSocketConnection(context) {
  return {
    connectionType: 'cognitive-visualization',
    messageRate: Math.floor(Math.random() * 10) + 1,
    duration: Math.floor(Math.random() * 300) + 60
  };
}

// Export the processor functions
module.exports = {
  generateCognitiveData,
  generateTranscript,
  generateVisualizationData,
  processAuthResponse,
  processConversationResponse,
  processAnalysisResponse,
  logRequest,
  generateLoadPattern,
  simulateDatabaseLoad,
  simulateWebSocketConnection
};