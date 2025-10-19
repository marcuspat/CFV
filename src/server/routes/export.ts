/**
 * Export routes for Cognitive Fabric Visualizer
 */

import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { asyncHandler, ValidationError, NotFoundError } from '../middleware/errorHandler';
import { AuthenticatedRequest } from './auth';
import {
  ExportRequest,
  ExportResponse,
  ExportFormat
} from '../../types';
import { logger } from '../utils/logger';

const router = Router();

// Mock export storage
interface ExportJob {
  id: string;
  conversationId: string;
  userId: string;
  format: ExportFormat;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  downloadUrl?: string;
  fileSize?: number;
  createdAt: Date;
  completedAt?: Date;
  expiresAt?: Date;
  error?: string;
}

const exportJobs: ExportJob[] = [];

// Create export job
router.post('/', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const { conversationId, format, options = {} }: ExportRequest = req.body;

  if (!conversationId) {
    throw new ValidationError('Conversation ID is required');
  }

  if (!Object.values(ExportFormat).includes(format)) {
    throw new ValidationError(`Invalid format. Supported formats: ${Object.values(ExportFormat).join(', ')}`);
  }

  // Create export job
  const exportId = uuidv4();
  const job: ExportJob = {
    id: exportId,
    conversationId,
    userId: user.id,
    format,
    status: 'pending',
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
  };

  exportJobs.push(job);

  logger.info('Export job created', {
    exportId,
    conversationId,
    userId: user.id,
    format,
    options,
  });

  // Start processing asynchronously
  setTimeout(() => processExport(job), 1000);

  const response: ExportResponse = {
    exportId,
    status: job.status,
    expiresAt: job.expiresAt,
  };

  res.status(202).json(response);
}));

// Get export status
router.get('/:exportId', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const { exportId } = req.params;

  const job = exportJobs.find(j => j.id === exportId && j.userId === user.id);
  if (!job) {
    throw new NotFoundError('Export job not found');
  }

  const response: ExportResponse = {
    exportId: job.id,
    status: job.status,
    downloadUrl: job.downloadUrl,
    expiresAt: job.expiresAt,
    fileSize: job.fileSize,
  };

  res.json(response);
}));

// Download exported file
router.get('/:exportId/download', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const { exportId } = req.params;

  const job = exportJobs.find(j => j.id === exportId && j.userId === user.id);
  if (!job) {
    throw new NotFoundError('Export job not found');
  }

  if (job.status !== 'completed') {
    throw new ValidationError('Export not completed yet');
  }

  if (!job.downloadUrl) {
    throw new ValidationError('Download URL not available');
  }

  if (job.expiresAt && job.expiresAt < new Date()) {
    throw new ValidationError('Export has expired');
  }

  logger.info('Export downloaded', {
    exportId,
    conversationId: job.conversationId,
    userId: user.id,
    format: job.format,
    fileSize: job.fileSize,
  });

  // In production, serve the actual file
  // For now, return a mock response
  res.json({
    message: 'File download URL',
    url: job.downloadUrl,
    filename: `cognitive-analysis-${job.conversationId}.${job.format}`,
    size: job.fileSize,
    format: job.format,
  });
}));

// Delete export job
router.delete('/:exportId', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const { exportId } = req.params;

  const jobIndex = exportJobs.findIndex(j => j.id === exportId && j.userId === user.id);
  if (jobIndex === -1) {
    throw new NotFoundError('Export job not found');
  }

  exportJobs.splice(jobIndex, 1);

  logger.info('Export job deleted', {
    exportId,
    userId: user.id,
  });

  res.status(204).send();
}));

// List user's export jobs
router.get('/', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const {
    status,
    format,
    conversationId,
    page = 1,
    limit = 20
  } = req.query as any;

  // Filter jobs
  let filteredJobs = exportJobs.filter(j => j.userId === user.id);

  if (status) {
    filteredJobs = filteredJobs.filter(j => j.status === status);
  }

  if (format) {
    filteredJobs = filteredJobs.filter(j => j.format === format);
  }

  if (conversationId) {
    filteredJobs = filteredJobs.filter(j => j.conversationId === conversationId);
  }

  // Sort by creation date (newest first)
  filteredJobs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  // Paginate
  const pageNum = Math.max(1, parseInt(String(page)));
  const limitNum = Math.min(100, Math.max(1, parseInt(String(limit))));
  const offset = (pageNum - 1) * limitNum;

  const paginatedJobs = filteredJobs.slice(offset, offset + limitNum);
  const total = filteredJobs.length;
  const totalPages = Math.ceil(total / limitNum);

  res.json({
    exports: paginatedJobs,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages,
      hasNext: pageNum < totalPages,
      hasPrev: pageNum > 1,
    },
  });
}));

// Get supported export formats
router.get('/formats/list', asyncHandler(async (req: Request, res: Response) => {
  const formats = [
    {
      format: ExportFormat.PNG,
      name: 'PNG Image',
      description: 'High-quality raster image format for visualizations',
      mimeType: 'image/png',
      maxResolution: '4096x4096',
      features: ['transparency', 'high-quality', 'web-optimized'],
    },
    {
      format: ExportFormat.SVG,
      name: 'SVG Vector',
      description: 'Scalable vector graphics for infinite resolution',
      mimeType: 'image/svg+xml',
      maxResolution: 'unlimited',
      features: ['scalable', 'editable', 'small-file-size'],
    },
    {
      format: ExportFormat.JSON,
      name: 'JSON Data',
      description: 'Raw analysis data in structured JSON format',
      mimeType: 'application/json',
      maxResolution: 'N/A',
      features: ['machine-readable', 'complete-data', 'api-compatible'],
    },
    {
      format: ExportFormat.PDF,
      name: 'PDF Document',
      description: 'Formatted document with analysis and visualizations',
      mimeType: 'application/pdf',
      maxResolution: '600dpi',
      features: ['print-ready', 'shareable', 'formatted'],
    },
    {
      format: ExportFormat.CSV,
      name: 'CSV Data',
      description: 'Tabular data export for spreadsheet applications',
      mimeType: 'text/csv',
      maxResolution: 'N/A',
      features: ['tabular', 'spreadsheet-compatible', 'analysis-ready'],
    },
  ];

  res.json({
    formats,
  });
}));

// Mock export processing function
async function processExport(job: ExportJob): Promise<void> {
  try {
    job.status = 'processing';

    // Simulate processing time based on format
    const processingTimes = {
      [ExportFormat.PNG]: 5000,  // 5 seconds
      [ExportFormat.SVG]: 2000,  // 2 seconds
      [ExportFormat.JSON]: 1000, // 1 second
      [ExportFormat.PDF]: 8000,  // 8 seconds
      [ExportFormat.CSV]: 1500,  // 1.5 seconds
    };

    await new Promise(resolve =>
      setTimeout(resolve, processingTimes[job.format] || 3000)
    );

    // Generate mock file info
    const fileSizes = {
      [ExportFormat.PNG]: 2048576,     // 2MB
      [ExportFormat.SVG]: 51200,       // 50KB
      [ExportFormat.JSON]: 102400,     // 100KB
      [ExportFormat.PDF]: 1048576,     // 1MB
      [ExportFormat.CSV]: 25600,       // 25KB
    };

    job.status = 'completed';
    job.completedAt = new Date();
    job.downloadUrl = `/api/exports/${job.id}/download`;
    job.fileSize = fileSizes[job.format] || 100000;

    logger.info('Export completed', {
      exportId: job.id,
      conversationId: job.conversationId,
      format: job.format,
      fileSize: job.fileSize,
      processingTime: job.completedAt.getTime() - job.createdAt.getTime(),
    });

  } catch (error) {
    job.status = 'failed';
    job.error = error instanceof Error ? error.message : 'Unknown error';

    logger.error('Export failed', {
      exportId: job.id,
      conversationId: job.conversationId,
      format: job.format,
      error: job.error,
    });
  }
}

export default router;