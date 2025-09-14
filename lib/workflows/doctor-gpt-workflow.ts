/**
 * Doctor GPT LangGraph Workflow
 * Orchestrates medical document processing, RAG retrieval, and multi-model reasoning
 */

import {
    StateGraph,
    START,
    END,
    Annotation
} from '@langchain/langgraph';
import { modelRepository } from '../models/repository';
import { tavilySearch } from '../search/tavily';
import { costTracker } from '../cost-tracking/tracker';
import { Operation } from '../cost-tracking/types';
import {
    DoctorGPTState,
    WorkflowNode,
    NodeResult,
    QueryAnalysisInput,
    QueryAnalysisOutput,
    DocumentRetrievalInput,
    DocumentRetrievalOutput,
    WebSearchInput,
    WebSearchOutput,
    MultiModelReasoningInput,
    MultiModelReasoningOutput,
    ResponseValidationInput,
    ResponseValidationOutput,
    ProcessedQuery,
    QueryIntent,
    MedicalEntity,
    ModelResponseEntry,
    ValidationIssue
} from './types';
import { MedicalResponse, Citation } from '../models/types';

// Define the state annotation for LangGraph
const StateAnnotation = Annotation.Root({
    userQuery: Annotation<string>,
    userId: Annotation<string>,
    sessionId: Annotation<string>,
    chatId: Annotation<string>,
    medicalContext: Annotation<any>,
    uploadedDocuments: Annotation<any[]>,
    processedQuery: Annotation<any>,
    retrievedDocuments: Annotation<any[]>,
    searchResults: Annotation<any[]>,
    modelResponses: Annotation<any[]>,
    finalResponse: Annotation<any>,
    citations: Annotation<any[]>,
    confidence: Annotation<number>,
    currentNode: Annotation<string>,
    nextNode: Annotation<string>,
    errors: Annotation<any[]>,
    metadata: Annotation<any>
});

export class DoctorGPTWorkflow {
    private graph: ReturnType<typeof this.buildGraph>;

    constructor() {
        this.graph = this.buildGraph();
    }

    private buildGraph() {
        const builder = new StateGraph(StateAnnotation)
            .addNode('query_analysis', this.queryAnalysisNode.bind(this))
            .addNode('document_retrieval', this.documentRetrievalNode.bind(this))
            .addNode('web_search', this.webSearchNode.bind(this))
            .addNode('multi_model_reasoning', this.multiModelReasoningNode.bind(this))
            .addNode('response_validation', this.responseValidationNode.bind(this))
            .addNode('citation_enhancement', this.citationEnhancementNode.bind(this))
            .addNode('quality_check', this.qualityCheckNode.bind(this))
            .addNode('cost_tracking', this.costTrackingNode.bind(this))
            .addNode('error_handler', this.errorHandlerNode.bind(this));

        // Define the workflow edges
        builder
            .addEdge(START, 'query_analysis')
            .addConditionalEdges(
                'query_analysis',
                this.routeAfterQueryAnalysis.bind(this),
                {
                    'document_retrieval': 'document_retrieval',
                    'web_search': 'web_search',
                    'multi_model_reasoning': 'multi_model_reasoning',
                    'error': 'error_handler'
                }
            )
            .addConditionalEdges(
                'document_retrieval',
                this.routeAfterDocumentRetrieval.bind(this),
                {
                    'web_search': 'web_search',
                    'multi_model_reasoning': 'multi_model_reasoning',
                    'error': 'error_handler'
                }
            )
            .addEdge('web_search', 'multi_model_reasoning')
            .addEdge('multi_model_reasoning', 'response_validation')
            .addEdge('response_validation', 'citation_enhancement')
            .addEdge('citation_enhancement', 'quality_check')
            .addEdge('quality_check', 'cost_tracking')
            .addEdge('cost_tracking', END)
            .addEdge('error_handler', END);

        return builder.compile();
    }

    /**
     * Execute the workflow
     */
    public async execute(initialState: Partial<DoctorGPTState>): Promise<DoctorGPTState> {
        const startTime = Date.now();

        try {
            const fullState: DoctorGPTState = {
                userQuery: '',
                userId: '',
                sessionId: '',
                currentNode: 'start',
                errors: [],
                metadata: {
                    startTime,
                    workflowVersion: '1.0.0'
                },
                ...initialState
            } as DoctorGPTState;

            console.log('Starting Doctor GPT workflow for user:', fullState.userId);

            const result = await this.graph.invoke(fullState);

            const endTime = Date.now();
            const executionTime = endTime - startTime;

            console.log(`Workflow completed in ${executionTime}ms`);

            return {
                ...result,
                metadata: {
                    ...result.metadata,
                    endTime,
                    executionTime
                }
            };

        } catch (error) {
            console.error('Workflow execution failed:', error);
            throw error;
        }
    }

    /**
     * Query Analysis Node
     * Analyzes user query to determine intent, extract entities, and plan execution
     */
    private async queryAnalysisNode(state: DoctorGPTState): Promise<Partial<DoctorGPTState>> {
        console.log('Executing query analysis node');

        try {
            const input: QueryAnalysisInput = {
                userQuery: state.userQuery,
                medicalContext: state.medicalContext
            };

            // Enhanced query processing using AI
            const enhancedQuery = await this.enhanceQuery(input.userQuery);
            const intent = await this.detectIntent(input.userQuery);
            const entities = await this.extractMedicalEntities(input.userQuery);
            const urgencyLevel = this.assessUrgency(input.userQuery, entities);

            const processedQuery: ProcessedQuery = {
                originalQuery: input.userQuery,
                enhancedQuery,
                intent,
                medicalEntities: entities,
                urgencyLevel,
                requiresCitation: this.requiresCitation(intent),
                suggestedSearchTerms: this.generateSearchTerms(entities, intent)
            };

            return {
                processedQuery,
                currentNode: 'query_analysis',
                nextNode: this.determineNextNodeAfterAnalysis(processedQuery)
            };

        } catch (error) {
            console.error('Query analysis failed:', error);
            return {
                currentNode: 'query_analysis',
                nextNode: 'error_handler',
                errors: [...(state.errors || []), {
                    node: 'query_analysis',
                    error: error instanceof Error ? error.message : 'Unknown error',
                    timestamp: new Date(),
                    retryable: true
                }]
            };
        }
    }

    /**
     * Document Retrieval Node
     * Retrieves relevant documents from vector database and uploaded documents
     */
    private async documentRetrievalNode(state: DoctorGPTState): Promise<Partial<DoctorGPTState>> {
        console.log('Executing document retrieval node');

        try {
            if (!state.processedQuery) {
                throw new Error('Processed query not available');
            }

            let retrievedDocuments = [];

            // First, check if there are uploaded documents to use
            if (state.uploadedDocuments && state.uploadedDocuments.length > 0) {
                console.log(`Using ${state.uploadedDocuments.length} uploaded documents`);
                retrievedDocuments = state.uploadedDocuments.map(doc => ({
                    id: doc.id,
                    fileName: doc.fileName,
                    content: doc.content || doc.extractedText,
                    source: 'uploaded',
                    relevanceScore: 1.0, // High relevance since user specifically uploaded these
                    metadata: {
                        fileType: doc.fileType || 'unknown',
                        reportType: doc.reportType || 'other',
                        processingStatus: doc.processingStatus || 'COMPLETED'
                    }
                }));
            } else {
                // Fallback to vector search if no uploaded documents
                console.log('No uploaded documents, performing vector search');
                retrievedDocuments = await this.performVectorSearch(
                    state.processedQuery.enhancedQuery,
                    state.userId
                );
            }

            return {
                retrievedDocuments,
                currentNode: 'document_retrieval',
                nextNode: this.determineNextNodeAfterRetrieval(state.processedQuery, retrievedDocuments)
            };

        } catch (error) {
            console.error('Document retrieval failed:', error);
            return {
                currentNode: 'document_retrieval',
                nextNode: 'error_handler',
                errors: [...(state.errors || []), {
                    node: 'document_retrieval',
                    error: error instanceof Error ? error.message : 'Unknown error',
                    timestamp: new Date(),
                    retryable: true
                }]
            };
        }
    }

    /**
     * Web Search Node
     * Searches for relevant medical information using Tavily
     */
    private async webSearchNode(state: DoctorGPTState): Promise<Partial<DoctorGPTState>> {
        console.log('Executing web search node');

        try {
            if (!state.processedQuery) {
                throw new Error('Processed query not available');
            }

            const searchResults = await tavilySearch.searchMedical(
                state.processedQuery.enhancedQuery,
                state.userId,
                {
                    specialization: state.processedQuery.medicalEntities.find(e => e.type === 'condition')?.text as any,
                    evidenceLevel: 'systematic_review',
                    sourcePreference: 'pubmed'
                },
                {
                    maxResults: 10,
                    searchDepth: 'advanced'
                },
                state.sessionId,
                state.chatId
            );

            const citations = tavilySearch.convertToCitations(searchResults.results);

            return {
                searchResults: searchResults.results,
                citations,
                currentNode: 'web_search',
                nextNode: 'multi_model_reasoning'
            };

        } catch (error) {
            console.error('Web search failed:', error);
            return {
                currentNode: 'web_search',
                nextNode: 'error_handler',
                errors: [...(state.errors || []), {
                    node: 'web_search',
                    error: error instanceof Error ? error.message : 'Unknown error',
                    timestamp: new Date(),
                    retryable: true
                }]
            };
        }
    }

    /**
     * Multi-Model Reasoning Node
     * Gets responses from multiple AI providers and merges them
     */
    private async multiModelReasoningNode(state: DoctorGPTState): Promise<Partial<DoctorGPTState>> {
        console.log('Executing multi-model reasoning node');

        try {
            if (!state.processedQuery) {
                throw new Error('Processed query not available');
            }

            // Prepare context for models
            const context = this.prepareModelContext(state);
            console.log('Multi-model reasoning context:', context);
            console.log('Retrieved documents:', state.retrievedDocuments);

            // Get responses from multiple models
            const systemMessage = context
                ? `You are a medical AI assistant. Provide accurate, evidence-based information.\n\nContext from uploaded documents:\n${context}`
                : 'You are a medical AI assistant. Provide accurate, evidence-based information.';

            console.log('System message for AI:', systemMessage);

            const multiModelResult = await modelRepository.multiModelReasoning(
                [
                    { role: 'system', content: systemMessage },
                    { role: 'user', content: state.userQuery }
                ],
                {
                    temperature: 0.7,
                    maxTokens: 2000
                },
                state.medicalContext,
                ['openai', 'anthropic'] // Use both providers
            );

            const modelResponses: ModelResponseEntry[] = multiModelResult.responses.map(response => ({
                provider: response.provider,
                model: response.model,
                response: response.response as MedicalResponse,
                responseTime: response.responseTime,
                cost: response.cost.totalCost,
                confidence: (response.response as MedicalResponse).confidence || 0.8
            }));

            return {
                modelResponses,
                finalResponse: multiModelResult.finalResponse,
                currentNode: 'multi_model_reasoning',
                nextNode: 'response_validation',
                metadata: {
                    ...state.metadata,
                    totalCost: multiModelResult.totalCost.totalCost,
                    consensus: multiModelResult.consensus
                }
            };

        } catch (error) {
            console.error('Multi-model reasoning failed:', error);
            return {
                currentNode: 'multi_model_reasoning',
                nextNode: 'error_handler',
                errors: [...(state.errors || []), {
                    node: 'multi_model_reasoning',
                    error: error instanceof Error ? error.message : 'Unknown error',
                    timestamp: new Date(),
                    retryable: true
                }]
            };
        }
    }

    /**
     * Response Validation Node
     * Validates the response for medical accuracy and safety
     */
    private async responseValidationNode(state: DoctorGPTState): Promise<Partial<DoctorGPTState>> {
        console.log('Executing response validation node');

        try {
            if (!state.finalResponse || !state.modelResponses) {
                throw new Error('Response data not available for validation');
            }

            const validationIssues = await this.validateMedicalResponse(
                state.finalResponse,
                state.modelResponses,
                state.processedQuery!
            );

            // Calculate validation metrics
            const validationMetrics = {
                factualAccuracy: this.calculateFactualAccuracy(state.finalResponse, state.citations || []),
                citationQuality: this.calculateCitationQuality(state.citations || []),
                medicalSafety: this.calculateMedicalSafety(state.finalResponse, validationIssues),
                completeness: this.calculateCompleteness(state.finalResponse, state.userQuery)
            };

            return {
                currentNode: 'response_validation',
                nextNode: 'citation_enhancement',
                metadata: {
                    ...state.metadata,
                    validationMetrics,
                    validationIssues
                }
            };

        } catch (error) {
            console.error('Response validation failed:', error);
            return {
                currentNode: 'response_validation',
                nextNode: 'error_handler',
                errors: [...(state.errors || []), {
                    node: 'response_validation',
                    error: error instanceof Error ? error.message : 'Unknown error',
                    timestamp: new Date(),
                    retryable: false
                }]
            };
        }
    }

    /**
     * Citation Enhancement Node
     * Enhances citations with additional metadata and verification
     */
    private async citationEnhancementNode(state: DoctorGPTState): Promise<Partial<DoctorGPTState>> {
        console.log('Executing citation enhancement node');

        try {
            const enhancedCitations = await this.enhanceCitations(state.citations || []);

            // Update final response with enhanced citations
            const enhancedFinalResponse: MedicalResponse = {
                ...state.finalResponse!,
                citations: enhancedCitations
            };

            return {
                citations: enhancedCitations,
                finalResponse: enhancedFinalResponse,
                currentNode: 'citation_enhancement',
                nextNode: 'quality_check'
            };

        } catch (error) {
            console.error('Citation enhancement failed:', error);
            return {
                currentNode: 'citation_enhancement',
                nextNode: 'quality_check', // Continue even if citation enhancement fails
                errors: [...(state.errors || []), {
                    node: 'citation_enhancement',
                    error: error instanceof Error ? error.message : 'Unknown error',
                    timestamp: new Date(),
                    retryable: false
                }]
            };
        }
    }

    /**
     * Quality Check Node
     * Final quality assessment of the response
     */
    private async qualityCheckNode(state: DoctorGPTState): Promise<Partial<DoctorGPTState>> {
        console.log('Executing quality check node');

        try {
            const qualityScore = this.calculateQualityScore(state);
            const qualityIssues = this.identifyQualityIssues(state);

            return {
                currentNode: 'quality_check',
                nextNode: 'cost_tracking',
                confidence: qualityScore,
                metadata: {
                    ...state.metadata,
                    qualityScore,
                    qualityIssues
                }
            };

        } catch (error) {
            console.error('Quality check failed:', error);
            return {
                currentNode: 'quality_check',
                nextNode: 'cost_tracking',
                errors: [...(state.errors || []), {
                    node: 'quality_check',
                    error: error instanceof Error ? error.message : 'Unknown error',
                    timestamp: new Date(),
                    retryable: false
                }]
            };
        }
    }

    /**
     * Cost Tracking Node
     * Final cost tracking and budget validation
     */
    private async costTrackingNode(state: DoctorGPTState): Promise<Partial<DoctorGPTState>> {
        console.log('Executing cost tracking node');

        try {
            // Aggregate all costs from the workflow
            const totalCost = this.calculateTotalWorkflowCost(state);

            // Log the workflow completion cost
            await costTracker.trackCost({
                userId: state.userId,
                sessionId: state.sessionId,
                chatId: state.chatId,
                operation: Operation.MEDICAL_ANALYSIS,
                provider: 'workflow',
                inputCost: 0,
                outputCost: totalCost,
                totalCost,
                currency: 'USD',
                metadata: {
                    workflowNodes: state.metadata?.executedNodes,
                    totalResponseTime: state.metadata?.executionTime,
                    modelProviders: state.modelResponses?.map(r => r.provider)
                }
            });

            return {
                currentNode: 'cost_tracking',
                nextNode: 'end',
                metadata: {
                    ...state.metadata,
                    totalWorkflowCost: totalCost
                }
            };

        } catch (error) {
            console.error('Cost tracking failed:', error);
            return {
                currentNode: 'cost_tracking',
                nextNode: 'end', // End workflow even if cost tracking fails
                errors: [...(state.errors || []), {
                    node: 'cost_tracking',
                    error: error instanceof Error ? error.message : 'Unknown error',
                    timestamp: new Date(),
                    retryable: false
                }]
            };
        }
    }

    /**
     * Error Handler Node
     * Handles workflow errors and provides fallback responses
     */
    private async errorHandlerNode(state: DoctorGPTState): Promise<Partial<DoctorGPTState>> {
        console.log('Executing error handler node');

        try {
            const errorSummary = this.summarizeErrors(state.errors || []);

            // Create a fallback response
            const fallbackResponse: MedicalResponse = {
                content: "I apologize, but I encountered an issue processing your medical query. Please try rephrasing your question or consult with a healthcare professional for immediate assistance.",
                finishReason: 'stop',
                model: 'error-fallback',
                usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
                citations: [],
                confidence: 0.1,
                medicalDisclaimer: "This is a system error response. Please consult a healthcare professional for medical advice."
            };

            return {
                finalResponse: fallbackResponse,
                currentNode: 'error_handler',
                nextNode: 'end',
                metadata: {
                    ...state.metadata,
                    errorSummary,
                    fallbackUsed: true
                }
            };

        } catch (error) {
            console.error('Error handler failed:', error);
            return {
                currentNode: 'error_handler',
                nextNode: 'end'
            };
        }
    }

    // Routing functions
    private routeAfterQueryAnalysis(state: DoctorGPTState): string {
        if (state.errors && state.errors.length > 0) return 'error';
        if (state.uploadedDocuments && state.uploadedDocuments.length > 0) return 'document_retrieval';
        if (state.processedQuery?.requiresCitation) return 'web_search';
        return 'multi_model_reasoning';
    }

    private routeAfterDocumentRetrieval(state: DoctorGPTState): string {
        if (state.errors && state.errors.length > 0) return 'error';
        if (state.processedQuery?.requiresCitation) return 'web_search';
        return 'multi_model_reasoning';
    }

    // Helper methods
    private async enhanceQuery(query: string): Promise<string> {
        // Simple enhancement - in production, this would use NLP
        return query + ' medical evidence clinical guidelines';
    }

    private async detectIntent(query: string): Promise<QueryIntent> {
        // Simple intent detection - in production, this would use ML models
        if (query.toLowerCase().includes('symptom')) {
            return { type: 'symptom_inquiry', confidence: 0.8 };
        } else if (query.toLowerCase().includes('medication') || query.toLowerCase().includes('drug')) {
            return { type: 'medication_question', confidence: 0.8 };
        } else if (query.toLowerCase().includes('treatment')) {
            return { type: 'treatment_options', confidence: 0.8 };
        }
        return { type: 'general_medical', confidence: 0.6 };
    }

    private async extractMedicalEntities(query: string): Promise<MedicalEntity[]> {
        // Simple entity extraction - in production, this would use NER models
        const entities: MedicalEntity[] = [];

        // Basic pattern matching for demonstration
        const symptoms = ['pain', 'fever', 'headache', 'nausea', 'fatigue'];
        const conditions = ['diabetes', 'hypertension', 'covid', 'flu', 'cancer'];

        symptoms.forEach(symptom => {
            if (query.toLowerCase().includes(symptom)) {
                entities.push({
                    text: symptom,
                    type: 'symptom',
                    confidence: 0.8
                });
            }
        });

        conditions.forEach(condition => {
            if (query.toLowerCase().includes(condition)) {
                entities.push({
                    text: condition,
                    type: 'condition',
                    confidence: 0.8
                });
            }
        });

        return entities;
    }

    private assessUrgency(query: string, entities: MedicalEntity[]): 'low' | 'medium' | 'high' | 'emergency' {
        const urgentTerms = ['emergency', 'urgent', 'severe', 'acute', 'chest pain', 'difficulty breathing'];
        const highTerms = ['pain', 'severe', 'worsening'];

        if (urgentTerms.some(term => query.toLowerCase().includes(term))) {
            return 'emergency';
        } else if (highTerms.some(term => query.toLowerCase().includes(term))) {
            return 'high';
        }
        return 'medium';
    }

    private requiresCitation(intent: QueryIntent): boolean {
        return ['treatment_options', 'medication_question', 'diagnosis_explanation'].includes(intent.type);
    }

    private generateSearchTerms(entities: MedicalEntity[], intent: QueryIntent): string[] {
        const terms = entities.map(e => e.text);
        terms.push(intent.type.replace('_', ' '));
        return terms;
    }

    private determineNextNodeAfterAnalysis(processedQuery: ProcessedQuery): string {
        if (processedQuery.urgencyLevel === 'emergency') {
            return 'multi_model_reasoning'; // Skip retrieval for urgent queries
        }
        return 'document_retrieval';
    }

    private determineNextNodeAfterRetrieval(processedQuery: ProcessedQuery, documents: any[]): string {
        if (documents.length === 0 || processedQuery.requiresCitation) {
            return 'web_search';
        }
        return 'multi_model_reasoning';
    }

    private async performVectorSearch(query: string, userId: string): Promise<any[]> {
        // Placeholder for vector search implementation
        return [];
    }

    private prepareModelContext(state: DoctorGPTState): string {
        let context = '';

        if (state.retrievedDocuments?.length) {
            context += 'Retrieved documents:\n';
            state.retrievedDocuments.forEach((doc, i) => {
                const content = doc.content || doc.payload?.content || 'No content available';
                context += `${i + 1}. ${content.substring(0, 200)}...\n`;
            });
        }

        if (state.searchResults?.length) {
            context += '\nWeb search results:\n';
            state.searchResults.forEach((result, i) => {
                context += `${i + 1}. ${result.title}: ${result.content.substring(0, 200)}...\n`;
            });
        }

        return context;
    }

    private async validateMedicalResponse(
        response: MedicalResponse,
        modelResponses: ModelResponseEntry[],
        processedQuery: ProcessedQuery
    ): Promise<ValidationIssue[]> {
        const issues: ValidationIssue[] = [];

        // Check for safety issues
        if (response.content.toLowerCase().includes('diagnose') || response.content.toLowerCase().includes('diagnosis')) {
            issues.push({
                type: 'safety',
                severity: 'high',
                description: 'Response appears to provide medical diagnosis',
                suggestion: 'Rephrase to avoid direct diagnosis and recommend professional consultation'
            });
        }

        return issues;
    }

    private calculateFactualAccuracy(response: MedicalResponse, citations: Citation[]): number {
        // Placeholder implementation
        return citations.length > 0 ? 0.9 : 0.6;
    }

    private calculateCitationQuality(citations: Citation[]): number {
        if (citations.length === 0) return 0;

        const qualityScore = citations.reduce((sum, citation) => {
            const score = tavilySearch.getSourceReliabilityScore(citation.url);
            return sum + score;
        }, 0) / citations.length;

        return qualityScore;
    }

    private calculateMedicalSafety(response: MedicalResponse, issues: ValidationIssue[]): number {
        const criticalIssues = issues.filter(i => i.severity === 'critical').length;
        const highIssues = issues.filter(i => i.severity === 'high').length;

        if (criticalIssues > 0) return 0.2;
        if (highIssues > 0) return 0.6;
        return 0.9;
    }

    private calculateCompleteness(response: MedicalResponse, originalQuery: string): number {
        // Simple heuristic - in production, this would be more sophisticated
        const responseLength = response.content.length;
        const queryLength = originalQuery.length;

        if (responseLength < queryLength * 2) return 0.5;
        if (responseLength < queryLength * 5) return 0.7;
        return 0.9;
    }

    private async enhanceCitations(citations: Citation[]): Promise<Citation[]> {
        return citations.map(citation => ({
            ...citation,
            relevanceScore: citation.relevanceScore || tavilySearch.getSourceReliabilityScore(citation.url)
        }));
    }

    private calculateQualityScore(state: DoctorGPTState): number {
        const metrics = state.metadata?.validationMetrics;
        if (!metrics) return 0.5;

        return (metrics.factualAccuracy + metrics.citationQuality + metrics.medicalSafety + metrics.completeness) / 4;
    }

    private identifyQualityIssues(state: DoctorGPTState): string[] {
        const issues: string[] = [];
        const metrics = state.metadata?.validationMetrics;

        if (metrics?.factualAccuracy < 0.7) {
            issues.push('Low factual accuracy score');
        }
        if (metrics?.citationQuality < 0.7) {
            issues.push('Poor citation quality');
        }
        if (metrics?.medicalSafety < 0.8) {
            issues.push('Medical safety concerns');
        }

        return issues;
    }

    private calculateTotalWorkflowCost(state: DoctorGPTState): number {
        let total = 0;

        if (state.modelResponses) {
            total += state.modelResponses.reduce((sum, response) => sum + response.cost, 0);
        }

        // Add other costs (search, vector operations, etc.)
        total += 0.001; // Base workflow cost

        return total;
    }

    private summarizeErrors(errors: any[]): string {
        if (errors.length === 0) return 'No errors';
        return `${errors.length} errors occurred: ${errors.map(e => e.error).join(', ')}`;
    }
}

// Export singleton instance
export const doctorGPTWorkflow = new DoctorGPTWorkflow();
export default DoctorGPTWorkflow;
