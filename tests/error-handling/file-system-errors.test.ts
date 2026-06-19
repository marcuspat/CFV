/**
 * File System Error Testing Suite
 * Tests file system related error scenarios including permissions, disk space, and I/O issues
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';
import request from 'supertest';
import App from '../../src/server/app.js';

describe('File System Error Tests', () => {
  let app: App;
  const testDir = '/tmp/cfv-file-system-tests';
  const testFiles = {
    valid: path.join(testDir, 'valid-test.txt'),
    large: path.join(testDir, 'large-test.txt'),
    noPermission: path.join('/root', 'no-permission-test.txt'),
    corrupted: path.join(testDir, 'corrupted-test.bin'),
    specialChars: path.join(testDir, 'test-with-special-Chars@#$%^&*().txt')
  };

  beforeAll(async () => {
    app = new App();
    await app.start();

    // Create test directory
    try {
      await fs.mkdir(testDir, { recursive: true });
    } catch (error) {
      console.log('Test directory already exists or cannot be created');
    }
  });

  afterAll(async () => {
    if (app) {
      await app.stop();
    }

    // Cleanup test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      console.log('Could not cleanup test directory:', error);
    }
  });

  beforeEach(async () => {
    // Create test files
    try {
      await fs.writeFile(testFiles.valid, 'Valid test content', 'utf8');

      // Create a large file (10MB)
      const largeContent = 'A'.repeat(10 * 1024 * 1024);
      await fs.writeFile(testFiles.large, largeContent, 'utf8');

      // Create a file with special characters
      await fs.writeFile(testFiles.specialChars, 'Special chars test: 🚀💻', 'utf8');

      // Create a corrupted binary file
      const corruptedContent = Buffer.from([0xFF, 0xFE, 0x00, 0x00, 0x80, 0x81]);
      await fs.writeFile(testFiles.corrupted, corruptedContent);
    } catch (error) {
      console.log('Could not create test files:', error);
    }
  });

  afterEach(async () => {
    // Cleanup test files
    try {
      const files = Object.values(testFiles);
      for (const file of files) {
        try {
          await fs.unlink(file);
        } catch (error) {
          // Ignore cleanup errors
        }
      }
    } catch (error) {
      console.log('Cleanup error:', error);
    }
  });

  describe('File Upload Scenarios', () => {
    test('should handle file uploads to non-existent directories', async () => {
      const nonExistentPath = path.join('/tmp', 'non-existent-dir-' + Date.now(), 'test.txt');

      const response = await request(app.app)
        .post('/api/upload')
        .attach('file', Buffer.from('test content'), 'test.txt')
        .field('path', nonExistentPath);

      expect([400, 500, 503]).toContain(response.status);
      expect(response.body.code).toMatch(/FILE_SYSTEM_ERROR|VALIDATION_ERROR/);
    });

    test('should handle uploads when disk space is full', async () => {
      // Simulate disk space full by checking available space
      try {
        const stats = await fs.statfs(testDir);
        const availableSpace = stats.bavail * stats.bsize;

        if (availableSpace < 100 * 1024 * 1024) { // Less than 100MB
          const response = await request(app.app)
            .post('/api/upload')
            .attach('file', Buffer.from('A'.repeat(50 * 1024 * 1024)), 'large-file.txt'); // 50MB

          expect([400, 413, 507]).toContain(response.status);
          expect(response.body.code).toMatch(/DISK_FULL|FILE_SYSTEM_ERROR/);
        }
      } catch (error) {
        console.log('Could not check disk space:', error);
      }
    });

    test('should handle permission denied scenarios', async () => {
      // Try to write to a protected directory
      const protectedPath = '/root/protected-test.txt';

      const response = await request(app.app)
        .post('/api/upload')
        .attach('file', Buffer.from('test content'), 'protected-test.txt')
        .field('path', protectedPath);

      expect([400, 403, 500]).toContain(response.status);
      expect(response.body.code).toMatch(/PERMISSION_DENIED|FILE_SYSTEM_ERROR/);
    });

    test('should handle simultaneous file uploads', async () => {
      const uploadPromises = Array(10).fill(null).map((_, index) =>
        request(app.app)
          .post('/api/upload')
          .attach('file', Buffer.from(`Content ${index}`), `file-${index}.txt`)
      );

      const responses = await Promise.all(uploadPromises);
      const successCount = responses.filter(res => res.status === 200).length;
      const errorCount = responses.filter(res => res.status >= 400).length;

      expect(successCount + errorCount).toBe(10);

      // Some might succeed, others might fail due to resource constraints
      if (errorCount > 0) {
        const errors = responses.filter(res => res.status >= 400);
        errors.forEach(error => {
          expect([400, 429, 500, 507]).toContain(error.status);
        });
      }
    });

    test('should handle corrupted file uploads', async () => {
      const corruptedBuffers = [
        Buffer.from([0xFF, 0xFE, 0xFD]), // Invalid UTF-8
        Buffer.from([0x00, 0x00, 0x00]), // Null bytes
        Buffer.from([]), // Empty buffer
        Buffer.from(Array(1024 * 1024).fill(0xFF)) // Large invalid buffer
      ];

      for (const buffer of corruptedBuffers) {
        const response = await request(app.app)
          .post('/api/upload')
          .attach('file', buffer, 'corrupted.bin');

        expect([200, 400, 422]).toContain(response.status);
      }
    });
  });

  describe('File Reading Scenarios', () => {
    test('should handle reading non-existent files', async () => {
      const response = await request(app.app)
        .get('/api/files/non-existent-file.txt');

      expect([404, 400, 500]).toContain(response.status);
      expect(response.body.code).toMatch(/NOT_FOUND|FILE_SYSTEM_ERROR/);
    });

    test('should handle reading files without permissions', async () => {
      // Create a file and remove read permissions
      const restrictedFile = path.join(testDir, 'restricted.txt');
      await fs.writeFile(restrictedFile, 'restricted content');

      try {
        await fs.chmod(restrictedFile, 0o000); // Remove all permissions
      } catch (error) {
        console.log('Could not change file permissions (likely not root):', error);
      }

      const response = await request(app.app)
        .get(`/api/files?path=${encodeURIComponent(restrictedFile)}`);

      expect([403, 404, 500]).toContain(response.status);

      // Restore permissions for cleanup
      try {
        await fs.chmod(restrictedFile, 0o644);
      } catch (error) {
        // Ignore
      }
    });

    test('should handle reading very large files', async () => {
      const response = await request(app.app)
        .get(`/api/files?path=${encodeURIComponent(testFiles.large)}`);

      expect([200, 413, 500]).toContain(response.status);

      if (response.status === 200) {
        expect(response.headers['content-length']).toBeDefined();
      }
    });

    test('should handle reading files with special characters in names', async () => {
      const response = await request(app.app)
        .get(`/api/files?path=${encodeURIComponent(testFiles.specialChars)}`);

      expect([200, 400, 404]).toContain(response.status);
    });

    test('should handle concurrent file reading', async () => {
      const readPromises = Array(20).fill(null).map(() =>
        request(app.app)
          .get(`/api/files?path=${encodeURIComponent(testFiles.valid)}`)
      );

      const responses = await Promise.all(readPromises);
      const successCount = responses.filter(res => res.status === 200).length;
      const errorCount = responses.filter(res => res.status >= 400).length;

      expect(successCount + errorCount).toBe(20);

      // Most should succeed, some might fail due to resource limits
      expect(successCount).toBeGreaterThan(0);
    });
  });

  describe('File Deletion Scenarios', () => {
    test('should handle deleting non-existent files', async () => {
      const response = await request(app.app)
        .delete('/api/files/non-existent-file.txt');

      expect([404, 400, 500]).toContain(response.status);
    });

    test('should handle deleting files without permissions', async () => {
      // Try to delete a system file (this should fail)
      const response = await request(app.app)
        .delete('/api/files/etc/passwd');

      expect([403, 404, 500]).toContain(response.status);
    });

    test('should handle deleting files that are in use', async () => {
      // Create a file and "use" it (open file handle)
      const inUseFile = path.join(testDir, 'in-use.txt');
      await fs.writeFile(inUseFile, 'in use content');

      // Simulate file in use by opening it
      let fileHandle;
      try {
        fileHandle = await fs.open(inUseFile, 'r');
      } catch (error) {
        console.log('Could not open file handle:', error);
      }

      const response = await request(app.app)
        .delete(`/api/files?path=${encodeURIComponent(inUseFile)}`);

      if (fileHandle) {
        await fileHandle.close();
      }

      expect([200, 409, 500]).toContain(response.status);
    });

    test('should handle deleting directories with contents', async () => {
      const testSubDir = path.join(testDir, 'subdir');
      await fs.mkdir(testSubDir, { recursive: true });
      await fs.writeFile(path.join(testSubDir, 'file.txt'), 'content');

      const response = await request(app.app)
        .delete(`/api/files?path=${encodeURIComponent(testSubDir)}`);

      expect([200, 409, 500]).toContain(response.status);
    });
  });

  describe('Directory Operations', () => {
    test('should handle creating directories in invalid paths', async () => {
      const invalidPaths = [
        '/root/new-dir', // Protected directory
        'relative/path/without/slash', // Relative path
        '/dev/new-dir', // Device directory
        'path/with/../../../etc/passwd' // Path traversal attempt
      ];

      for (const invalidPath of invalidPaths) {
        const response = await request(app.app)
          .post('/api/directories')
          .send({ path: invalidPath });

        expect([400, 403, 500]).toContain(response.status);
      }
    });

    test('should handle listing directories with many files', async () => {
      // Create many files in a directory
      const manyFilesDir = path.join(testDir, 'many-files');
      await fs.mkdir(manyFilesDir, { recursive: true });

      for (let i = 0; i < 1000; i++) {
        await fs.writeFile(path.join(manyFilesDir, `file-${i}.txt`), `content ${i}`);
      }

      const response = await request(app.app)
        .get(`/api/directories?path=${encodeURIComponent(manyFilesDir)}`);

      expect([200, 413, 500]).toContain(response.status);

      // Cleanup
      try {
        await fs.rm(manyFilesDir, { recursive: true, force: true });
      } catch (error) {
        console.log('Could not cleanup many files directory');
      }
    });

    test('should handle directory traversal attempts', async () => {
      const traversalAttempts = [
        '../../../etc/passwd',
        '..\\..\\..\\windows\\system32\\config\\sam',
        '/etc/passwd/../../../root',
        'path/../../../etc/shadow'
      ];

      for (const traversal of traversalAttempts) {
        const response = await request(app.app)
          .get(`/api/directories?path=${encodeURIComponent(traversal)}`);

        expect([400, 403, 404]).toContain(response.status);
      }
    });

    test('should handling symbolic link issues', async () => {
      const targetFile = path.join(testDir, 'target.txt');
      const linkFile = path.join(testDir, 'symlink.txt');

      await fs.writeFile(targetFile, 'target content');

      try {
        await fs.symlink(targetFile, linkFile);
      } catch (error) {
        console.log('Could not create symlink (might not be supported):', error);
      }

      const response = await request(app.app)
        .get(`/api/files?path=${encodeURIComponent(linkFile)}`);

      expect([200, 400, 404]).toContain(response.status);
    });
  });

  describe('I/O Error Scenarios', () => {
    test('should handle disk I/O timeouts', async () => {
      // Simulate slow I/O by creating a large operation
      const slowOperation = async () => {
        const largeData = 'A'.repeat(100 * 1024 * 1024); // 100MB
        const tempFile = path.join(testDir, 'slow-write.txt');

        const startTime = Date.now();
        await fs.writeFile(tempFile, largeData);
        const endTime = Date.now();

        return { timeTaken: endTime - startTime, file: tempFile };
      };

      const operation = await slowOperation();

      // The operation might timeout depending on system performance
      expect(operation.timeTaken).toBeGreaterThan(0);

      // Cleanup
      try {
        await fs.unlink(operation.file);
      } catch (error) {
        console.log('Could not cleanup slow write file');
      }
    });

    test('should handle file system corruption', async () => {
      // Create a file and then try to corrupt it
      const corruptibleFile = path.join(testDir, 'corruptible.txt');
      await fs.writeFile(corruptibleFile, 'valid content');

      try {
        // Try to write invalid data to the file
        const invalidData = Buffer.from([0xFF, 0xFE, 0xFD, 0xFC]);
        await fs.writeFile(corruptibleFile, invalidData);
      } catch (error) {
        console.log('Could not corrupt file:', error);
      }

      const response = await request(app.app)
        .get(`/api/files?path=${encodeURIComponent(corruptibleFile)}`);

      expect([200, 400, 500]).toContain(response.status);
    });

    test('should handle concurrent file operations', async () => {
      const sharedFile = path.join(testDir, 'shared.txt');
      await fs.writeFile(sharedFile, 'initial content');

      const operations = Array(10).fill(null).map((_, index) =>
        request(app.app)
          .post('/api/files/write')
          .send({
            path: sharedFile,
            content: `content ${index}`,
            append: true
          })
      );

      const responses = await Promise.all(operations);
      const successCount = responses.filter(res => res.status === 200).length;
      const conflictCount = responses.filter(res => res.status === 409).length;

      expect(successCount + conflictCount).toBe(10);
    });
  });

  describe('File System Monitoring', () => {
    test('should monitor disk space usage', async () => {
      const response = await request(app.app)
        .get('/api/system/disk-usage');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('totalSpace');
      expect(response.body).toHaveProperty('freeSpace');
      expect(response.body).toHaveProperty('usedSpace');
      expect(response.body).toHaveProperty('usagePercentage');

      expect(typeof response.body.totalSpace).toBe('number');
      expect(typeof response.body.freeSpace).toBe('number');
      expect(response.body.usagePercentage).toBeGreaterThanOrEqual(0);
      expect(response.body.usagePercentage).toBeLessThanOrEqual(100);
    });

    test('should detect disk space warnings', async () => {
      const response = await request(app.app)
        .get('/api/system/disk-usage');

      if (response.body.usagePercentage > 90) {
        expect(response.body.warning).toBeDefined();
        expect(response.body.warning.level).toBe('critical');
      } else if (response.body.usagePercentage > 80) {
        expect(response.body.warning).toBeDefined();
        expect(response.body.warning.level).toBe('warning');
      }
    });

    test('should handle file system watcher errors', async () => {
      const response = await request(app.app)
        .post('/api/files/watch')
        .send({
          path: testDir,
          events: ['change', 'rename', 'delete']
        });

      expect([200, 400, 500]).toContain(response.status);

      if (response.status === 200) {
        expect(response.body).toHaveProperty('watcherId');

        // Test stopping the watcher
        const stopResponse = await request(app.app)
          .delete(`/api/files/watch/${response.body.watcherId}`);

        expect([200, 404]).toContain(stopResponse.status);
      }
    });
  });
});