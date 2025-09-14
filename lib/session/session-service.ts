/**
 * Session Management Service
 * 
 * Comprehensive session management with vector search capabilities
 * Follows SOLID principles and clean architecture patterns
 */

import { PrismaClient } from '@prisma/client';
import { Session, SessionCategory, SessionStatus, SessionLog, SessionFile, LogSeverity, FileProcessingStatus } from '@prisma/client';
import { getQdrantService, SearchResult } from '../vector/qdrant-service';

// Types for better type safety
export interface SessionCreateInput {
    userId: string;
    title?: string;
    description?: string;
    category?: SessionCategory;
    metadata?: Record<string, any>;
    tags?: string[];
}

export interface SessionUpdateInput {
    title?: string;
    description?: string;
    category?: SessionCategory;
    status?: SessionStatus;
    metadata?: Record<string, any>;
    tags?: string[];
    sessionSummary?: string;
    contextEmbedding?: number[];
}

export interface SessionSearchParams {
    userId: string;
    query?: string;
    category?: SessionCategory;
    status?: SessionStatus;
    tags?: string[];
    limit?: number;
    offset?: number;
    sortBy?: 'createdAt' | 'lastActivityAt' | 'messageCount' | 'totalCost';
    sortOrder?: 'asc' | 'desc';
}

export interface SessionLogCreateInput {
    sessionId: string;
    action: string;
    description?: string;
    metadata?: Record<string, any>;
    severity?: LogSeverity;
    responseTime?: number;
    tokenCount?: number;
    costUsd?: number;
}

export interface SessionFileCreateInput {
    sessionId: string;
    fileName: string;
    fileType: string;
    fileSize: number;
    filePath?: string;
    originalName?: string;
    metadata?: Record<string, any>;
    tags?: string[];
}

export interface VectorSearchResult {
    id: string;
    title: string | null;
    description: string | null;
    similarity: number;
    category: SessionCategory | null;
    lastActivityAt: Date;
    messageCount: number;
}

export class SessionService {
    private prisma: PrismaClient;
    private qdrant: ReturnType<typeof getQdrantService>;

    constructor(prisma: PrismaClient) {
        this.prisma = prisma;
        this.qdrant = getQdrantService();
    }

    /**
     * Create a new session
     */
    async createSession(input: SessionCreateInput): Promise<Session> {
        try {
            const session = await this.prisma.session.create({
                data: {
                    userId: input.userId,
                    title: input.title,
                    description: input.description,
                    category: input.category,
                    metadata: input.metadata,
                    tags: input.tags || [],
                    status: SessionStatus.ACTIVE,
                },
                include: {
                    user: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                        },
                    },
                },
            });

            // Log session creation
            await this.createSessionLog({
                sessionId: session.id,
                action: 'session_created',
                description: `Session "${input.title || 'Untitled'}" created`,
                severity: LogSeverity.INFO,
                metadata: {
                    category: input.category,
                    tags: input.tags,
                },
            });

            return session;
        } catch (error) {
            throw new Error(`Failed to create session: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Get session by ID with full details
     */
    async getSessionById(sessionId: string, userId: string): Promise<Session | null> {
        try {
            const session = await this.prisma.session.findFirst({
                where: {
                    id: sessionId,
                    userId: userId,
                },
                include: {
                    user: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                        },
                    },
                    chats: {
                        orderBy: {
                            createdAt: 'asc',
                        },
                        take: 50, // Limit to last 50 messages for performance
                    },
                    sessionFiles: {
                        orderBy: {
                            uploadedAt: 'desc',
                        },
                    },
                    _count: {
                        select: {
                            chats: true,
                            sessionFiles: true,
                            sessionLogs: true,
                        },
                    },
                },
            });

            return session;
        } catch (error) {
            throw new Error(`Failed to get session: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Update session
     */
    async updateSession(sessionId: string, userId: string, input: SessionUpdateInput): Promise<Session> {
        try {
            // Verify session ownership
            const existingSession = await this.prisma.session.findFirst({
                where: {
                    id: sessionId,
                    userId: userId,
                },
            });

            if (!existingSession) {
                throw new Error('Session not found or access denied');
            }

            const session = await this.prisma.session.update({
                where: {
                    id: sessionId,
                },
                data: {
                    ...input,
                    updatedAt: new Date(),
                },
                include: {
                    user: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                        },
                    },
                },
            });

            // Log session update
            await this.createSessionLog({
                sessionId: sessionId,
                action: 'session_updated',
                description: 'Session updated',
                severity: LogSeverity.INFO,
                metadata: {
                    updatedFields: Object.keys(input),
                },
            });

            return session;
        } catch (error) {
            throw new Error(`Failed to update session: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * List sessions with filtering and pagination
     */
    async listSessions(params: SessionSearchParams): Promise<{ sessions: Session[]; total: number }> {
        try {
            const {
                userId,
                query,
                category,
                status,
                tags,
                limit = 20,
                offset = 0,
                sortBy = 'lastActivityAt',
                sortOrder = 'desc',
            } = params;

            const where: any = {
                userId: userId,
            };

            // Apply filters
            if (category) {
                where.category = category;
            }

            if (status) {
                where.status = status;
            }

            if (tags && tags.length > 0) {
                where.tags = {
                    hasSome: tags,
                };
            }

            if (query) {
                where.OR = [
                    {
                        title: {
                            contains: query,
                            mode: 'insensitive',
                        },
                    },
                    {
                        description: {
                            contains: query,
                            mode: 'insensitive',
                        },
                    },
                    {
                        sessionSummary: {
                            contains: query,
                            mode: 'insensitive',
                        },
                    },
                ];
            }

            const [sessions, total] = await Promise.all([
                this.prisma.session.findMany({
                    where,
                    include: {
                        user: {
                            select: {
                                id: true,
                                name: true,
                                email: true,
                            },
                        },
                        _count: {
                            select: {
                                chats: true,
                                sessionFiles: true,
                            },
                        },
                    },
                    orderBy: {
                        [sortBy]: sortOrder,
                    },
                    take: limit,
                    skip: offset,
                }),
                this.prisma.session.count({ where }),
            ]);

            return { sessions, total };
        } catch (error) {
            throw new Error(`Failed to list sessions: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Search sessions using vector similarity
     */
    async searchSessionsByVector(
        userId: string,
        queryEmbedding: number[],
        similarityThreshold: number = 0.7,
        limit: number = 10
    ): Promise<VectorSearchResult[]> {
        try {
            // Search in Qdrant vector database
            const vectorResults = await this.qdrant.searchSessions(queryEmbedding, userId, {
                limit,
                scoreThreshold: similarityThreshold,
            });

            // Get additional session data from PostgreSQL
            const sessionIds = vectorResults.map(result => result.id);
            const sessions = await this.prisma.session.findMany({
                where: {
                    id: { in: sessionIds },
                    userId: userId,
                },
                select: {
                    id: true,
                    title: true,
                    description: true,
                    category: true,
                    lastActivityAt: true,
                    messageCount: true,
                },
            });

            // Combine vector results with session data
            const results: VectorSearchResult[] = vectorResults.map(vectorResult => {
                const session = sessions.find(s => s.id === vectorResult.id);
                return {
                    id: vectorResult.id,
                    title: session?.title || null,
                    description: session?.description || null,
                    similarity: vectorResult.score,
                    category: session?.category || null,
                    lastActivityAt: session?.lastActivityAt || new Date(),
                    messageCount: session?.messageCount || 0,
                };
            });

            return results;
        } catch (error) {
            throw new Error(`Failed to search sessions by vector: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Update session activity and analytics
     */
    async updateSessionActivity(
        sessionId: string,
        updates: {
            messageCount?: number;
            totalTokens?: number;
            totalCost?: number;
            durationMinutes?: number;
        }
    ): Promise<void> {
        try {
            await this.prisma.session.update({
                where: {
                    id: sessionId,
                },
                data: {
                    ...updates,
                    lastActivityAt: new Date(),
                    updatedAt: new Date(),
                },
            });
        } catch (error) {
            throw new Error(`Failed to update session activity: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Store session vector in Qdrant
     */
    async storeSessionVector(
        sessionId: string,
        vector: number[],
        content: string,
        metadata?: {
            title?: string;
            category?: string;
            tags?: string[];
        }
    ): Promise<void> {
        try {
            const session = await this.prisma.session.findUnique({
                where: { id: sessionId },
                select: { userId: true, title: true, category: true, tags: true },
            });

            if (!session) {
                throw new Error('Session not found');
            }

            await this.qdrant.storeSessionVector(sessionId, vector, {
                content,
                title: metadata?.title || session.title || undefined,
                userId: session.userId,
                category: metadata?.category || session.category || undefined,
                tags: metadata?.tags || session.tags || [],
                metadata: metadata,
            });

            // Update vectorId in PostgreSQL
            await this.prisma.session.update({
                where: { id: sessionId },
                data: { vectorId: sessionId },
            });
        } catch (error) {
            throw new Error(`Failed to store session vector: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Update session vector in Qdrant
     */
    async updateSessionVector(
        sessionId: string,
        vector: number[],
        content: string,
        metadata?: {
            title?: string;
            category?: string;
            tags?: string[];
        }
    ): Promise<void> {
        try {
            const session = await this.prisma.session.findUnique({
                where: { id: sessionId },
                select: { userId: true, title: true, category: true, tags: true },
            });

            if (!session) {
                throw new Error('Session not found');
            }

            await this.qdrant.storeSessionVector(sessionId, vector, {
                content,
                title: metadata?.title || session.title || undefined,
                userId: session.userId,
                category: metadata?.category || session.category || undefined,
                tags: metadata?.tags || session.tags || [],
                metadata: metadata,
            });
        } catch (error) {
            throw new Error(`Failed to update session vector: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Delete session vector from Qdrant
     */
    async deleteSessionVector(sessionId: string): Promise<void> {
        try {
            await this.qdrant.deleteVector('sessions', sessionId);

            // Clear vectorId in PostgreSQL
            await this.prisma.session.update({
                where: { id: sessionId },
                data: { vectorId: null },
            });
        } catch (error) {
            throw new Error(`Failed to delete session vector: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Archive or delete session
     */
    async archiveSession(sessionId: string, userId: string, permanent: boolean = false): Promise<void> {
        try {
            const session = await this.prisma.session.findFirst({
                where: {
                    id: sessionId,
                    userId: userId,
                },
            });

            if (!session) {
                throw new Error('Session not found or access denied');
            }

            if (permanent) {
                // Delete vector from Qdrant if it exists
                if (session.vectorId) {
                    await this.deleteSessionVector(sessionId);
                }

                await this.prisma.session.delete({
                    where: {
                        id: sessionId,
                    },
                });
            } else {
                await this.prisma.session.update({
                    where: {
                        id: sessionId,
                    },
                    data: {
                        status: SessionStatus.ARCHIVED,
                        isActive: false,
                        updatedAt: new Date(),
                    },
                });
            }

            // Log session archival/deletion
            await this.createSessionLog({
                sessionId: sessionId,
                action: permanent ? 'session_deleted' : 'session_archived',
                description: permanent ? 'Session permanently deleted' : 'Session archived',
                severity: LogSeverity.INFO,
            });
        } catch (error) {
            throw new Error(`Failed to archive session: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Create session log entry
     */
    async createSessionLog(input: SessionLogCreateInput): Promise<SessionLog> {
        try {
            const log = await this.prisma.sessionLog.create({
                data: {
                    sessionId: input.sessionId,
                    action: input.action,
                    description: input.description,
                    metadata: input.metadata,
                    severity: input.severity || LogSeverity.INFO,
                    responseTime: input.responseTime,
                    tokenCount: input.tokenCount,
                    costUsd: input.costUsd,
                },
            });

            return log;
        } catch (error) {
            throw new Error(`Failed to create session log: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Get session logs
     */
    async getSessionLogs(
        sessionId: string,
        limit: number = 50,
        offset: number = 0
    ): Promise<{ logs: SessionLog[]; total: number }> {
        try {
            const [logs, total] = await Promise.all([
                this.prisma.sessionLog.findMany({
                    where: {
                        sessionId: sessionId,
                    },
                    orderBy: {
                        createdAt: 'desc',
                    },
                    take: limit,
                    skip: offset,
                }),
                this.prisma.sessionLog.count({
                    where: {
                        sessionId: sessionId,
                    },
                }),
            ]);

            return { logs, total };
        } catch (error) {
            throw new Error(`Failed to get session logs: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Add file to session
     */
    async addSessionFile(input: SessionFileCreateInput): Promise<SessionFile> {
        try {
            const file = await this.prisma.sessionFile.create({
                data: {
                    sessionId: input.sessionId,
                    fileName: input.fileName,
                    fileType: input.fileType,
                    fileSize: input.fileSize,
                    filePath: input.filePath,
                    originalName: input.originalName,
                    metadata: input.metadata,
                    tags: input.tags || [],
                    processingStatus: FileProcessingStatus.PENDING,
                },
            });

            // Log file addition
            await this.createSessionLog({
                sessionId: input.sessionId,
                action: 'file_added',
                description: `File "${input.fileName}" added to session`,
                severity: LogSeverity.INFO,
                metadata: {
                    fileId: file.id,
                    fileType: input.fileType,
                    fileSize: input.fileSize,
                },
            });

            return file;
        } catch (error) {
            throw new Error(`Failed to add session file: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Update file processing status
     */
    async updateFileProcessingStatus(
        fileId: string,
        status: FileProcessingStatus,
        updates?: {
            extractedText?: string;
            summary?: string;
            contentEmbedding?: number[];
            tags?: string[];
        }
    ): Promise<SessionFile> {
        try {
            const file = await this.prisma.sessionFile.update({
                where: {
                    id: fileId,
                },
                data: {
                    processingStatus: status,
                    ...updates,
                },
            });

            // Log status update
            await this.createSessionLog({
                sessionId: file.sessionId,
                action: 'file_processing_updated',
                description: `File processing status updated to ${status}`,
                severity: LogSeverity.INFO,
                metadata: {
                    fileId: fileId,
                    status: status,
                },
            });

            return file;
        } catch (error) {
            throw new Error(`Failed to update file processing status: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Get session analytics
     */
    async getSessionAnalytics(userId: string, days: number = 30): Promise<{
        totalSessions: number;
        activeSessions: number;
        totalMessages: number;
        totalCost: number;
        averageSessionDuration: number;
        categoryBreakdown: Array<{ category: SessionCategory | null; count: number }>;
    }> {
        try {
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - days);

            const [
                totalSessions,
                activeSessions,
                totalMessages,
                totalCost,
                categoryBreakdown,
            ] = await Promise.all([
                this.prisma.session.count({
                    where: {
                        userId: userId,
                        createdAt: {
                            gte: startDate,
                        },
                    },
                }),
                this.prisma.session.count({
                    where: {
                        userId: userId,
                        status: SessionStatus.ACTIVE,
                        createdAt: {
                            gte: startDate,
                        },
                    },
                }),
                this.prisma.session.aggregate({
                    where: {
                        userId: userId,
                        createdAt: {
                            gte: startDate,
                        },
                    },
                    _sum: {
                        messageCount: true,
                    },
                }),
                this.prisma.session.aggregate({
                    where: {
                        userId: userId,
                        createdAt: {
                            gte: startDate,
                        },
                    },
                    _sum: {
                        totalCost: true,
                    },
                }),
                this.prisma.session.groupBy({
                    by: ['category'],
                    where: {
                        userId: userId,
                        createdAt: {
                            gte: startDate,
                        },
                    },
                    _count: {
                        category: true,
                    },
                }),
            ]);

            const averageSessionDuration = await this.prisma.session.aggregate({
                where: {
                    userId: userId,
                    createdAt: {
                        gte: startDate,
                    },
                    durationMinutes: {
                        not: null,
                    },
                },
                _avg: {
                    durationMinutes: true,
                },
            });

            return {
                totalSessions,
                activeSessions,
                totalMessages: totalMessages._sum.messageCount || 0,
                totalCost: Number(totalCost._sum.totalCost || 0),
                averageSessionDuration: averageSessionDuration._avg.durationMinutes || 0,
                categoryBreakdown: categoryBreakdown.map(item => ({
                    category: item.category,
                    count: item._count.category,
                })),
            };
        } catch (error) {
            throw new Error(`Failed to get session analytics: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Clean up old sessions (utility method)
     */
    async cleanupOldSessions(daysOld: number = 90): Promise<number> {
        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - daysOld);

            const result = await this.prisma.session.updateMany({
                where: {
                    status: SessionStatus.ARCHIVED,
                    lastActivityAt: {
                        lt: cutoffDate,
                    },
                },
                data: {
                    status: SessionStatus.DELETED,
                    isActive: false,
                },
            });

            return result.count;
        } catch (error) {
            throw new Error(`Failed to cleanup old sessions: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
}

// Export singleton instance
let sessionServiceInstance: SessionService | null = null;

export function getSessionService(prisma: PrismaClient): SessionService {
    if (!sessionServiceInstance) {
        sessionServiceInstance = new SessionService(prisma);
    }
    return sessionServiceInstance;
}
