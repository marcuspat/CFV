#!/usr/bin/env node

/**
 * Demo System Setup Script
 *
 * Sets up the demo environment, creates directories, and verifies dependencies.
 */

import { mkdir, writeFile, access } from 'fs/promises';
import { join } from 'path';
import { execSync } from 'child_process';

const DEMO_DIRECTORIES = [
  'scripts/logs',
  'scripts/reports',
  'scripts/exports',
  'scripts/exports/conversations',
  'scripts/exports/visualizations',
  'scripts/exports/metrics',
  'scripts/benchmarks'
];

async function setupDemoEnvironment() {
  console.log('🔧 Setting up Cognitive Fabric Visualizer Demo Environment...\n');

  // Create directories
  console.log('📁 Creating demo directories...');
  for (const dir of DEMO_DIRECTORIES) {
    try {
      await mkdir(dir, { recursive: true });
      console.log(`  ✅ Created: ${dir}`);
    } catch (error) {
      console.log(`  ❌ Failed to create ${dir}: ${error.message}`);
    }
  }

  // Verify Node.js version
  console.log('\n🔍 Verifying Node.js version...');
  const nodeVersion = process.version;
  const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);

  if (majorVersion >= 18) {
    console.log(`  ✅ Node.js ${nodeVersion} (compatible)`);
  } else {
    console.log(`  ❌ Node.js ${nodeVersion} (requires 18+)`);
    process.exit(1);
  }

  // Check if dependencies are available
  console.log('\n📦 Checking dependencies...');
  const requiredDeps = ['axios', 'uuid', 'commander'];

  for (const dep of requiredDeps) {
    try {
      require.resolve(dep);
      console.log(`  ✅ ${dep} available`);
    } catch (error) {
      console.log(`  ❌ ${dep} missing - run: npm install`);
    }
  }

  // Create a demo configuration validation script
  console.log('\n⚙️  Creating validation script...');
  const validationScript = `#!/usr/bin/env node

/**
 * Quick Demo Validation Script
 */

import { checkSystemHealth } from './demo/health-check.js';
import { generateConversation } from './data/sample-generator.js';
import { DEMO_CONFIG } from './config/demo-config.js';

async function quickValidation() {
  console.log('🚀 Quick Demo Validation\\n');

  try {
    // Test 1: Health check
    console.log('1️⃣ Testing system health...');
    const health = await checkSystemHealth();
    if (health.status !== 'healthy') {
      console.log('❌ System health check failed');
      process.exit(1);
    }

    // Test 2: Sample data generation
    console.log('\\n2️⃣ Testing sample data generation...');
    const conversation = await generateConversation({
      length: 5,
      complexity: 'medium',
      primaryDimension: 'factual'
    });

    if (!conversation.id || !conversation.messages || conversation.messages.length !== 5) {
      console.log('❌ Sample data generation failed');
      process.exit(1);
    }

    // Test 3: Configuration validation
    console.log('\\n3️⃣ Testing configuration...');
    if (!DEMO_CONFIG.performanceThresholds || !DEMO_CONFIG.cognitiveTargets) {
      console.log('❌ Configuration validation failed');
      process.exit(1);
    }

    console.log('\\n✅ All validation checks passed!');
    console.log('🎉 Demo system is ready to use!');
    console.log('\\nRun demo with: npm run demo');

  } catch (error) {
    console.error(\`❌ Validation failed: \${error.message}\`);
    process.exit(1);
  }
}

quickValidation();
`;

  try {
    await writeFile('scripts/validate-demo.js', validationScript);
    console.log('  ✅ Created: scripts/validate-demo.js');
  } catch (error) {
    console.log(`  ❌ Failed to create validation script: ${error.message}`);
  }

  // Create demo run scripts
  console.log('\n🏃 Creating demo run scripts...');

  const scripts = {
    'demo-quick.js': `#!/usr/bin/env node
import { CognitiveFabricDemo } from './demo.js';
const demo = new CognitiveFabricDemo({
  conversations: 1,
  verbose: true,
  output: './scripts/reports'
});
demo.run().catch(console.error);`,

    'demo-medium.js': `#!/usr/bin/env node
import { CognitiveFabricDemo } from './demo.js';
const demo = new CognitiveFabricDemo({
  conversations: 3,
  verbose: true,
  output: './scripts/reports'
});
demo.run().catch(console.error);`,

    'demo-full.js': `#!/usr/bin/env node
import { CognitiveFabricDemo } from './demo.js';
const demo = new CognitiveFabricDemo({
  conversations: 5,
  verbose: true,
  output: './scripts/reports'
});
demo.run().catch(console.error);`
  };

  for (const [filename, content] of Object.entries(scripts)) {
    try {
      await writeFile(`scripts/${filename}`, content);
      console.log(`  ✅ Created: scripts/${filename}`);
    } catch (error) {
      console.log(`  ❌ Failed to create ${filename}: ${error.message}`);
    }
  }

  // Create a simple test script
  console.log('\n🧪 Creating test script...');
  const testScript = `#!/usr/bin/env node

/**
 * Demo System Test
 */

import { access } from 'fs/promises';
import { join } from 'path';

async function runTests() {
  console.log('🧪 Running Demo System Tests\\n');

  const tests = [
    {
      name: 'Config file exists',
      test: () => access('scripts/config/demo-config.js')
    },
    {
      name: 'Health check module exists',
      test: () => access('scripts/demo/health-check.js')
    },
    {
      name: 'Sample generator exists',
      test: () => access('scripts/data/sample-generator.js')
    },
    {
      name: 'Metrics collector exists',
      test: () => access('scripts/metrics/metrics-collector.js')
    },
    {
      name: 'Validator exists',
      test: () => access('scripts/validation/demo-validator.js')
    },
    {
      name: 'Logger exists',
      test: () => access('scripts/utils/demo-logger.js')
    }
  ];

  let passed = 0;
  let total = tests.length;

  for (const test of tests) {
    try {
      await test.test();
      console.log(\`  ✅ \${test.name}\`);
      passed++;
    } catch (error) {
      console.log(\`  ❌ \${test.name}: \${error.message}\`);
    }
  }

  console.log(\`\\n📊 Test Results: \${passed}/\${total} passed\`);

  if (passed === total) {
    console.log('🎉 All tests passed!');
  } else {
    console.log('⚠️  Some tests failed - check the setup');
  }
}

runTests();
`;

  try {
    await writeFile('scripts/test-demo.js', testScript);
    console.log('  ✅ Created: scripts/test-demo.js');
  } catch (error) {
    console.log(`  ❌ Failed to create test script: ${error.message}`);
  }

  // Create .gitignore for demo outputs
  console.log('\n📝 Creating .gitignore...');
  const gitignoreContent = `# Demo outputs
*.log
demo-report-*.json
demo-summary-*.md
exports/
reports/
logs/
benchmarks/

# Node modules
node_modules/

# Environment files
.env
.env.local
.env.*.local
`;

  try {
    await writeFile('scripts/.gitignore', gitignoreContent);
    console.log('  ✅ Created: scripts/.gitignore');
  } catch (error) {
    console.log(`  ❌ Failed to create .gitignore: ${error.message}`);
  }

  console.log('\n🎉 Demo environment setup complete!');
  console.log('\n📋 Next steps:');
  console.log('1. Install dependencies: npm install');
  console.log('2. Test setup: npm run test');
  console.log('3. Validate system: node scripts/validate-demo.js');
  console.log('4. Run demo: npm run demo');
  console.log('\n💡 For more options, see: scripts/README.md');
}

// Run setup
setupDemoEnvironment().catch(error => {
  console.error('Setup failed:', error.message);
  process.exit(1);
});