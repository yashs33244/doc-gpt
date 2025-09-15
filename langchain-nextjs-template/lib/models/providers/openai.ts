/**
 * OpenAI Provider Implementation for Doctor GPT
 * Implements the AIModelProvider interface for OpenAI models
 */

import { ChatOpenAI, OpenAIEmbeddings } from '@langchain/openai';
import { HumanMessage, SystemMessage, AIMessage } from '@langchain/core/messages';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { config } from '../../../config';
import {
    AIModelProvider,
    ModelResponse,
    StreamingModelResponse,
    MedicalResponse,
    Message,
    ModelConfig,
    MedicalContext,
    CostInfo,
    ModelCapabilities,
    Citation,
    ModelProviderError
} from '../types';

export class OpenAIProvider implements AIModelProvider {
    name = 'openai';
    models = [
        'gpt-4o',
        'gpt-4o-mini',
        'gpt-4-turbo',
        'gpt-4',
        'gpt-3.5-turbo'
    ];

    private readonly apiKey: string;
    private readonly baseUrl?: string;

    constructor() {
        if (!config.openaiApiKey) {
            throw new ModelProviderError(
                'OpenAI API key not configured',
                this.name,
                'gpt-4o-mini'
            );
        }
        this.apiKey = config.openaiApiKey;
        this.baseUrl = 'https://api.openai.com/v1';
    }

    async complete(
        messages: Message[],
        modelConfig?: ModelConfig,
        medicalContext?: MedicalContext
    ): Promise<ModelResponse> {
        try {
            const model = new ChatOpenAI({
                openAIApiKey: this.apiKey,
                model: 'gpt-4o-mini',
                temperature: modelConfig?.temperature ?? 0.7,
                maxTokens: modelConfig?.maxTokens ?? 4000,
                topP: modelConfig?.topP,
                frequencyPenalty: modelConfig?.frequencyPenalty,
                presencePenalty: modelConfig?.presencePenalty,
                stop: modelConfig?.stop,
            });

            const formattedMessages = this.formatMessages(messages, medicalContext);
            const response = await model.invoke(formattedMessages);

            return {
                content: response.content as string,
                finishReason: 'stop',
                model: 'gpt-4o-mini',
                usage: {
                    promptTokens: response.usage_metadata?.input_tokens ?? 0,
                    completionTokens: response.usage_metadata?.output_tokens ?? 0,
                    totalTokens: response.usage_metadata?.total_tokens ?? 0,
                },
                metadata: {
                    provider: this.name,
                    responseId: response.response_metadata?.['system_fingerprint'],
                }
            };
        } catch (error) {
            throw new ModelProviderError(
                `OpenAI completion failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
                this.name,
                'gpt-4o-mini',
                error instanceof Error ? error : undefined
            );
        }
    }

    async *streamComplete(
        messages: Message[],
        modelConfig?: ModelConfig,
        medicalContext?: MedicalContext
    ): AsyncGenerator<StreamingModelResponse> {
        try {
            const model = new ChatOpenAI({
                openAIApiKey: this.apiKey,
                model: 'gpt-4o-mini',
                temperature: modelConfig?.temperature ?? 0.7,
                maxTokens: modelConfig?.maxTokens ?? 4000,
                streaming: true,
            });

            const formattedMessages = this.formatMessages(messages, medicalContext);
            const stream = await model.stream(formattedMessages);

            let content = '';
            for await (const chunk of stream) {
                content += chunk.content;
                yield {
                    content: chunk.content as string,
                    done: false,
                };
            }

            yield {
                content: '',
                done: true,
                usage: {
                    promptTokens: 0, // Would need to implement token counting
                    completionTokens: 0,
                    totalTokens: 0,
                }
            };
        } catch (error) {
            throw new ModelProviderError(
                `OpenAI streaming failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
                this.name,
                'gpt-4o-mini',
                error instanceof Error ? error : undefined
            );
        }
    }

    async medicalComplete(
        messages: Message[],
        modelConfig?: ModelConfig,
        medicalContext?: MedicalContext
    ): Promise<MedicalResponse> {
        try {
            // Enhanced prompt for medical responses
            const medicalSystemPrompt = this.createMedicalSystemPrompt(medicalContext);
            const enhancedMessages = [
                { role: 'system' as const, content: medicalSystemPrompt },
                ...messages
            ];

            const response = await this.complete(enhancedMessages, modelConfig);

            // For now, return with empty citations - will be enhanced with RAG integration
            const medicalResponse: MedicalResponse = {
                ...response,
                citations: [] as Citation[],
                confidence: 0.8, // Default confidence, should be calculated based on context
                medicalDisclaimer: "This information is for educational purposes only and is not a substitute for professional medical advice, diagnosis, or treatment. Always seek the advice of your physician or other qualified health provider with any questions you may have regarding a medical condition.",
                riskAssessment: medicalContext?.urgencyLevel ? {
                    level: medicalContext.urgencyLevel as 'low' | 'medium' | 'high',
                    factors: medicalContext.currentSymptoms || []
                } : undefined,
                recommendedActions: [
                    "Consult with a healthcare professional",
                    "Follow up with your primary care physician",
                    "Monitor symptoms and seek immediate care if they worsen"
                ]
            };

            return medicalResponse;
        } catch (error) {
            throw new ModelProviderError(
                `OpenAI medical completion failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
                this.name,
                'gpt-4o-mini',
                error instanceof Error ? error : undefined
            );
        }
    }

    calculateCost(usage: ModelResponse['usage']): CostInfo {
        // GPT-4o-mini pricing (as of 2024)
        const inputCostPerToken = 0.00000015; // $0.15 per 1M tokens
        const outputCostPerToken = 0.0000006; // $0.60 per 1M tokens

        const inputCost = usage.promptTokens * inputCostPerToken;
        const outputCost = usage.completionTokens * outputCostPerToken;
        const totalCost = inputCost + outputCost;

        return {
            inputCost,
            outputCost,
            totalCost,
            currency: 'USD',
            provider: this.name,
        };
    }

    async isAvailable(): Promise<boolean> {
        try {
            // Simple health check with minimal token usage
            const model = new ChatOpenAI({
                openAIApiKey: this.apiKey,
                model: 'gpt-4o-mini',
                maxTokens: 5,
            });

            await model.invoke([new HumanMessage('Hi')]);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Generate embeddings using OpenAI's embedding models
     */
    async generateEmbedding(
        text: string,
        options?: { model?: string }
    ): Promise<{
        embedding: number[];
        model: string;
        cost: number;
    }> {
        try {
            const model = options?.model || 'text-embedding-3-small';

            const embeddings = new OpenAIEmbeddings({
                openAIApiKey: this.apiKey,
                model: model,
            });

            const embedding = await embeddings.embedQuery(text);

            // Calculate cost based on token count
            const tokenCount = Math.ceil(text.length / 4); // Rough estimate
            const cost = this.calculateEmbeddingCost(tokenCount, model);

            return {
                embedding,
                model,
                cost
            };
        } catch (error) {
            throw new ModelProviderError(
                `OpenAI embedding generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
                this.name,
                'text-embedding-3-small',
                error instanceof Error ? error : undefined
            );
        }
    }

    private calculateEmbeddingCost(tokenCount: number, model: string): number {
        // OpenAI embedding pricing (as of 2024)
        const costPerToken = {
            'text-embedding-3-small': 0.00000002, // $0.02 per 1M tokens
            'text-embedding-3-large': 0.00000013, // $0.13 per 1M tokens
            'text-embedding-ada-002': 0.0000001,  // $0.10 per 1M tokens
        };

        const rate = costPerToken[model as keyof typeof costPerToken] || costPerToken['text-embedding-3-small'];
        return tokenCount * rate;
    }

    getCapabilities(model: string): ModelCapabilities {
        const baseCapabilities: ModelCapabilities = {
            maxTokens: 4000,
            supportsStreaming: true,
            supportsFunctionCalling: true,
            supportsVision: false,
            contextWindow: 128000,
            isMultimodal: false,
            specializations: ['general', 'reasoning', 'medical']
        };

        switch (model) {
            case 'gpt-4o':
                return {
                    ...baseCapabilities,
                    maxTokens: 4000,
                    supportsVision: true,
                    isMultimodal: true,
                    contextWindow: 128000,
                };
            case 'gpt-4o-mini':
                return {
                    ...baseCapabilities,
                    maxTokens: 16000,
                    contextWindow: 128000,
                };
            case 'gpt-4-turbo':
                return {
                    ...baseCapabilities,
                    maxTokens: 4000,
                    supportsVision: true,
                    isMultimodal: true,
                    contextWindow: 128000,
                };
            default:
                return baseCapabilities;
        }
    }

    private formatMessages(messages: Message[], medicalContext?: MedicalContext) {
        return messages.map(msg => {
            switch (msg.role) {
                case 'system':
                    return new SystemMessage(msg.content);
                case 'user':
                    return new HumanMessage(msg.content);
                case 'assistant':
                    return new AIMessage(msg.content);
                default:
                    return new HumanMessage(msg.content);
            }
        });
    }

    private createMedicalSystemPrompt(medicalContext?: MedicalContext): string {
        let prompt = `You are a knowledgeable medical AI assistant designed to help with healthcare information. 

IMPORTANT GUIDELINES:
1. Always provide accurate, evidence-based medical information
2. Include citations to reputable medical sources when possible
3. Never diagnose conditions or recommend specific treatments
4. Always recommend consulting healthcare professionals
5. Be clear about limitations and when immediate medical attention is needed
6. Use clear, accessible language while maintaining medical accuracy

RESPONSE FORMAT:
- Provide clear, structured information
- Include relevant medical context
- Cite sources when making medical claims
- Include appropriate disclaimers
- Suggest when to seek professional medical care`;

        if (medicalContext) {
            prompt += `\n\nPATIENT CONTEXT:`;
            if (medicalContext.patientAge) prompt += `\n- Age: ${medicalContext.patientAge}`;
            if (medicalContext.patientGender) prompt += `\n- Gender: ${medicalContext.patientGender}`;
            if (medicalContext.medicalHistory?.length) prompt += `\n- Medical History: ${medicalContext.medicalHistory.join(', ')}`;
            if (medicalContext.currentSymptoms?.length) prompt += `\n- Current Symptoms: ${medicalContext.currentSymptoms.join(', ')}`;
            if (medicalContext.medications?.length) prompt += `\n- Medications: ${medicalContext.medications.join(', ')}`;
            if (medicalContext.allergies?.length) prompt += `\n- Allergies: ${medicalContext.allergies.join(', ')}`;
            if (medicalContext.urgencyLevel) prompt += `\n- Urgency Level: ${medicalContext.urgencyLevel}`;
        }

        return prompt;
    }
}
