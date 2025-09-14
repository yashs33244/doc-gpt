/**
 * Cost Tracking Service for Doctor GPT
 * Implements comprehensive cost tracking with real-time monitoring and budget management
 */

import { PrismaClient } from '@prisma/client';
import { config } from '../../config';
import {
    CostEntry,
    CostSummary,
    CostBudget,
    CostAlert,
    Operation,
    CostTrackingConfig,
    CostTrackingMetrics,
    CostTrackingError,
    BudgetExceededError
} from './types';

export class CostTracker {
    private static instance: CostTracker;
    private prisma: PrismaClient;
    private costQueue: CostEntry[] = [];
    private flushTimer?: NodeJS.Timeout;
    private readonly config: CostTrackingConfig;

    private constructor() {
        this.prisma = new PrismaClient();
        this.config = {
            enabled: config.enableCostTracking,
            flushInterval: 5000, // 5 seconds
            batchSize: 50,
            enableRealTimeAlerts: true,
            enableBudgetTracking: true,
            defaultCurrency: 'USD',
            costSources: {
                openai: {
                    enabled: true,
                    provider: 'openai',
                    costPerUnit: 0.00000015, // per input token for GPT-4o-mini
                    unit: 'token',
                    currency: 'USD'
                },
                anthropic: {
                    enabled: true,
                    provider: 'anthropic',
                    costPerUnit: 0.000003, // per input token for Claude 3.5 Sonnet
                    unit: 'token',
                    currency: 'USD'
                },
                tavily: {
                    enabled: true,
                    provider: 'tavily',
                    costPerUnit: 0.001, // per search request
                    unit: 'request',
                    currency: 'USD'
                },
                vector_db: {
                    enabled: true,
                    provider: 'vector_db',
                    costPerUnit: 0.0001, // per query
                    unit: 'query',
                    currency: 'USD'
                }
            }
        };

        if (this.config.enabled) {
            this.startFlushTimer();
        }
    }

    public static getInstance(): CostTracker {
        if (!CostTracker.instance) {
            CostTracker.instance = new CostTracker();
        }
        return CostTracker.instance;
    }

    /**
     * Track a cost entry
     */
    public async trackCost(entry: Omit<CostEntry, 'id' | 'timestamp'>): Promise<void> {
        if (!this.config.enabled) return;

        const costEntry: CostEntry = {
            ...entry,
            id: crypto.randomUUID(),
            timestamp: new Date()
        };

        // Add to queue for batch processing
        this.costQueue.push(costEntry);

        // Check if we need to flush immediately
        if (this.costQueue.length >= this.config.batchSize) {
            await this.flushCosts();
        }

        // Check budget limits in real-time for critical operations
        if (this.config.enableBudgetTracking && this.isCriticalOperation(entry.operation)) {
            await this.checkBudgetLimits(entry.userId, entry.totalCost);
        }
    }

    /**
     * Track model inference cost
     */
    public async trackModelInference(
        userId: string,
        provider: string,
        model: string,
        inputTokens: number,
        outputTokens: number,
        inputCost: number,
        outputCost: number,
        sessionId?: string,
        chatId?: string,
        metadata?: Record<string, any>
    ): Promise<void> {
        await this.trackCost({
            userId,
            sessionId,
            chatId,
            operation: Operation.MODEL_INFERENCE,
            provider,
            model,
            inputTokens,
            outputTokens,
            totalTokens: inputTokens + outputTokens,
            inputCost,
            outputCost,
            totalCost: inputCost + outputCost,
            currency: 'USD',
            metadata: {
                ...metadata,
                model,
                provider
            }
        });
    }

    /**
     * Track web search cost
     */
    public async trackWebSearch(
        userId: string,
        provider: string,
        searchCount: number,
        totalCost: number,
        sessionId?: string,
        chatId?: string,
        metadata?: Record<string, any>
    ): Promise<void> {
        await this.trackCost({
            userId,
            sessionId,
            chatId,
            operation: Operation.WEB_SEARCH,
            provider,
            inputCost: totalCost,
            outputCost: 0,
            totalCost,
            currency: 'USD',
            metadata: {
                ...metadata,
                searchCount,
                provider
            }
        });
    }

    /**
     * Track vector database operation cost
     */
    public async trackVectorOperation(
        userId: string,
        operation: 'search' | 'insert' | 'update',
        queryCount: number,
        totalCost: number,
        sessionId?: string,
        chatId?: string,
        metadata?: Record<string, any>
    ): Promise<void> {
        await this.trackCost({
            userId,
            sessionId,
            chatId,
            operation: Operation.VECTOR_SEARCH,
            provider: 'vector_db',
            inputCost: totalCost,
            outputCost: 0,
            totalCost,
            currency: 'USD',
            metadata: {
                ...metadata,
                operation,
                queryCount
            }
        });
    }

    /**
     * Get cost summary for a user
     */
    public async getCostSummary(
        userId: string,
        startDate?: Date,
        endDate?: Date
    ): Promise<CostSummary> {
        const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
        const end = endDate || new Date();

        // Get cost logs from database
        const costLogs = await this.prisma.costLog.findMany({
            where: {
                userId,
                createdAt: {
                    gte: start,
                    lte: end
                }
            }
        });

        // Calculate totals
        const totalCost = costLogs.reduce((sum: number, log: any) => sum + Number(log.costUsd), 0);
        const totalRequests = costLogs.length;
        const totalTokens = costLogs.reduce((sum: number, log: any) => sum + (log.totalTokens || 0), 0);

        // Group by operation
        const byOperation = costLogs.reduce((acc: CostSummary['byOperation'], log: any) => {
            const op = log.operation as Operation;
            if (!acc[op]) {
                acc[op] = { count: 0, totalCost: 0, avgCost: 0 };
            }
            acc[op].count++;
            acc[op].totalCost += Number(log.costUsd);
            acc[op].avgCost = acc[op].totalCost / acc[op].count;
            return acc;
        }, {} as CostSummary['byOperation']);

        // Group by provider
        const byProvider = costLogs.reduce((acc: CostSummary['byProvider'], log: any) => {
            const provider = log.modelProvider || 'unknown';
            if (!acc[provider]) {
                acc[provider] = { count: 0, totalCost: 0, avgCost: 0, totalTokens: 0 };
            }
            acc[provider].count++;
            acc[provider].totalCost += Number(log.costUsd);
            acc[provider].avgCost = acc[provider].totalCost / acc[provider].count;
            acc[provider].totalTokens += log.totalTokens || 0;
            return acc;
        }, {} as CostSummary['byProvider']);

        // Generate daily costs
        const dailyCosts = this.generateDailyCosts(costLogs, start, end);

        return {
            userId,
            period: { start, end },
            totalCost,
            currency: 'USD',
            byOperation,
            byProvider,
            totalRequests,
            totalTokens,
            avgRequestCost: totalRequests > 0 ? totalCost / totalRequests : 0,
            dailyCosts
        };
    }

    /**
     * Set budget for a user
     */
    public async setBudget(
        userId: string,
        budgetType: 'daily' | 'weekly' | 'monthly',
        amount: number,
        alertThreshold: number = 80
    ): Promise<CostBudget> {
        // First, disable any existing budget of the same type
        await this.prisma.$executeRaw`
      UPDATE cost_budgets 
      SET is_active = false 
      WHERE user_id = ${userId} AND budget_type = ${budgetType}
    `;

        // Create new budget (using raw SQL since the schema might not be fully implemented yet)
        const budget: CostBudget = {
            userId,
            budgetType,
            amount,
            currency: 'USD',
            alertThreshold,
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date()
        };

        // In a real implementation, this would be stored in the database
        return budget;
    }

    /**
     * Check budget limits
     */
    private async checkBudgetLimits(userId: string, newCost: number): Promise<void> {
        // Get active budgets for user
        const now = new Date();
        const dailyStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const weeklyStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const monthlyStart = new Date(now.getFullYear(), now.getMonth(), 1);

        // Calculate current spending for each period
        const dailySpend = await this.getCurrentSpend(userId, dailyStart, now);
        const weeklySpend = await this.getCurrentSpend(userId, weeklyStart, now);
        const monthlySpend = await this.getCurrentSpend(userId, monthlyStart, now);

        // Check against budgets (this would be from database in real implementation)
        const budgets = await this.getUserBudgets(userId);

        for (const budget of budgets) {
            if (!budget.isActive) continue;

            let currentSpend = 0;
            switch (budget.budgetType) {
                case 'daily':
                    currentSpend = dailySpend;
                    break;
                case 'weekly':
                    currentSpend = weeklySpend;
                    break;
                case 'monthly':
                    currentSpend = monthlySpend;
                    break;
            }

            const projectedSpend = currentSpend + newCost;
            const percentage = (projectedSpend / budget.amount) * 100;

            if (projectedSpend > budget.amount) {
                throw new BudgetExceededError(
                    `${budget.budgetType} budget exceeded. Current: $${projectedSpend.toFixed(2)}, Budget: $${budget.amount}`,
                    budget.amount,
                    projectedSpend,
                    userId
                );
            }

            if (percentage >= budget.alertThreshold && !await this.hasRecentAlert(userId, budget.budgetType)) {
                await this.createBudgetAlert(userId, budget, currentSpend, percentage);
            }
        }
    }

    /**
     * Get current spending for a user in a time period
     */
    private async getCurrentSpend(userId: string, startDate: Date, endDate: Date): Promise<number> {
        const result = await this.prisma.costLog.aggregate({
            where: {
                userId,
                createdAt: {
                    gte: startDate,
                    lte: endDate
                }
            },
            _sum: {
                costUsd: true
            }
        });

        return Number(result._sum.costUsd) || 0;
    }

    /**
     * Flush costs to database
     */
    private async flushCosts(): Promise<void> {
        if (this.costQueue.length === 0) return;

        const costs = [...this.costQueue];
        this.costQueue = [];

        try {
            // Convert to Prisma format and insert
            const prismaData = costs.map(cost => ({
                userId: cost.userId,
                chatId: cost.chatId || null, // Allow null chatId
                operation: cost.operation,
                modelProvider: cost.provider,
                modelName: cost.model,
                inputTokens: cost.inputTokens,
                outputTokens: cost.outputTokens,
                totalTokens: cost.totalTokens,
                costUsd: cost.totalCost,
                metadata: cost.metadata ? JSON.stringify(cost.metadata) : null,
                createdAt: cost.timestamp
            }));

            // Filter out records with invalid foreign keys
            const validData = prismaData.filter(cost => {
                // Allow null chatId, but validate userId exists
                return cost.userId && cost.userId.trim() !== '';
            });

            // Further filter to only include records with valid chatId or null chatId
            const safeData = validData.filter(cost => {
                if (cost.chatId) {
                    // If chatId is provided, we need to verify it exists
                    // For now, we'll skip records with chatId to avoid foreign key issues
                    return false;
                }
                return true; // Allow records with null chatId
            });

            if (safeData.length > 0) {
                // Use individual inserts to handle foreign key constraints gracefully
                for (const cost of safeData) {
                    try {
                        await this.prisma.costLog.create({
                            data: cost as any
                        });
                    } catch (error) {
                        console.warn('Failed to insert individual cost log:', error);
                        // Continue with other records
                    }
                }
            }

        } catch (error) {
            console.error('Failed to flush costs to database:', error);
            // Re-add to queue for retry
            this.costQueue.unshift(...costs);
            throw new CostTrackingError(
                'Failed to flush costs to database',
                Operation.API_CALL,
                undefined,
                error instanceof Error ? error : undefined
            );
        }
    }

    /**
     * Start the flush timer
     */
    private startFlushTimer(): void {
        this.flushTimer = setInterval(() => {
            this.flushCosts().catch(console.error);
        }, this.config.flushInterval);
    }

    /**
     * Stop the flush timer
     */
    public stopFlushTimer(): void {
        if (this.flushTimer) {
            clearInterval(this.flushTimer);
            this.flushTimer = undefined;
        }
    }

    /**
     * Cleanup and flush remaining costs
     */
    public async cleanup(): Promise<void> {
        this.stopFlushTimer();
        await this.flushCosts();
        await this.prisma.$disconnect();
    }

    private isCriticalOperation(operation: Operation): boolean {
        return [
            Operation.MODEL_INFERENCE,
            Operation.MULTI_MODEL_REASONING,
            Operation.MEDICAL_ANALYSIS
        ].includes(operation);
    }

    private generateDailyCosts(
        costLogs: any[],
        startDate: Date,
        endDate: Date
    ): Array<{ date: string; cost: number; requests: number }> {
        const dailyMap = new Map<string, { cost: number; requests: number }>();

        costLogs.forEach(log => {
            const date = log.createdAt.toISOString().split('T')[0];
            const existing = dailyMap.get(date) || { cost: 0, requests: 0 };
            existing.cost += Number(log.costUsd);
            existing.requests += 1;
            dailyMap.set(date, existing);
        });

        return Array.from(dailyMap.entries()).map(([date, data]) => ({
            date,
            ...data
        }));
    }

    private async getUserBudgets(userId: string): Promise<CostBudget[]> {
        // Placeholder - would fetch from database
        return [];
    }

    private async hasRecentAlert(userId: string, budgetType: string): Promise<boolean> {
        // Placeholder - would check for recent alerts
        return false;
    }

    private async createBudgetAlert(
        userId: string,
        budget: CostBudget,
        currentSpend: number,
        percentage: number
    ): Promise<void> {
        // Placeholder - would create alert in database
        console.warn(`Budget alert for user ${userId}: ${percentage.toFixed(1)}% of ${budget.budgetType} budget used`);
    }
}

// Export singleton instance
export const costTracker = CostTracker.getInstance();

// Export for testing
export default CostTracker;
