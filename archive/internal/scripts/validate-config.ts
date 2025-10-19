#!/usr/bin/env tsx

import { configValidator } from '../src/config/validation';
import { writeFileSync } from 'fs';
import { join } from 'path';

async function main() {
  console.log('🚀 Cognitive Fabric Visualizer - Configuration Validator');
  console.log('=' .repeat(60));
  console.log();

  try {
    // Run comprehensive validation
    const results = await configValidator.validateAll();

    // Generate report
    const report = configValidator.generateReport();

    // Save report to file
    const reportPath = join(process.cwd(), 'config-validation-report.md');
    writeFileSync(reportPath, report);

    console.log();
    console.log('📄 Validation report saved to:', reportPath);
    console.log();

    if (results.valid) {
      console.log('🎉 All configuration validations passed!');
      process.exit(0);
    } else {
      console.log('❌ Configuration validation failed. Please address the errors above.');
      process.exit(1);
    }

  } catch (error) {
    console.error('💥 Unexpected error during validation:', error);
    process.exit(1);
  }
}

// Run validation if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { main as validateConfig };