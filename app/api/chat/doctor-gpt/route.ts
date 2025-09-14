/**
 * Doctor GPT Chat API Route
 * Enhanced chat endpoint with multi-model reasoning, RAG, and medical focus
 */

import { NextRequest, NextResponse } from 'next/server';

// Force Node.js runtime for Prisma compatibility
export const runtime = 'nodejs';
import { StreamingTextResponse } from 'ai';
import { PrismaClient } from '@prisma/client';
import { doctorGPTWorkflow } from '../../../../lib/workflows/doctor-gpt-workflow';
import { costTracker } from '../../../../lib/cost-tracking/tracker';
import { config } from '../../../../config';
import { DoctorGPTState } from '../../../../lib/workflows/types';
import { MedicalContext } from '../../../../lib/models/types';
import { Operation } from '../../../../lib/cost-tracking/types';

// Initialize Prisma client
const prisma = new PrismaClient();

interface ChatRequest {
    messages: Array<{
        role: 'user' | 'assistant' | 'system';
        content: string;
        id?: string;
    }>;
    userId?: string;
    sessionId?: string;
    medicalContext?: MedicalContext;
    uploadedDocuments?: Array<{
        id: string;
        fileName: string;
        content: string;
    }>;
    options?: {
        enableMultiModel?: boolean;
        enableWebSearch?: boolean;
        enableCitations?: boolean;
        maxCost?: number;
    };
}

interface ChatResponse {
    response: string;
    citations?: Array<{
        id: string;
        title: string;
        url: string;
        source: string;
        snippet?: string;
    }>;
    confidence: number;
    medicalDisclaimer: string;
    cost: {
        totalCost: number;
        breakdown: Record<string, number>;
    };
    metadata: {
        modelProviders: string[];
        responseTime: number;
        workflowExecuted: boolean;
    };
}

export async function POST(req: NextRequest) {
    const startTime = Date.now();

    try {
        const body = await req.json() as ChatRequest;
        const { messages, userId, sessionId, medicalContext, uploadedDocuments, options } = body;

        // Validate required fields
        if (!messages || messages.length === 0) {
            return NextResponse.json(
                { error: 'Messages are required' },
                { status: 400 }
            );
        }

        const currentMessage = messages[messages.length - 1];
        if (currentMessage.role !== 'user') {
            return NextResponse.json(
                { error: 'Last message must be from user' },
                { status: 400 }
            );
        }

        // Generate IDs if not provided
        const actualUserId = userId || crypto.randomUUID();
        const actualSessionId = sessionId || crypto.randomUUID();
        const chatId = crypto.randomUUID();

        // Check if this is a medical query
        const isMedicalQuery = await isMedicalRelated(currentMessage.content);

        if (!isMedicalQuery) {
            // Handle non-medical queries with simple model response
            return handleNonMedicalQuery(currentMessage.content, actualUserId, actualSessionId, chatId);
        }

        // Create workflow state
        const workflowState: Partial<DoctorGPTState> = {
            userQuery: currentMessage.content,
            userId: actualUserId,
            sessionId: actualSessionId,
            chatId,
            medicalContext,
            uploadedDocuments: uploadedDocuments?.map(doc => ({
                id: doc.id,
                fileName: doc.fileName,
                fileType: 'unknown',
                content: doc.content,
                extractedText: doc.content,
                processingStatus: 'completed' as const
            }))
        };

        console.log('Executing Doctor GPT workflow for user:', actualUserId);

        // Execute the workflow with medical data service integration
        const { getMedicalDataService } = await import('../../../../lib/medical/medical-data-service');
        const medicalService = getMedicalDataService(prisma);

        // Create chat record first to ensure chatId exists for cost tracking
        await createInitialChatRecord(actualUserId, actualSessionId, chatId, currentMessage.content);

        // Query medical knowledge using dual RAG
        const medicalQuery = await medicalService.queryMedicalKnowledge({
            query: currentMessage.content,
            userId: actualUserId,
            sessionId: actualSessionId,
            useGlobalKnowledge: true,
            useSessionDocuments: uploadedDocuments && uploadedDocuments.length > 0,
            medicalContext: medicalContext
        });

        // Execute the workflow with medical context
        const result = await doctorGPTWorkflow.execute({
            ...workflowState,
            medicalQueryResult: medicalQuery
        });

        // Update chat record with final response
        await updateChatWithResponse(actualUserId, actualSessionId, chatId, result);

        // Prepare response
        const response: ChatResponse = {
            response: result.finalResponse?.content || 'I apologize, but I encountered an issue processing your request.',
            citations: result.citations || [],
            confidence: result.confidence || 0.5,
            medicalDisclaimer: result.finalResponse?.medicalDisclaimer ||
                "This information is for educational purposes only and is not a substitute for professional medical advice.",
            cost: {
                totalCost: result.metadata?.totalWorkflowCost || 0,
                breakdown: {
                    models: result.modelResponses?.reduce((sum, r) => sum + r.cost, 0) || 0,
                    search: 0.001, // Approximate search cost
                    workflow: 0.001 // Base workflow cost
                }
            },
            metadata: {
                modelProviders: result.modelResponses?.map(r => r.provider) || [],
                responseTime: Date.now() - startTime,
                workflowExecuted: true
            }
        };

        // For streaming support, we'll return the complete response
        // In production, this could be enhanced to stream chunks
        if (options?.enableWebSearch !== false) {
            return NextResponse.json(response);
        }

        // Return streaming response for real-time interaction
        return new StreamingTextResponse(
            createStream(response.response),
            {
                headers: {
                    'X-Citations': JSON.stringify(response.citations),
                    'X-Confidence': response.confidence.toString(),
                    'X-Cost': response.cost.totalCost.toString()
                }
            }
        );

    } catch (error) {
        console.error('Doctor GPT API error:', error);

        // Track error cost
        if (error instanceof Error) {
            try {
                await costTracker.trackCost({
                    userId: 'unknown',
                    operation: Operation.CHAT_COMPLETION,
                    provider: 'error',
                    inputCost: 0,
                    outputCost: 0.001, // Small error cost
                    totalCost: 0.001,
                    currency: 'USD',
                    metadata: {
                        error: error.message,
                        endpoint: '/api/chat/doctor-gpt'
                    }
                });
            } catch (costError) {
                console.error('Failed to track error cost:', costError);
            }
        }

        return NextResponse.json(
            {
                error: 'Failed to process medical query',
                details: config.isDevelopment ? (error instanceof Error ? error.message : 'Unknown error') : undefined
            },
            { status: 500 }
        );
    }
}

/**
 * Handle non-medical queries with a simple model response
 */
async function handleNonMedicalQuery(
    query: string,
    userId: string,
    sessionId: string,
    chatId: string
): Promise<NextResponse> {
    try {
        const { modelRepository } = await import('../../../../lib/models/repository');

        const response = await modelRepository.complete(
            'openai',
            [
                {
                    role: 'system',
                    content: 'You are a helpful assistant. If asked about medical topics, politely redirect to seek professional medical advice.'
                },
                {
                    role: 'user',
                    content: query
                }
            ]
        );

        // Track cost for non-medical query
        await costTracker.trackCost({
            userId,
            sessionId,
            chatId,
            operation: Operation.MODEL_INFERENCE,
            provider: 'openai',
            model: 'gpt-4o-mini',
            inputTokens: response.usage.promptTokens,
            outputTokens: response.usage.completionTokens,
            totalTokens: response.usage.totalTokens,
            inputCost: response.usage.promptTokens * 0.00000015,
            outputCost: response.usage.completionTokens * 0.0000006,
            totalCost: response.usage.totalTokens * 0.00000075,
            currency: 'USD',
            metadata: {
                model: 'gpt-4o-mini',
                provider: 'openai'
            }
        });

        const chatResponse: ChatResponse = {
            response: response.content,
            confidence: 0.8,
            medicalDisclaimer: "For medical questions, please consult with a healthcare professional.",
            cost: {
                totalCost: response.usage.totalTokens * 0.00000075, // Average cost
                breakdown: {
                    models: response.usage.totalTokens * 0.00000075,
                    search: 0,
                    workflow: 0
                }
            },
            metadata: {
                modelProviders: ['openai'],
                responseTime: Date.now() - Date.now(),
                workflowExecuted: false
            }
        };

        return NextResponse.json(chatResponse);

    } catch (error) {
        console.error('Non-medical query handling failed:', error);
        return NextResponse.json(
            { error: 'Failed to process query' },
            { status: 500 }
        );
    }
}

/**
 * Determine if a query is medical-related
 */
async function isMedicalRelated(query: string): Promise<boolean> {
    const medicalKeywords = [
        'symptom', 'symptoms', 'pain', 'hurt', 'ache', 'fever', 'temperature',
        'medication', 'medicine', 'drug', 'prescription', 'dosage',
        'doctor', 'physician', 'hospital', 'clinic', 'medical',
        'diagnosis', 'treatment', 'therapy', 'surgery', 'operation',
        'health', 'wellness', 'sick', 'illness', 'disease', 'condition',
        'blood', 'pressure', 'heart', 'lung', 'kidney', 'liver',
        'diabetes', 'cancer', 'covid', 'flu', 'infection',
        'allergy', 'allergic', 'reaction', 'side effect',
        'test', 'lab', 'laboratory', 'x-ray', 'scan', 'mri', 'ct',
        'vaccine', 'vaccination', 'immunization'
    ];

    const lowerQuery = query.toLowerCase();
    return medicalKeywords.some(keyword => lowerQuery.includes(keyword));
}

/**
 * Create initial chat record
 */
async function createInitialChatRecord(
    userId: string,
    sessionId: string,
    chatId: string,
    userMessage: string
): Promise<void> {
    try {
        // Create user if doesn't exist
        await prisma.user.upsert({
            where: { id: userId },
            update: {},
            create: {
                id: userId,
                email: `user-${userId}@example.com`,
                name: 'Medical User'
            }
        });

        // Create session if doesn't exist
        await prisma.session.upsert({
            where: { id: sessionId },
            update: { updatedAt: new Date() },
            create: {
                id: sessionId,
                userId,
                title: userMessage.substring(0, 50) + '...',
                isActive: true
            }
        });

        // Save user message
        await prisma.chat.create({
            data: {
                id: chatId + '-user',
                sessionId,
                userId,
                role: 'USER',
                content: userMessage,
                isHealthcareQuery: true,
                metadata: {
                    originalQuery: userMessage,
                    timestamp: new Date().toISOString()
                }
            }
        });

    } catch (error) {
        console.error('Failed to create initial chat record:', error);
    }
}

/**
 * Update chat record with response
 */
async function updateChatWithResponse(
    userId: string,
    sessionId: string,
    chatId: string,
    workflowResult: DoctorGPTState
): Promise<void> {
    try {
        // Save assistant response
        if (workflowResult.finalResponse) {
            await prisma.chat.create({
                data: {
                    id: chatId + '-assistant',
                    sessionId,
                    userId,
                    role: 'ASSISTANT',
                    content: workflowResult.finalResponse.content,
                    isHealthcareQuery: true,
                    citations: workflowResult.citations ? JSON.stringify(workflowResult.citations) : undefined,
                    confidence: workflowResult.confidence,
                    metadata: {
                        modelProviders: workflowResult.modelResponses?.map(r => r.provider) || [],
                        totalCost: workflowResult.metadata?.totalWorkflowCost || 0,
                        workflowExecuted: true,
                        responseTime: workflowResult.metadata?.executionTime || 0,
                        citationCount: workflowResult.citations?.length || 0,
                        timestamp: new Date().toISOString()
                    }
                }
            });
        }
    } catch (error) {
        console.error('Failed to update chat with response:', error);
    }
}

/**
 * Save chat interaction to database
 */
async function saveChatToDatabase(
    userId: string,
    sessionId: string,
    chatId: string,
    userMessage: string,
    workflowResult: DoctorGPTState
): Promise<void> {
    try {
        // Create user if doesn't exist
        await prisma.user.upsert({
            where: { id: userId },
            update: {},
            create: {
                id: userId,
                email: `user-${userId}@example.com`, // Placeholder email
                name: 'Medical User'
            }
        });

        // Create session if doesn't exist
        await prisma.session.upsert({
            where: { id: sessionId },
            update: { updatedAt: new Date() },
            create: {
                id: sessionId,
                userId,
                title: userMessage.substring(0, 50) + '...',
                isActive: true
            }
        });

        // Save user message
        await prisma.chat.create({
            data: {
                id: chatId + '-user',
                sessionId,
                userId,
                role: 'USER',
                content: userMessage,
                isHealthcareQuery: true,
                metadata: {
                    originalQuery: userMessage,
                    timestamp: new Date().toISOString()
                }
            }
        });

        // Save assistant response
        if (workflowResult.finalResponse) {
            await prisma.chat.create({
                data: {
                    id: chatId + '-assistant',
                    sessionId,
                    userId,
                    role: 'ASSISTANT',
                    content: workflowResult.finalResponse.content,
                    isHealthcareQuery: true,
                    citations: workflowResult.citations ? JSON.stringify(workflowResult.citations) : undefined,
                    confidence: workflowResult.confidence,
                    metadata: {
                        modelProviders: workflowResult.modelResponses?.map(r => r.provider) || [],
                        totalCost: workflowResult.metadata?.totalWorkflowCost || 0,
                        workflowExecuted: true,
                        responseTime: workflowResult.metadata?.executionTime || 0,
                        citationCount: workflowResult.citations?.length || 0,
                        timestamp: new Date().toISOString()
                    }
                }
            });
        }

    } catch (error) {
        console.error('Failed to save chat to database:', error);
        // Don't throw error - we don't want to fail the request if DB save fails
    }
}

/**
 * Create a readable stream for streaming responses
 */
function createStream(text: string): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();

    return new ReadableStream({
        start(controller) {
            // Stream the text in chunks for a more natural feel
            const words = text.split(' ');
            let index = 0;

            const pushWord = () => {
                if (index < words.length) {
                    const word = words[index] + (index < words.length - 1 ? ' ' : '');
                    controller.enqueue(encoder.encode(word));
                    index++;

                    // Add a small delay between words for streaming effect
                    setTimeout(pushWord, 50);
                } else {
                    controller.close();
                }
            };

            pushWord();
        }
    });
}

// Export GET method for health check
export async function GET() {
    return NextResponse.json({
        status: 'healthy',
        service: 'doctor-gpt-chat-api',
        version: '1.0.0',
        timestamp: new Date().toISOString()
    });
}
