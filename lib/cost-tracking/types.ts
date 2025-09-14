/**
 * Cost Tracking Types for Doctor GPT
 * Comprehensive tracking of all system costs and usage
 */

export interface CostEntry {
    id: string;
    userId: string;
    sessionId?: string;
    chatId?: string;

    // Operation details
    operation: Operation;
    provider: string;
    model?: string;

    // Token usage
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;

    // Cost breakdown
    inputCost: number;
    outputCost: number;
    totalCost: number;
    currency: string;

    // Additional context
    metadata?: Record<string, any>;
    timestamp: Date;
}

export interface CostSummary {
    userId: string;
    period: {
        start: Date;
        end: Date;
    };

    // Total costs
    totalCost: number;
    currency: string;

    // Breakdown by operation
    byOperation: Record<Operation, {
        count: number;
        totalCost: number;
        avgCost: number;
    }>;

    // Breakdown by provider
    byProvider: Record<string, {
        count: number;
        totalCost: number;
        avgCost: number;
        totalTokens: number;
    }>;

    // Usage statistics
    totalRequests: number;
    totalTokens: number;
    avgRequestCost: number;

    // Trends
    dailyCosts?: Array<{
        date: string;
        cost: number;
        requests: number;
    }>;
}

export interface CostBudget {
    userId: string;
    budgetType: 'daily' | 'weekly' | 'monthly';
    amount: number;
    currency: string;
    alertThreshold: number; // Percentage (0-100) when to alert
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export interface CostAlert {
    id: string;
    userId: string;
    budgetId: string;
    alertType: 'threshold' | 'exceeded' | 'limit_reached';
    currentSpend: number;
    budgetAmount: number;
    percentage: number;
    message: string;
    isRead: boolean;
    createdAt: Date;
}

export enum Operation {
    CHAT_COMPLETION = 'CHAT_COMPLETION',
    EMBEDDING_GENERATION = 'EMBEDDING_GENERATION',
    VECTOR_SEARCH = 'VECTOR_SEARCH',
    WEB_SEARCH = 'WEB_SEARCH',
    FILE_PROCESSING = 'FILE_PROCESSING',
    MODEL_INFERENCE = 'MODEL_INFERENCE',
    API_CALL = 'API_CALL',
    MULTI_MODEL_REASONING = 'MULTI_MODEL_REASONING',
    MEDICAL_ANALYSIS = 'MEDICAL_ANALYSIS',
    CITATION_LOOKUP = 'CITATION_LOOKUP'
}

export interface CostTrackingConfig {
    enabled: boolean;
    flushInterval: number; // milliseconds
    batchSize: number;
    enableRealTimeAlerts: boolean;
    enableBudgetTracking: boolean;
    defaultCurrency: string;
    costSources: {
        openai: CostSourceConfig;
        anthropic: CostSourceConfig;
        tavily: CostSourceConfig;
        vector_db: CostSourceConfig;
    };
}

export interface CostSourceConfig {
    enabled: boolean;
    provider: string;
    costPerUnit: number;
    unit: 'token' | 'request' | 'mb' | 'query';
    currency: string;
}

export interface CostTrackingMetrics {
    totalCost: number;
    totalRequests: number;
    avgCostPerRequest: number;
    topCostOperations: Array<{
        operation: Operation;
        cost: number;
        percentage: number;
    }>;
    topCostProviders: Array<{
        provider: string;
        cost: number;
        percentage: number;
    }>;
    costTrend: 'increasing' | 'decreasing' | 'stable';
    projectedMonthlyCost: number;
}

export class CostTrackingError extends Error {
    constructor(
        message: string,
        public operation: Operation,
        public userId?: string,
        public originalError?: Error
    ) {
        super(message);
        this.name = 'CostTrackingError';
    }
}

export class BudgetExceededError extends CostTrackingError {
    constructor(
        message: string,
        public budgetAmount: number,
        public currentSpend: number,
        public userId: string
    ) {
        super(message, Operation.API_CALL, userId);
        this.name = 'BudgetExceededError';
    }
}
