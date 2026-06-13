/**
 * Authentication routes for Cognitive Fabric Visualizer
 */

import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { asyncHandler, ValidationError, AuthenticationError } from '../middleware/errorHandler';
import { generateTokens, AuthenticatedRequest } from '../middleware/auth';
import { User, UserRole, AuthRequest, AuthResponse } from '../../types';
import { logger } from '../utils/logger';
import database from '../config/database';

const router = Router();

// Mock user database - in production this would be in a real database
const users: User[] = [
  {
    id: 'admin-123',
    email: 'admin@cognitive-fabric.com',
    username: 'admin',
    fullName: 'System Administrator',
    role: UserRole.ADMIN,
    preferences: {
      theme: 'dark',
      language: 'en',
      defaultVisualizationSettings: {
        colorScheme: 'cognitive',
        animationEnabled: true,
        detailLevel: 'comprehensive',
      },
      notifications: {
        email: true,
        browser: true,
        processingComplete: true,
        errors: true,
      },
    },
    createdAt: new Date(),
  },
];

// Register a new user
router.post('/register', asyncHandler(async (req: Request, res: Response) => {
  const { email, password, username, fullName, role = UserRole.VIEWER }: AuthRequest = req.body;

  // Validate input
  if (!email || !password || !username || !fullName) {
    throw new ValidationError('All fields are required: email, password, username, fullName');
  }

  if (password.length < 8) {
    throw new ValidationError('Password must be at least 8 characters long');
  }

  if (!email.includes('@') || !email.includes('.')) {
    throw new ValidationError('Invalid email format');
  }

  // Check if user already exists
  const existingUser = users.find(u => u.email === email || u.username === username);
  if (existingUser) {
    throw new ValidationError('User with this email or username already exists');
  }

  // Hash password
  const saltRounds = 12;
  const passwordHash = await bcrypt.hash(password, saltRounds);

  // Create new user
  const newUser: User = {
    id: uuidv4(),
    email,
    username,
    fullName,
    role,
    preferences: {
      theme: 'light',
      language: 'en',
      defaultVisualizationSettings: {
        colorScheme: 'default',
        animationEnabled: true,
        detailLevel: 'detailed',
      },
      notifications: {
        email: true,
        browser: true,
        processingComplete: true,
        errors: true,
      },
    },
    createdAt: new Date(),
  };

  // In production, save to database
  users.push(newUser);

  logger.info('User registered', {
    userId: newUser.id,
    email: newUser.email,
    username: newUser.username,
    role: newUser.role,
  });

  // Generate tokens
  const tokens = generateTokens({
    id: newUser.id,
    email: newUser.email,
    role: newUser.role,
  });

  const response: AuthResponse = {
    user: newUser,
    token: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: new Date(Date.now() + parseInt(tokens.expiresIn) * 1000),
  };

  res.status(201).json(response);
}));

// Login user
router.post('/login', asyncHandler(async (req: Request, res: Response) => {
  const { email, password }: { email: string; password: string } = req.body;

  // Validate input
  if (!email || !password) {
    throw new ValidationError('Email and password are required');
  }

  // Find user (in production, query database with password hash)
  const user = users.find(u => u.email === email);
  if (!user) {
    throw new AuthenticationError('Invalid email or password');
  }

  // In production, verify password hash
  // const isValidPassword = await bcrypt.compare(password, user.passwordHash);
  // if (!isValidPassword) {
  //   throw new AuthenticationError('Invalid email or password');
  // }

  // For demo, accept any password
  if (password.length < 1) {
    throw new AuthenticationError('Invalid email or password');
  }

  // Update last login
  user.lastLoginAt = new Date();

  logger.info('User logged in', {
    userId: user.id,
    email: user.email,
    role: user.role,
  });

  // Generate tokens
  const tokens = generateTokens({
    id: user.id,
    email: user.email,
    role: user.role,
  });

  const response: AuthResponse = {
    user,
    token: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: new Date(Date.now() + parseInt(tokens.expiresIn) * 1000),
  };

  res.json(response);
}));

// Refresh access token
router.post('/refresh', asyncHandler(async (req: Request, res: Response) => {
  const { refreshToken }: { refreshToken: string } = req.body;

  if (!refreshToken) {
    throw new ValidationError('Refresh token is required');
  }

  try {
    // Verify refresh token and generate new access token
    const newAccessToken = jwt.verify(refreshToken, process.env.JWT_SECRET!);

    // In production, fetch user from database
    const user = users.find(u => u.id === (newAccessToken as any).userId);
    if (!user) {
      throw new AuthenticationError('Invalid refresh token');
    }

    const tokens = generateTokens({
      id: user.id,
      email: user.email,
      role: user.role,
    });

    res.json({
      token: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: new Date(Date.now() + parseInt(tokens.expiresIn) * 1000),
    });
  } catch (error) {
    throw new AuthenticationError('Invalid refresh token');
  }
}));

// Logout user
router.post('/logout', asyncHandler(async (req: Request, res: Response) => {
  const { refreshToken }: { refreshToken?: string } = req.body;

  // In production, invalidate refresh token in database
  // For now, just return success

  logger.info('User logged out', {
    userId: (req as AuthenticatedRequest).user?.id,
  });

  res.json({
    message: 'Logged out successfully',
  });
}));

// Get current user profile
router.get('/me', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user;

  if (!user) {
    throw new AuthenticationError('User not authenticated');
  }

  // In production, fetch full user profile from database
  const fullUser = users.find(u => u.id === user.id) || user;

  res.json({
    user: fullUser,
  });
}));

// Update user profile
router.put('/me', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user;
  const updates = req.body;

  if (!user) {
    throw new AuthenticationError('User not authenticated');
  }

  // Find user in database
  const userIndex = users.findIndex(u => u.id === user.id);
  if (userIndex === -1) {
    throw new ValidationError('User not found');
  }

  // Update allowed fields
  const allowedFields = ['fullName', 'preferences'] as const;
  const filteredUpdates: Partial<User> = {};

  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      (filteredUpdates as Record<string, unknown>)[field] = updates[field];
    }
  }

  // Update user
  users[userIndex] = { ...users[userIndex], ...filteredUpdates };

  logger.info('User profile updated', {
    userId: user.id,
    updatedFields: Object.keys(filteredUpdates),
  });

  res.json({
    user: users[userIndex],
  });
}));

export default router;