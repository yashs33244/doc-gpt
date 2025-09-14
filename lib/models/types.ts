/**
 * Model Types and Interfaces for Doctor GPT
 * Defines contracts for AI model providers following Interface Segregation Principle
 */

// Base response structure
export interface ModelResponse {
    content: string;
    finishReason: 'stop' | 'length' | 'content_filter' | 'tool_calls';
    model: string;
    usage: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
    metadata?: Record<string, any>;
}

// Streaming response structure
export interface StreamingModelResponse {
    content: string;
    done: boolean;
    usage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
}

// Message structure
export interface Message {
    role: 'system' | 'user' | 'assistant';
    content: string;
    metadata?: Record<string, any>;
}

// Model configuration
export interface ModelConfig {
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    frequencyPenalty?: number;
    presencePenalty?: number;
    stop?: string[];
}

// Medical context for healthcare-specific responses
export interface MedicalContext {
    patientAge?: number;
    patientGender?: 'male' | 'female' | 'other';
    medicalHistory?: string[];
    currentSymptoms?: string[];
    medications?: string[];
    allergies?: string[];
    urgencyLevel?: 'low' | 'medium' | 'high' | 'emergency';
}

// Citation structure for medical responses
export interface Citation {
    id: string;
    title: string;
    url: string;
    source: string; // e.g., "PubMed", "NIH", "Mayo Clinic"
    publicationDate?: string;
    authors?: string[];
    relevanceScore?: number;
    snippet?: string;
}

// Enhanced response for medical queries
export interface MedicalResponse extends ModelResponse {
    citations: Citation[];
    confidence: number; // 0-1 confidence score
    medicalDisclaimer: string;
    riskAssessment?: {
        level: 'low' | 'medium' | 'high';
        factors: string[];
    };
    recommendedActions?: string[];
}

// Cost information
export interface CostInfo {
    inputCost: number;
    outputCost: number;
    totalCost: number;
    currency: string;
    provider: string;
}

// Provider interface - each AI provider must implement this
export interface AIModelProvider {
    name: string;
    models: string[];

    // Standard completion
    complete(
        messages: Message[],
        config?: ModelConfig,
        medicalContext?: MedicalContext
    ): Promise<ModelResponse>;

    // Streaming completion
    streamComplete(
        messages: Message[],
        config?: ModelConfig,
        medicalContext?: MedicalContext
    ): AsyncGenerator<StreamingModelResponse>;

    // Medical-specific completion with citations
    medicalComplete(
        messages: Message[],
        config?: ModelConfig,
        medicalContext?: MedicalContext
    ): Promise<MedicalResponse>;

    // Calculate cost for a request
    calculateCost(usage: ModelResponse['usage']): CostInfo;

    // Health check
    isAvailable(): Promise<boolean>;

    // Get model capabilities
    getCapabilities(model: string): ModelCapabilities;
}

// Model capabilities
export interface ModelCapabilities {
    maxTokens: number;
    supportsStreaming: boolean;
    supportsFunctionCalling: boolean;
    supportsVision: boolean;
    contextWindow: number;
    isMultimodal: boolean;
    specializations: string[]; // e.g., ["medical", "coding", "reasoning"]
}

// Model provider registry entry
export interface ModelProviderConfig {
    provider: AIModelProvider;
    enabled: boolean;
    priority: number; // For multi-model reasoning order
    rateLimits: {
        requestsPerMinute: number;
        tokensPerMinute: number;
    };
    costPerToken: {
        input: number;
        output: number;
    };
}

// Multi-model reasoning result
export interface MultiModelResult {
    responses: Array<{
        provider: string;
        model: string;
        response: ModelResponse;
        cost: CostInfo;
        responseTime: number;
    }>;
    consensus?: {
        agreedContent: string;
        confidence: number;
        disagreements: string[];
    };
    finalResponse: MedicalResponse;
    totalCost: CostInfo;
}

// Error types
export class ModelProviderError extends Error {
    constructor(
        message: string,
        public provider: string,
        public model: string,
        public originalError?: Error
    ) {
        super(message);
        this.name = 'ModelProviderError';
    }
}

export class RateLimitError extends ModelProviderError {
    constructor(provider: string, model: string, retryAfter?: number) {
        super(`Rate limit exceeded for ${provider}:${model}`, provider, model);
        this.name = 'RateLimitError';
        this.retryAfter = retryAfter;
    }

    retryAfter?: number;
}

export class InsufficientQuotaError extends ModelProviderError {
    constructor(provider: string, model: string) {
        super(`Insufficient quota for ${provider}:${model}`, provider, model);
        this.name = 'InsufficientQuotaError';
    }
}
