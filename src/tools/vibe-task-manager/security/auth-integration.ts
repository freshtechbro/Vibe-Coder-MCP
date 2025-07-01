/**
 * Authentication Integration for Vibe Task Manager
 * 
 * Integrates with MCP authentication system including:
 * - Token-based authentication
 * - Role-based access control
 * - Session management
 * - Authentication audit logging
 * - Secure token storage
 */

import crypto from 'crypto';
import { logSecurityEvent } from './audit-logger.js';
import logger from '../../../logger.js';

/**
 * User role types
 */
export type UserRole = 'admin' | 'manager' | 'developer' | 'viewer' | 'guest';

/**
 * Permission types
 */
export type Permission = 
  | 'task:create' | 'task:read' | 'task:update' | 'task:delete' | 'task:execute'
  | 'project:create' | 'project:read' | 'project:update' | 'project:delete'
  | 'agent:manage' | 'agent:assign' | 'agent:monitor'
  | 'system:admin' | 'system:config' | 'system:audit'
  | 'file:read' | 'file:write' | 'file:execute';

/**
 * Authentication token
 */
export interface AuthToken {
  id: string;
  userId: string;
  sessionId: string;
  token: string;
  refreshToken: string;
  issuedAt: Date;
  expiresAt: Date;
  lastUsed: Date;
  ipAddress?: string;
  userAgent?: string;
  permissions: Permission[];
  role: UserRole;
  metadata?: Record<string, unknown>;
}

/**
 * User session
 */
export interface UserSession {
  id: string;
  userId: string;
  role: UserRole;
  permissions: Permission[];
  createdAt: Date;
  lastActivity: Date;
  expiresAt: Date;
  ipAddress?: string;
  userAgent?: string;
  isActive: boolean;
  metadata?: Record<string, unknown>;
}

/**
 * Authentication result
 */
export interface AuthenticationResult {
  success: boolean;
  token?: AuthToken;
  session?: UserSession;
  error?: string;
  requiresRefresh?: boolean;
}

/**
 * Authorization result
 */
export interface AuthorizationResult {
  authorized: boolean;
  reason?: string;
  requiredPermission?: Permission;
  userRole?: UserRole;
  userPermissions?: Permission[];
}

/**
 * Authentication configuration
 */
export interface AuthenticationConfig {
  enabled: boolean;
  tokenSecret: string;
  tokenExpirationMs: number;
  refreshTokenExpirationMs: number;
  sessionTimeoutMs: number;
  maxConcurrentSessions: number;
  enableRoleBasedAccess: boolean;
  enableAuditLogging: boolean;
  requireSecureTokens: boolean;
  allowGuestAccess: boolean;
}

/**
 * Role permissions mapping
 */
const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  admin: [
    'task:create', 'task:read', 'task:update', 'task:delete', 'task:execute',
    'project:create', 'project:read', 'project:update', 'project:delete',
    'agent:manage', 'agent:assign', 'agent:monitor',
    'system:admin', 'system:config', 'system:audit',
    'file:read', 'file:write', 'file:execute'
  ],
  manager: [
    'task:create', 'task:read', 'task:update', 'task:delete', 'task:execute',
    'project:create', 'project:read', 'project:update', 'project:delete',
    'agent:assign', 'agent:monitor',
    'file:read', 'file:write'
  ],
  developer: [
    'task:create', 'task:read', 'task:update', 'task:execute',
    'project:read', 'project:update',
    'agent:monitor',
    'file:read', 'file:write', 'file:execute'
  ],
  viewer: [
    'task:read',
    'project:read',
    'agent:monitor',
    'file:read'
  ],
  guest: [
    'task:read',
    'project:read'
  ]
};

/**
 * Authentication Integration Service
 */
export class AuthenticationIntegration {
  private static instance: AuthenticationIntegration | null = null;
  private config: AuthenticationConfig;
  private activeSessions: Map<string, UserSession> = new Map();
  private activeTokens: Map<string, AuthToken> = new Map();
  private sessionCleanupTimer: NodeJS.Timeout | null = null;

  private constructor(config?: Partial<AuthenticationConfig>) {
    this.config = {
      enabled: true,
      tokenSecret: process.env.VIBE_AUTH_SECRET || this.generateSecureSecret(),
      tokenExpirationMs: 3600000, // 1 hour
      refreshTokenExpirationMs: 86400000, // 24 hours
      sessionTimeoutMs: 7200000, // 2 hours
      maxConcurrentSessions: 5,
      enableRoleBasedAccess: true,
      enableAuditLogging: true,
      requireSecureTokens: true,
      allowGuestAccess: false,
      ...config
    };

    this.startSessionCleanup();

    logger.info({ 
      enabled: this.config.enabled,
      roleBasedAccess: this.config.enableRoleBasedAccess,
      auditLogging: this.config.enableAuditLogging
    }, 'Authentication Integration initialized');
  }

  /**
   * Get singleton instance
   */
  static getInstance(config?: Partial<AuthenticationConfig>): AuthenticationIntegration {
    if (!AuthenticationIntegration.instance) {
      AuthenticationIntegration.instance = new AuthenticationIntegration(config);
    }
    return AuthenticationIntegration.instance;
  }

  /**
   * Authenticate user and create session
   */
  async authenticate(
    userId: string,
    role: UserRole,
    context?: {
      ipAddress?: string;
      userAgent?: string;
      metadata?: Record<string, unknown>;
    }
  ): Promise<AuthenticationResult> {
    if (!this.config.enabled) {
      return { success: true }; // Authentication disabled
    }

    try {
      // Check concurrent session limit
      const userSessions = Array.from(this.activeSessions.values())
        .filter(session => session.userId === userId && session.isActive);

      if (userSessions.length >= this.config.maxConcurrentSessions) {
        await logSecurityEvent(
          'authentication',
          'medium',
          'auth-integration',
          'session_limit_exceeded',
          'blocked',
          `User ${userId} exceeded concurrent session limit`,
          {
            actor: { userId, ipAddress: context?.ipAddress, userAgent: context?.userAgent },
            metadata: { currentSessions: userSessions.length, limit: this.config.maxConcurrentSessions }
          }
        );

        return {
          success: false,
          error: 'Maximum concurrent sessions exceeded'
        };
      }

      // Create session
      const sessionId = this.generateSessionId();
      const now = new Date();
      
      const session: UserSession = {
        id: sessionId,
        userId,
        role,
        permissions: this.getRolePermissions(role),
        createdAt: now,
        lastActivity: now,
        expiresAt: new Date(now.getTime() + this.config.sessionTimeoutMs),
        ipAddress: context?.ipAddress,
        userAgent: context?.userAgent,
        isActive: true,
        metadata: context?.metadata
      };

      // Create tokens
      const token = await this.createAuthToken(userId, sessionId, role, context);

      // Store session and token
      this.activeSessions.set(sessionId, session);
      this.activeTokens.set(token.id, token);

      await logSecurityEvent(
        'authentication',
        'info',
        'auth-integration',
        'login',
        'success',
        `User ${userId} authenticated successfully`,
        {
          actor: { userId, sessionId, ipAddress: context?.ipAddress, userAgent: context?.userAgent },
          metadata: { role, permissions: session.permissions.length }
        }
      );

      return {
        success: true,
        token,
        session
      };

    } catch (error) {
      await logSecurityEvent(
        'authentication',
        'high',
        'auth-integration',
        'login',
        'failure',
        `Authentication failed for user ${userId}`,
        {
          actor: { userId, ipAddress: context?.ipAddress, userAgent: context?.userAgent },
          metadata: { error: error instanceof Error ? error.message : String(error) }
        }
      );

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Authentication failed'
      };
    }
  }

  /**
   * Validate authentication token
   */
  async validateToken(tokenString: string): Promise<AuthenticationResult> {
    if (!this.config.enabled) {
      return { success: true }; // Authentication disabled
    }

    try {
      // Find token
      const token = Array.from(this.activeTokens.values())
        .find(t => t.token === tokenString);

      if (!token) {
        await logSecurityEvent(
          'authentication',
          'medium',
          'auth-integration',
          'token_validation',
          'failure',
          'Invalid token provided',
          { metadata: { tokenPrefix: tokenString.substring(0, 8) } }
        );

        return {
          success: false,
          error: 'Invalid token'
        };
      }

      // Check token expiration
      if (Date.now() > token.expiresAt.getTime()) {
        await logSecurityEvent(
          'authentication',
          'low',
          'auth-integration',
          'token_validation',
          'failure',
          'Expired token used',
          {
            actor: { userId: token.userId, sessionId: token.sessionId },
            metadata: { tokenId: token.id, expiredAt: token.expiresAt }
          }
        );

        return {
          success: false,
          error: 'Token expired',
          requiresRefresh: true
        };
      }

      // Update last used
      token.lastUsed = new Date();

      // Get session
      const session = this.activeSessions.get(token.sessionId);
      if (!session || !session.isActive) {
        return {
          success: false,
          error: 'Session not found or inactive'
        };
      }

      // Update session activity
      session.lastActivity = new Date();

      return {
        success: true,
        token,
        session
      };

    } catch (error) {
      await logSecurityEvent(
        'authentication',
        'high',
        'auth-integration',
        'token_validation',
        'failure',
        'Token validation error',
        { metadata: { error: error instanceof Error ? error.message : String(error) } }
      );

      return {
        success: false,
        error: 'Token validation failed'
      };
    }
  }

  /**
   * Refresh authentication token
   */
  async refreshToken(refreshTokenString: string): Promise<AuthenticationResult> {
    if (!this.config.enabled) {
      return { success: true }; // Authentication disabled
    }

    try {
      // Find token by refresh token
      const token = Array.from(this.activeTokens.values())
        .find(t => t.refreshToken === refreshTokenString);

      if (!token) {
        await logSecurityEvent(
          'authentication',
          'medium',
          'auth-integration',
          'token_refresh',
          'failure',
          'Invalid refresh token provided'
        );

        return {
          success: false,
          error: 'Invalid refresh token'
        };
      }

      // Get session
      const session = this.activeSessions.get(token.sessionId);
      if (!session || !session.isActive) {
        return {
          success: false,
          error: 'Session not found or inactive'
        };
      }

      // Create new token
      const newToken = await this.createAuthToken(
        token.userId,
        token.sessionId,
        session.role,
        {
          ipAddress: token.ipAddress,
          userAgent: token.userAgent,
          metadata: token.metadata
        }
      );

      // Remove old token
      this.activeTokens.delete(token.id);

      // Store new token
      this.activeTokens.set(newToken.id, newToken);

      await logSecurityEvent(
        'authentication',
        'info',
        'auth-integration',
        'token_refresh',
        'success',
        'Token refreshed successfully',
        {
          actor: { userId: token.userId, sessionId: token.sessionId },
          metadata: { oldTokenId: token.id, newTokenId: newToken.id }
        }
      );

      return {
        success: true,
        token: newToken,
        session
      };

    } catch (error) {
      await logSecurityEvent(
        'authentication',
        'high',
        'auth-integration',
        'token_refresh',
        'failure',
        'Token refresh failed',
        { metadata: { error: error instanceof Error ? error.message : String(error) } }
      );

      return {
        success: false,
        error: 'Token refresh failed'
      };
    }
  }

  /**
   * Check authorization for specific permission
   */
  async authorize(
    sessionId: string,
    permission: Permission,
    resource?: { type: string; id?: string }
  ): Promise<AuthorizationResult> {
    if (!this.config.enabled || !this.config.enableRoleBasedAccess) {
      return { authorized: true }; // Authorization disabled
    }

    try {
      const session = this.activeSessions.get(sessionId);
      if (!session || !session.isActive) {
        await logSecurityEvent(
          'authorization',
          'medium',
          'auth-integration',
          'permission_check',
          'blocked',
          'Authorization attempted with invalid session',
          {
            actor: { sessionId },
            resource,
            metadata: { requiredPermission: permission }
          }
        );

        return {
          authorized: false,
          reason: 'Invalid or inactive session',
          requiredPermission: permission
        };
      }

      // Check if user has required permission
      const hasPermission = session.permissions.includes(permission);

      if (!hasPermission) {
        await logSecurityEvent(
          'authorization',
          'medium',
          'auth-integration',
          'permission_check',
          'blocked',
          `Access denied: insufficient permissions`,
          {
            actor: { userId: session.userId, sessionId },
            resource,
            metadata: { 
              requiredPermission: permission,
              userRole: session.role,
              userPermissions: session.permissions
            }
          }
        );

        return {
          authorized: false,
          reason: 'Insufficient permissions',
          requiredPermission: permission,
          userRole: session.role,
          userPermissions: session.permissions
        };
      }

      // Update session activity
      session.lastActivity = new Date();

      return {
        authorized: true,
        userRole: session.role,
        userPermissions: session.permissions
      };

    } catch (error) {
      await logSecurityEvent(
        'authorization',
        'high',
        'auth-integration',
        'permission_check',
        'failure',
        'Authorization check failed',
        {
          actor: { sessionId },
          resource,
          metadata: { 
            error: error instanceof Error ? error.message : String(error),
            requiredPermission: permission
          }
        }
      );

      return {
        authorized: false,
        reason: 'Authorization check failed',
        requiredPermission: permission
      };
    }
  }

  /**
   * Logout user and invalidate session
   */
  async logout(sessionId: string): Promise<boolean> {
    try {
      const session = this.activeSessions.get(sessionId);
      if (!session) {
        return false;
      }

      // Deactivate session
      session.isActive = false;

      // Remove associated tokens
      const sessionTokens = Array.from(this.activeTokens.entries())
        .filter(([, token]) => token.sessionId === sessionId);

      for (const [tokenId] of sessionTokens) {
        this.activeTokens.delete(tokenId);
      }

      await logSecurityEvent(
        'authentication',
        'info',
        'auth-integration',
        'logout',
        'success',
        'User logged out successfully',
        {
          actor: { userId: session.userId, sessionId },
          metadata: { tokensRemoved: sessionTokens.length }
        }
      );

      return true;

    } catch (error) {
      await logSecurityEvent(
        'authentication',
        'medium',
        'auth-integration',
        'logout',
        'failure',
        'Logout failed',
        {
          actor: { sessionId },
          metadata: { error: error instanceof Error ? error.message : String(error) }
        }
      );

      return false;
    }
  }

  /**
   * Create authentication token
   */
  private async createAuthToken(
    userId: string,
    sessionId: string,
    role: UserRole,
    context?: {
      ipAddress?: string;
      userAgent?: string;
      metadata?: Record<string, unknown>;
    }
  ): Promise<AuthToken> {
    const tokenId = this.generateTokenId();
    const now = new Date();

    const token: AuthToken = {
      id: tokenId,
      userId,
      sessionId,
      token: this.generateSecureToken(),
      refreshToken: this.generateSecureToken(),
      issuedAt: now,
      expiresAt: new Date(now.getTime() + this.config.tokenExpirationMs),
      lastUsed: now,
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
      permissions: this.getRolePermissions(role),
      role,
      metadata: context?.metadata
    };

    return token;
  }

  /**
   * Get permissions for role
   */
  private getRolePermissions(role: UserRole): Permission[] {
    return [...ROLE_PERMISSIONS[role]];
  }

  /**
   * Generate secure session ID
   */
  private generateSessionId(): string {
    return `session_${crypto.randomBytes(16).toString('hex')}_${Date.now()}`;
  }

  /**
   * Generate secure token ID
   */
  private generateTokenId(): string {
    return `token_${crypto.randomBytes(16).toString('hex')}_${Date.now()}`;
  }

  /**
   * Generate secure token
   */
  private generateSecureToken(): string {
    const payload = {
      random: crypto.randomBytes(32).toString('hex'),
      timestamp: Date.now()
    };

    const signature = crypto
      .createHmac('sha256', this.config.tokenSecret)
      .update(JSON.stringify(payload))
      .digest('hex');

    return `${Buffer.from(JSON.stringify(payload)).toString('base64')}.${signature}`;
  }

  /**
   * Generate secure secret
   */
  private generateSecureSecret(): string {
    return crypto.randomBytes(64).toString('hex');
  }

  /**
   * Start session cleanup timer
   */
  private startSessionCleanup(): void {
    this.sessionCleanupTimer = setInterval(() => {
      this.cleanupExpiredSessions();
    }, 300000); // 5 minutes
  }

  /**
   * Cleanup expired sessions and tokens
   */
  private async cleanupExpiredSessions(): Promise<void> {
    const now = Date.now();
    let cleanedSessions = 0;
    let cleanedTokens = 0;

    // Cleanup expired sessions
    for (const [sessionId, session] of this.activeSessions) {
      if (now > session.expiresAt.getTime() || 
          (session.isActive && now - session.lastActivity.getTime() > this.config.sessionTimeoutMs)) {
        
        session.isActive = false;
        this.activeSessions.delete(sessionId);
        cleanedSessions++;

        await logSecurityEvent(
          'authentication',
          'info',
          'auth-integration',
          'session_cleanup',
          'success',
          'Expired session cleaned up',
          {
            actor: { userId: session.userId, sessionId },
            metadata: { expiredAt: session.expiresAt, lastActivity: session.lastActivity }
          }
        );
      }
    }

    // Cleanup expired tokens
    for (const [tokenId, token] of this.activeTokens) {
      if (now > token.expiresAt.getTime() || !this.activeSessions.has(token.sessionId)) {
        this.activeTokens.delete(tokenId);
        cleanedTokens++;
      }
    }

    if (cleanedSessions > 0 || cleanedTokens > 0) {
      logger.debug({
        cleanedSessions,
        cleanedTokens,
        activeSessions: this.activeSessions.size,
        activeTokens: this.activeTokens.size
      }, 'Session and token cleanup completed');
    }
  }

  /**
   * Get authentication statistics
   */
  getAuthenticationStatistics(): {
    activeSessions: number;
    activeTokens: number;
    sessionsByRole: Record<UserRole, number>;
    averageSessionDuration: number;
  } {
    const sessionsByRole: Record<UserRole, number> = {} as Record<UserRole, number>;
    let totalSessionDuration = 0;
    let sessionCount = 0;

    for (const session of this.activeSessions.values()) {
      if (session.isActive) {
        sessionsByRole[session.role] = (sessionsByRole[session.role] || 0) + 1;
        totalSessionDuration += Date.now() - session.createdAt.getTime();
        sessionCount++;
      }
    }

    return {
      activeSessions: this.activeSessions.size,
      activeTokens: this.activeTokens.size,
      sessionsByRole,
      averageSessionDuration: sessionCount > 0 ? totalSessionDuration / sessionCount : 0
    };
  }

  /**
   * Shutdown authentication integration
   */
  async shutdown(): Promise<void> {
    if (this.sessionCleanupTimer) {
      clearInterval(this.sessionCleanupTimer);
    }

    // Log all active sessions out
    const sessionIds = Array.from(this.activeSessions.keys());
    for (const sessionId of sessionIds) {
      await this.logout(sessionId);
    }

    this.activeSessions.clear();
    this.activeTokens.clear();

    logger.info('Authentication Integration shutdown');
  }
}

/**
 * Convenience function to get authentication integration instance
 */
export function getAuthenticationIntegration(): AuthenticationIntegration {
  return AuthenticationIntegration.getInstance();
}
