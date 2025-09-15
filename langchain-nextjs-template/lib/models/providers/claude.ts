/**
 * Anthropic Claude Provider Implementation for Doctor GPT
 * Implements the AIModelProvider interface for Claude models
 */

import { ChatAnthropic } from '@langchain/anthropic';
import { HumanMessage, SystemMessage, AIMessage } from '@langchain/core/messages';
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

export class ClaudeProvider implements AIModelProvider {
    name = 'anthropic';
    models = [
        'claude-3-5-sonnet-20241022',
        'claude-3-opus-20240229',
        'claude-3-sonnet-20240229',
        'claude-3-haiku-20240307'
    ];

    private readonly apiKey: string;

    constructor() {
        if (!config.anthropicApiKey) {
            throw new ModelProviderError(
                'Anthropic API key not configured',
                this.name,
                'claude-3-5-sonnet-20241022'
            );
        }
        this.apiKey = config.anthropicApiKey;
    }

    async complete(
        messages: Message[],
        modelConfig?: ModelConfig,
        medicalContext?: MedicalContext
    ): Promise<ModelResponse> {
        try {
            const model = new ChatAnthropic({
                anthropicApiKey: this.apiKey,
                model: 'claude-3-5-sonnet-20241022',
                temperature: modelConfig?.temperature ?? 0.7,
                maxTokens: modelConfig?.maxTokens ?? 4000,
                topP: modelConfig?.topP,
                stopSequences: modelConfig?.stop,
            });

            const formattedMessages = this.formatMessages(messages, medicalContext);
            const response = await model.invoke(formattedMessages);

            return {
                content: response.content as string,
                finishReason: 'stop',
                model: 'claude-3-5-sonnet-20241022',
                usage: {
                    promptTokens: response.usage_metadata?.input_tokens ?? 0,
                    completionTokens: response.usage_metadata?.output_tokens ?? 0,
                    totalTokens: response.usage_metadata?.total_tokens ?? 0,
                },
                metadata: {
                    provider: this.name,
                    responseId: response.response_metadata?.['id'],
                }
            };
        } catch (error) {
            throw new ModelProviderError(
                `Claude completion failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
                this.name,
                'claude-3-5-sonnet-20241022',
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
            const model = new ChatAnthropic({
                anthropicApiKey: this.apiKey,
                model: 'claude-3-5-sonnet-20241022',
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
                `Claude streaming failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
                this.name,
                'claude-3-5-sonnet-20241022',
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
            // Enhanced prompt for medical responses with Claude's expertise
            const medicalSystemPrompt = this.createMedicalSystemPrompt(medicalContext);
            const enhancedMessages = [
                { role: 'system' as const, content: medicalSystemPrompt },
                ...messages
            ];

            const response = await this.complete(enhancedMessages, modelConfig);

            // Claude is particularly good at medical reasoning, so higher default confidence
            const medicalResponse: MedicalResponse = {
                ...response,
                citations: [] as Citation[],
                confidence: 0.85, // Claude typically provides more accurate medical information
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
                `Claude medical completion failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
                this.name,
                'claude-3-5-sonnet-20241022',
                error instanceof Error ? error : undefined
            );
        }
    }

    calculateCost(usage: ModelResponse['usage']): CostInfo {
        // Claude 3.5 Sonnet pricing (as of 2024)
        const inputCostPerToken = 0.000003; // $3 per 1M tokens
        const outputCostPerToken = 0.000015; // $15 per 1M tokens

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
            const model = new ChatAnthropic({
                anthropicApiKey: this.apiKey,
                model: 'claude-3-haiku-20240307', // Use Haiku for health checks (cheaper)
                maxTokens: 5,
            });

            await model.invoke([new HumanMessage('Hi')]);
            return true;
        } catch {
            return false;
        }
    }

    getCapabilities(model: string): ModelCapabilities {
        const baseCapabilities: ModelCapabilities = {
            maxTokens: 4000,
            supportsStreaming: true,
            supportsFunctionCalling: true,
            supportsVision: false,
            contextWindow: 200000,
            isMultimodal: false,
            specializations: ['reasoning', 'analysis', 'medical', 'research']
        };

        switch (model) {
            case 'claude-3-5-sonnet-20241022':
                return {
                    ...baseCapabilities,
                    maxTokens: 8192,
                    supportsVision: true,
                    isMultimodal: true,
                    contextWindow: 200000,
                    specializations: ['reasoning', 'analysis', 'medical', 'research', 'coding']
                };
            case 'claude-3-opus-20240229':
                return {
                    ...baseCapabilities,
                    maxTokens: 4096,
                    supportsVision: true,
                    isMultimodal: true,
                    contextWindow: 200000,
                    specializations: ['reasoning', 'analysis', 'medical', 'research', 'creative']
                };
            case 'claude-3-sonnet-20240229':
                return {
                    ...baseCapabilities,
                    maxTokens: 4096,
                    supportsVision: true,
                    isMultimodal: true,
                    contextWindow: 200000,
                };
            case 'claude-3-haiku-20240307':
                return {
                    ...baseCapabilities,
                    maxTokens: 4096,
                    supportsVision: true,
                    isMultimodal: true,
                    contextWindow: 200000,
                    specializations: ['fast-response', 'general']
                };
            default:
                return baseCapabilities;
        }
    }

    private formatMessages(messages: Message[], medicalContext?: MedicalContext) {
        // Separate system messages from other messages
        const systemMessages = messages.filter(msg => msg.role === 'system');
        const otherMessages = messages.filter(msg => msg.role !== 'system');

        // Combine all system messages into one
        const combinedSystemContent = systemMessages.map(msg => msg.content).join('\n\n');

        // Format messages ensuring system message is first
        const formattedMessages = [];

        if (combinedSystemContent) {
            formattedMessages.push(new SystemMessage(combinedSystemContent));
        }

        // Add medical context as system message if provided
        if (medicalContext) {
            const medicalContextContent = `Medical Context: ${JSON.stringify(medicalContext)}`;
            if (formattedMessages.length === 0) {
                formattedMessages.push(new SystemMessage(medicalContextContent));
            } else {
                // Append to existing system message
                const existingSystem = formattedMessages[0] as SystemMessage;
                formattedMessages[0] = new SystemMessage(existingSystem.content + '\n\n' + medicalContextContent);
            }
        }

        // Add other messages
        otherMessages.forEach(msg => {
            switch (msg.role) {
                case 'user':
                    formattedMessages.push(new HumanMessage(msg.content));
                    break;
                case 'assistant':
                    formattedMessages.push(new AIMessage(msg.content));
                    break;
                default:
                    formattedMessages.push(new HumanMessage(msg.content));
            }
        });

        return formattedMessages;
    }

    private createMedicalSystemPrompt(medicalContext?: MedicalContext): string {
        let prompt = `You are Claude, an AI assistant with extensive knowledge in medicine and healthcare. You excel at providing accurate, well-reasoned medical information.

CORE PRINCIPLES:
1. Provide evidence-based information from reputable medical sources
2. Use careful, precise language when discussing medical topics
3. Always emphasize the importance of professional medical consultation
4. Be transparent about limitations and uncertainty
5. Prioritize patient safety in all recommendations
6. Use clear, empathetic communication

RESPONSE REQUIREMENTS:
- Structure information clearly and logically
- Provide context for medical terms when needed
- Include relevant medical considerations
- Cite authoritative sources when making medical claims
- Always include appropriate medical disclaimers
- Suggest appropriate next steps for seeking care

SAFETY PROTOCOLS:
- Never attempt to diagnose specific medical conditions
- Do not recommend specific treatments or medications
- Emphasize urgency when symptoms suggest serious conditions
- Always recommend professional medical evaluation for concerning symptoms`;

        if (medicalContext) {
            prompt += `\n\nPATIENT CONTEXT PROVIDED:`;
            if (medicalContext.patientAge) prompt += `\n- Age: ${medicalContext.patientAge} years`;
            if (medicalContext.patientGender) prompt += `\n- Gender: ${medicalContext.patientGender}`;
            if (medicalContext.medicalHistory?.length) prompt += `\n- Medical History: ${medicalContext.medicalHistory.join(', ')}`;
            if (medicalContext.currentSymptoms?.length) prompt += `\n- Current Symptoms: ${medicalContext.currentSymptoms.join(', ')}`;
            if (medicalContext.medications?.length) prompt += `\n- Current Medications: ${medicalContext.medications.join(', ')}`;
            if (medicalContext.allergies?.length) prompt += `\n- Known Allergies: ${medicalContext.allergies.join(', ')}`;
            if (medicalContext.urgencyLevel) {
                prompt += `\n- Urgency Level: ${medicalContext.urgencyLevel}`;
                if (medicalContext.urgencyLevel === 'high' || medicalContext.urgencyLevel === 'emergency') {
                    prompt += `\n\n⚠️ URGENT: This situation requires immediate medical attention. Prioritize directing to appropriate emergency care.`;
                }
            }
        }

        return prompt;
    }
}
