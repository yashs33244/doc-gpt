/**
 * LangGraph Workflow Types for Doctor GPT
 * Defines state and node types for medical document processing and reasoning
 */

import { Citation, MedicalContext, MedicalResponse } from '../models/types';
import { TavilyResult } from '../search/tavily';
import { MedicalQueryResponse } from '../medical/medical-data-service';

// Core workflow state
export interface DoctorGPTState {
    // Input data
    userQuery: string;
    userId: string;
    sessionId: string;
    chatId?: string;

    // Medical context
    medicalContext?: MedicalContext;
    uploadedDocuments?: UploadedDocument[];
    medicalQueryResult?: MedicalQueryResponse;

    // Processing stages
    processedQuery?: ProcessedQuery;
    retrievedDocuments?: RetrievedDocument[];
    searchResults?: TavilyResult[];
    modelResponses?: ModelResponseEntry[];

    // Final output
    finalResponse?: MedicalResponse;
    citations?: Citation[];
    confidence?: number;

    // Workflow control
    currentNode: string;
    nextNode?: string;
    errors?: WorkflowError[];
    metadata?: Record<string, any>;
}

// Document types
export interface UploadedDocument {
    id: string;
    fileName: string;
    fileType: string;
    content: string;
    extractedText: string;
    embedding?: number[];
    reportType?: string;
    processingStatus: 'pending' | 'processing' | 'completed' | 'failed';
    metadata?: Record<string, any>;
}

export interface RetrievedDocument {
    id: string;
    content: string;
    similarity: number;
    source: string;
    metadata?: Record<string, any>;
}

// Query processing
export interface ProcessedQuery {
    originalQuery: string;
    enhancedQuery: string;
    intent: QueryIntent;
    medicalEntities: MedicalEntity[];
    urgencyLevel: 'low' | 'medium' | 'high' | 'emergency';
    requiresCitation: boolean;
    suggestedSearchTerms: string[];
}

export interface QueryIntent {
    type: 'symptom_inquiry' | 'medication_question' | 'diagnosis_explanation' | 'treatment_options' | 'general_medical' | 'document_analysis';
    confidence: number;
    specialization?: string;
}

export interface MedicalEntity {
    text: string;
    type: 'symptom' | 'condition' | 'medication' | 'procedure' | 'anatomy' | 'test';
    confidence: number;
    alternativeNames?: string[];
}

// Model responses
export interface ModelResponseEntry {
    provider: string;
    model: string;
    response: MedicalResponse;
    responseTime: number;
    cost: number;
    confidence: number;
    reasoning?: string;
}

// Workflow nodes
export type WorkflowNode =
    | 'start'
    | 'query_analysis'
    | 'document_retrieval'
    | 'web_search'
    | 'multi_model_reasoning'
    | 'response_validation'
    | 'citation_enhancement'
    | 'quality_check'
    | 'cost_tracking'
    | 'end'
    | 'error_handler';

// Node configurations
export interface NodeConfig {
    name: WorkflowNode;
    enabled: boolean;
    timeout: number;
    retryCount: number;
    dependencies?: WorkflowNode[];
    conditions?: NodeCondition[];
}

export interface NodeCondition {
    field: keyof DoctorGPTState;
    operator: 'exists' | 'equals' | 'greater_than' | 'less_than' | 'contains';
    value?: any;
}

// Workflow errors
export interface WorkflowError {
    node: WorkflowNode;
    error: string;
    timestamp: Date;
    retryable: boolean;
    metadata?: Record<string, any>;
}

// Node result types
export interface NodeResult<T = any> {
    success: boolean;
    data?: T;
    error?: string;
    metadata?: Record<string, any>;
    nextNode?: WorkflowNode;
}

// Workflow configuration
export interface WorkflowConfig {
    name: string;
    version: string;
    description: string;
    nodes: Record<WorkflowNode, NodeConfig>;
    edges: WorkflowEdge[];
    timeout: number;
    maxRetries: number;
    enableCaching: boolean;
    enableCostTracking: boolean;
    enableLogging: boolean;
}

export interface WorkflowEdge {
    from: WorkflowNode;
    to: WorkflowNode;
    condition?: (state: DoctorGPTState) => boolean;
    weight?: number;
}

// Specific node inputs/outputs
export interface QueryAnalysisInput {
    userQuery: string;
    medicalContext?: MedicalContext;
    previousContext?: string[];
}

export interface QueryAnalysisOutput {
    processedQuery: ProcessedQuery;
    searchStrategy: SearchStrategy;
    modelStrategy: ModelStrategy;
}

export interface SearchStrategy {
    useVectorSearch: boolean;
    useWebSearch: boolean;
    vectorSearchParams: {
        similarityThreshold: number;
        maxResults: number;
        filters?: Record<string, any>;
    };
    webSearchParams: {
        maxResults: number;
        domains?: string[];
        timeframe?: string;
    };
}

export interface ModelStrategy {
    providers: string[];
    parallel: boolean;
    fallbackOrder: string[];
    consensusRequired: boolean;
    minimumConfidence: number;
}

export interface DocumentRetrievalInput {
    processedQuery: ProcessedQuery;
    searchStrategy: SearchStrategy;
    uploadedDocuments?: UploadedDocument[];
}

export interface DocumentRetrievalOutput {
    retrievedDocuments: RetrievedDocument[];
    searchMetrics: {
        totalSearched: number;
        totalRetrieved: number;
        avgSimilarity: number;
        searchTime: number;
    };
}

export interface WebSearchInput {
    processedQuery: ProcessedQuery;
    searchStrategy: SearchStrategy;
    existingCitations?: Citation[];
}

export interface WebSearchOutput {
    searchResults: TavilyResult[];
    citations: Citation[];
    searchMetrics: {
        totalQueries: number;
        totalResults: number;
        avgRelevance: number;
        searchTime: number;
    };
}

export interface MultiModelReasoningInput {
    userQuery: string;
    processedQuery: ProcessedQuery;
    retrievedDocuments: RetrievedDocument[];
    searchResults?: TavilyResult[];
    medicalContext?: MedicalContext;
    modelStrategy: ModelStrategy;
}

export interface MultiModelReasoningOutput {
    modelResponses: ModelResponseEntry[];
    consensus?: {
        agreement: number;
        disagreements: string[];
        mergedResponse: string;
    };
    totalCost: number;
    responseTime: number;
}

export interface ResponseValidationInput {
    modelResponses: ModelResponseEntry[];
    citations: Citation[];
    originalQuery: string;
    medicalContext?: MedicalContext;
}

export interface ResponseValidationOutput {
    validatedResponse: MedicalResponse;
    validationMetrics: {
        factualAccuracy: number;
        citationQuality: number;
        medicalSafety: number;
        completeness: number;
    };
    flaggedIssues: ValidationIssue[];
}

export interface ValidationIssue {
    type: 'safety' | 'accuracy' | 'citation' | 'completeness';
    severity: 'low' | 'medium' | 'high' | 'critical';
    description: string;
    suggestion?: string;
}

// Workflow execution context
export interface WorkflowContext {
    workflowId: string;
    userId: string;
    sessionId: string;
    startTime: Date;
    config: WorkflowConfig;
    state: DoctorGPTState;
    executionHistory: WorkflowExecution[];
}

export interface WorkflowExecution {
    node: WorkflowNode;
    startTime: Date;
    endTime?: Date;
    result?: NodeResult;
    error?: WorkflowError;
    metadata?: Record<string, any>;
}

// Event types for workflow monitoring
export interface WorkflowEvent {
    type: 'workflow_started' | 'node_started' | 'node_completed' | 'node_failed' | 'workflow_completed' | 'workflow_failed';
    workflowId: string;
    node?: WorkflowNode;
    timestamp: Date;
    data?: any;
    error?: string;
}
