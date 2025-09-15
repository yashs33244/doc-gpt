/**
 * Model Repository - Central management for all AI providers
 * Implements Repository and Strategy patterns for scalable model management
 */

import {
    AIModelProvider,
    ModelProviderConfig,
    ModelResponse,
    StreamingModelResponse,
    MedicalResponse,
    MultiModelResult,
    Message,
    ModelConfig,
    MedicalContext,
    CostInfo,
    ModelProviderError,
    RateLimitError,
    InsufficientQuotaError
} from './types';
import { OpenAIProvider } from './providers/openai';
import { ClaudeProvider } from './providers/claude';
import { LocalMockProvider } from './providers/local-mock';
import { config } from '../../config';

export class ModelRepository {
    private static instance: ModelRepository;
    private providers: Map<string, ModelProviderConfig> = new Map();
    private rateLimitTracker: Map<string, { requests: number; lastReset: number }> = new Map();

    private constructor() {
        this.initializeProviders();
    }

    public static getInstance(): ModelRepository {
        if (!ModelRepository.instance) {
            ModelRepository.instance = new ModelRepository();
        }
        return ModelRepository.instance;
    }

    private initializeProviders(): void {
        let providersInitialized = 0;

        // Try to initialize OpenAI Provider
        if (config.hasOpenAI) {
            try {
                const openaiProvider = new OpenAIProvider();
                this.providers.set('openai', {
                    provider: openaiProvider,
                    enabled: true,
                    priority: 1,
                    rateLimits: {
                        requestsPerMinute: 60,
                        tokensPerMinute: 200000,
                    },
                    costPerToken: {
                        input: 0.00000015, // GPT-4o-mini
                        output: 0.0000006,
                    }
                });
                providersInitialized++;
                console.log('✅ OpenAI provider initialized');
            } catch (error) {
                console.warn('⚠️ OpenAI provider failed to initialize:', error);
            }
        } else {
            console.log('⚠️ OpenAI API key not configured, skipping OpenAI provider');
        }

        // Try to initialize Claude Provider
        if (config.hasAnthropic) {
            try {
                const claudeProvider = new ClaudeProvider();
                this.providers.set('anthropic', {
                    provider: claudeProvider,
                    enabled: true,
                    priority: 2,
                    rateLimits: {
                        requestsPerMinute: 50,
                        tokensPerMinute: 100000,
                    },
                    costPerToken: {
                        input: 0.000003, // Claude 3.5 Sonnet
                        output: 0.000015,
                    }
                });
                providersInitialized++;
                console.log('✅ Claude provider initialized');
            } catch (error) {
                console.warn('⚠️ Claude provider failed to initialize:', error);
            }
        } else {
            console.log('⚠️ Anthropic API key not configured, skipping Claude provider');
        }

        // If no real providers are available, use mock provider
        if (providersInitialized === 0) {
            console.log('🔧 No external API providers available, initializing mock provider for development');
            const mockProvider = new LocalMockProvider();
            this.providers.set('local-mock', {
                provider: mockProvider,
                enabled: true,
                priority: 1,
                rateLimits: {
                    requestsPerMinute: 1000,
                    tokensPerMinute: 1000000,
                },
                costPerToken: {
                    input: 0.000001, // Very low mock costs
                    output: 0.000001,
                }
            });
            console.log('✅ Local mock provider initialized');
        }
    }

    /**
     * Add a new provider to the repository
     */
    public addProvider(name: string, providerConfig: ModelProviderConfig): void {
        this.providers.set(name, providerConfig);
    }

    /**
     * Remove a provider from the repository
     */
    public removeProvider(name: string): void {
        this.providers.delete(name);
    }

    /**
     * Get a specific provider
     */
    public getProvider(name: string): AIModelProvider | null {
        const config = this.providers.get(name);
        return config?.enabled ? config.provider : null;
    }

    /**
     * Get all enabled providers
     */
    public getEnabledProviders(): AIModelProvider[] {
        return Array.from(this.providers.values())
            .filter(config => config.enabled)
            .sort((a, b) => a.priority - b.priority)
            .map(config => config.provider);
    }

    /**
     * Get provider by priority
     */
    public getProviderByPriority(priority: number): AIModelProvider | null {
        const config = Array.from(this.providers.values())
            .find(config => config.enabled && config.priority === priority);
        return config?.provider || null;
    }

    /**
     * Complete with a specific provider
     */
    public async complete(
        providerName: string,
        messages: Message[],
        modelConfig?: ModelConfig,
        medicalContext?: MedicalContext
    ): Promise<ModelResponse> {
        const provider = this.getProvider(providerName);
        if (!provider) {
            throw new ModelProviderError(
                `Provider ${providerName} not found or disabled`,
                providerName,
                'unknown'
            );
        }

        await this.checkRateLimit(providerName);
        return provider.complete(messages, modelConfig, medicalContext);
    }

    /**
     * Stream complete with a specific provider
     */
    public async *streamComplete(
        providerName: string,
        messages: Message[],
        modelConfig?: ModelConfig,
        medicalContext?: MedicalContext
    ): AsyncGenerator<StreamingModelResponse> {
        const provider = this.getProvider(providerName);
        if (!provider) {
            throw new ModelProviderError(
                `Provider ${providerName} not found or disabled`,
                providerName,
                'unknown'
            );
        }

        await this.checkRateLimit(providerName);
        yield* provider.streamComplete(messages, modelConfig, medicalContext);
    }

    /**
     * Medical complete with a specific provider
     */
    public async medicalComplete(
        providerName: string,
        messages: Message[],
        modelConfig?: ModelConfig,
        medicalContext?: MedicalContext
    ): Promise<MedicalResponse> {
        const provider = this.getProvider(providerName);
        if (!provider) {
            throw new ModelProviderError(
                `Provider ${providerName} not found or disabled`,
                providerName,
                'unknown'
            );
        }

        await this.checkRateLimit(providerName);
        return provider.medicalComplete(messages, modelConfig, medicalContext);
    }

    /**
     * Generate embeddings using a specific provider
     */
    public async generateEmbedding(
        providerName: string,
        text: string,
        options?: { model?: string }
    ): Promise<{
        embedding: number[];
        model: string;
        cost: number;
    }> {
        const provider = this.getProvider(providerName);
        if (!provider) {
            throw new ModelProviderError(
                `Provider ${providerName} not found or disabled`,
                providerName,
                'unknown'
            );
        }

        await this.checkRateLimit(providerName);

        // Check if provider supports embeddings
        if (typeof (provider as any).generateEmbedding !== 'function') {
            throw new ModelProviderError(
                `Provider ${providerName} does not support embedding generation`,
                providerName,
                'embedding'
            );
        }

        return (provider as any).generateEmbedding(text, options);
    }

    /**
     * Multi-model reasoning - get responses from multiple providers and merge
     */
    public async multiModelReasoning(
        messages: Message[],
        modelConfig?: ModelConfig,
        medicalContext?: MedicalContext,
        providersToUse?: string[]
    ): Promise<MultiModelResult> {
        const providers = providersToUse
            ? providersToUse.map(name => this.getProvider(name)).filter(Boolean) as AIModelProvider[]
            : this.getEnabledProviders();

        if (providers.length === 0) {
            throw new ModelProviderError(
                'No enabled providers available for multi-model reasoning',
                'repository',
                'multi-model'
            );
        }

        const responses: MultiModelResult['responses'] = [];
        let totalCost: CostInfo = {
            inputCost: 0,
            outputCost: 0,
            totalCost: 0,
            currency: 'USD',
            provider: 'multi-model'
        };

        // Get responses from all providers in parallel
        const responsePromises = providers.map(async (provider) => {
            const startTime = Date.now();
            try {
                const response = await provider.medicalComplete(messages, modelConfig, medicalContext);
                const cost = provider.calculateCost(response.usage);
                const responseTime = Date.now() - startTime;

                // Accumulate costs
                totalCost.inputCost += cost.inputCost;
                totalCost.outputCost += cost.outputCost;
                totalCost.totalCost += cost.totalCost;

                return {
                    provider: provider.name,
                    model: 'default', // Would need to track which model was used
                    response,
                    cost,
                    responseTime
                };
            } catch (error) {
                console.error(`Provider ${provider.name} failed:`, error);
                return null;
            }
        });

        const results: Array<{
            provider: string;
            model: string;
            response: MedicalResponse;
            cost: CostInfo;
            responseTime: number;
        }> = (await Promise.all(responsePromises)).filter(Boolean) as any[];
        responses.push(...results);

        if (responses.length === 0) {
            throw new ModelProviderError(
                'All providers failed during multi-model reasoning',
                'repository',
                'multi-model'
            );
        }

        // Analyze consensus and create final response
        const consensus = this.analyzeConsensus(responses);
        const finalResponse = this.createFinalResponse(responses, consensus);

        return {
            responses,
            consensus,
            finalResponse,
            totalCost
        };
    }

    /**
     * Get the best available provider based on current availability and performance
     */
    public async getBestProvider(): Promise<AIModelProvider | null> {
        const providers = this.getEnabledProviders();

        for (const provider of providers) {
            try {
                const isAvailable = await provider.isAvailable();
                if (isAvailable) {
                    return provider;
                }
            } catch {
                continue;
            }
        }

        return null;
    }

    /**
     * Health check for all providers
     */
    public async healthCheck(): Promise<Record<string, boolean>> {
        const results: Record<string, boolean> = {};
        const providers = Array.from(this.providers.entries());

        const healthChecks = providers.map(async ([name, config]) => {
            if (!config.enabled) {
                results[name] = false;
                return;
            }

            try {
                results[name] = await config.provider.isAvailable();
            } catch {
                results[name] = false;
            }
        });

        await Promise.all(healthChecks);
        return results;
    }

    /**
     * Enable/disable a provider
     */
    public setProviderEnabled(name: string, enabled: boolean): void {
        const config = this.providers.get(name);
        if (config) {
            config.enabled = enabled;
        }
    }

    /**
     * Set provider priority
     */
    public setProviderPriority(name: string, priority: number): void {
        const config = this.providers.get(name);
        if (config) {
            config.priority = priority;
        }
    }

    private async checkRateLimit(providerName: string): Promise<void> {
        const config = this.providers.get(providerName);
        if (!config) return;

        const now = Date.now();
        const windowStart = now - 60000; // 1 minute window

        let tracker = this.rateLimitTracker.get(providerName);
        if (!tracker || tracker.lastReset < windowStart) {
            tracker = { requests: 0, lastReset: now };
            this.rateLimitTracker.set(providerName, tracker);
        }

        if (tracker.requests >= config.rateLimits.requestsPerMinute) {
            throw new RateLimitError(providerName, 'default', 60);
        }

        tracker.requests++;
    }

    private analyzeConsensus(responses: MultiModelResult['responses']) {
        if (responses.length < 2) return undefined;

        // Simple consensus analysis - can be enhanced with more sophisticated algorithms
        const contents = responses.map(r => r.response.content);
        const avgConfidence = responses.reduce((sum, r) => {
            return sum + ((r.response as MedicalResponse).confidence || 0.5);
        }, 0) / responses.length;

        // Check for similar key phrases or conclusions
        const commonPhrases = this.findCommonPhrases(contents);
        const disagreements = this.findDisagreements(contents);

        return {
            agreedContent: commonPhrases.join(' '),
            confidence: avgConfidence,
            disagreements
        };
    }

    private createFinalResponse(
        responses: MultiModelResult['responses'],
        consensus?: MultiModelResult['consensus']
    ): MedicalResponse {
        // Use the highest confidence response as base, enhanced with consensus
        const bestResponse = responses.reduce((best, current) => {
            const currentConfidence = (current.response as MedicalResponse).confidence || 0;
            const bestConfidence = (best.response as MedicalResponse).confidence || 0;
            return currentConfidence > bestConfidence ? current : best;
        });

        const baseMedicalResponse = bestResponse.response as MedicalResponse;

        // Merge citations from all responses
        const allCitations = responses.flatMap(r => (r.response as MedicalResponse).citations || []);
        const uniqueCitations = allCitations.filter((citation, index, arr) =>
            arr.findIndex(c => c.url === citation.url) === index
        );

        // Merge recommended actions
        const allActions = responses.flatMap(r => (r.response as MedicalResponse).recommendedActions || []);
        const uniqueActions = [...new Set(allActions)];

        return {
            ...baseMedicalResponse,
            content: consensus?.agreedContent || baseMedicalResponse.content,
            confidence: consensus?.confidence || baseMedicalResponse.confidence,
            citations: uniqueCitations,
            recommendedActions: uniqueActions,
            metadata: {
                ...baseMedicalResponse.metadata,
                multiModel: true,
                providersUsed: responses.map(r => r.provider),
                consensus: !!consensus
            }
        };
    }

    private findCommonPhrases(contents: string[]): string[] {
        // Simple implementation - can be enhanced with NLP techniques
        const phrases: string[] = [];

        // Split into sentences and find common ones
        const allSentences = contents.flatMap(content =>
            content.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 10)
        );

        const sentenceCounts = new Map<string, number>();
        allSentences.forEach(sentence => {
            sentenceCounts.set(sentence, (sentenceCounts.get(sentence) || 0) + 1);
        });

        // Find sentences that appear in multiple responses
        sentenceCounts.forEach((count, sentence) => {
            if (count > 1) {
                phrases.push(sentence);
            }
        });

        return phrases;
    }

    private findDisagreements(contents: string[]): string[] {
        // Simple implementation - identify contradictory statements
        const disagreements: string[] = [];

        // This would need more sophisticated NLP analysis
        // For now, just flag if responses are very different in length or structure
        const lengths = contents.map(c => c.length);
        const avgLength = lengths.reduce((a, b) => a + b, 0) / lengths.length;
        const hasSignificantLengthDiff = lengths.some(l => Math.abs(l - avgLength) > avgLength * 0.5);

        if (hasSignificantLengthDiff) {
            disagreements.push('Response lengths vary significantly between models');
        }

        return disagreements;
    }
}

// Export singleton instance
export const modelRepository = ModelRepository.getInstance();

// Export for testing
export default ModelRepository;
