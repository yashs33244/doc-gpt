/**
 * Medical Data Service
 * 
 * Handles dual RAG system:
 * 1. Global medical knowledge base (accessible to all sessions)
 * 2. Session-specific document uploads (isolated per session)
 * 
 * Follows SOLID principles and clean architecture patterns
 */

import { PrismaClient } from '@prisma/client';
import { getQdrantService, SearchResult } from '../vector/qdrant-service';
import { modelRepository } from '../models/repository';
import { costTracker } from '../cost-tracking/tracker';
import { Operation } from '../cost-tracking/types';

// Types for medical data handling
export interface MedicalDocument {
    id: string;
    title: string;
    content: string;
    category: MedicalCategory;
    source: string;
    specialty?: MedicalSpecialty;
    trustScore?: number;
    metadata?: Record<string, any>;
}

export interface SessionDocument {
    id: string;
    sessionId: string;
    userId: string;
    fileName: string;
    content: string;
    extractedText: string;
    fileType: string;
    metadata?: Record<string, any>;
}

export interface MedicalQueryRequest {
    query: string;
    userId: string;
    sessionId: string;
    useGlobalKnowledge?: boolean;
    useSessionDocuments?: boolean;
    medicalContext?: MedicalContext;
}

export interface MedicalQueryResponse {
    globalMatches: SearchResult[];
    sessionMatches: SearchResult[];
    combinedResponse: string;
    confidence: number;
    citations: MedicalCitation[];
    cost: number;
}

export interface MedicalContext {
    patientAge?: number;
    patientGender?: 'male' | 'female' | 'other';
    medicalHistory?: string[];
    currentSymptoms?: string[];
    specialty?: MedicalSpecialty;
}

export interface MedicalCitation {
    id: string;
    title: string;
    source: string;
    url?: string;
    relevanceScore: number;
    trustScore: number;
    snippet: string;
    category: MedicalCategory;
}

export enum MedicalCategory {
    SYMPTOMS = 'symptoms',
    DISEASES = 'diseases',
    TREATMENTS = 'treatments',
    MEDICATIONS = 'medications',
    PROCEDURES = 'procedures',
    PREVENTION = 'prevention',
    DIAGNOSIS = 'diagnosis',
    ANATOMY = 'anatomy',
    PHARMACOLOGY = 'pharmacology',
    PATHOLOGY = 'pathology',
    GENERAL = 'general'
}

export enum MedicalSpecialty {
    CARDIOLOGY = 'cardiology',
    NEUROLOGY = 'neurology',
    ONCOLOGY = 'oncology',
    PEDIATRICS = 'pediatrics',
    PSYCHIATRY = 'psychiatry',
    SURGERY = 'surgery',
    DERMATOLOGY = 'dermatology',
    ENDOCRINOLOGY = 'endocrinology',
    GASTROENTEROLOGY = 'gastroenterology',
    PULMONOLOGY = 'pulmonology',
    RADIOLOGY = 'radiology',
    GENERAL = 'general'
}

export class MedicalDataService {
    private prisma: PrismaClient;
    private qdrant: ReturnType<typeof getQdrantService>;

    constructor(prisma: PrismaClient) {
        this.prisma = prisma;
        this.qdrant = getQdrantService();
    }

    /**
     * Ingest global medical knowledge
     */
    async ingestGlobalMedicalKnowledge(
        documents: MedicalDocument[]
    ): Promise<{ success: boolean; ingested: number; errors: string[] }> {
        const errors: string[] = [];
        let ingested = 0;

        try {
            for (const doc of documents) {
                try {
                    // Generate embedding for the document
                    const embedding = await this.generateEmbedding(doc.content);

                    // Store in vector database (knowledge collection)
                    await this.qdrant.storeKnowledgeVector(doc.id, embedding, {
                        content: doc.content,
                        title: doc.title,
                        category: doc.category,
                        source: doc.source,
                        tags: this.extractMedicalTags(doc.content),
                        trustScore: doc.trustScore || 0.8,
                        metadata: {
                            ...doc.metadata,
                            specialty: doc.specialty,
                            ingestionDate: new Date().toISOString()
                        }
                    });

                    // Store in PostgreSQL for metadata
                    await this.prisma.medicalKnowledge.upsert({
                        where: { id: doc.id },
                        update: {
                            title: doc.title,
                            content: doc.content,
                            category: doc.category,
                            source: doc.source,
                            specialty: doc.specialty,
                            trustScore: doc.trustScore,
                            vectorId: doc.id,
                            lastUpdated: new Date()
                        },
                        create: {
                            id: doc.id,
                            title: doc.title,
                            content: doc.content,
                            category: doc.category,
                            source: doc.source,
                            specialty: doc.specialty,
                            trustScore: doc.trustScore,
                            vectorId: doc.id,
                            tags: this.extractMedicalTags(doc.content)
                        }
                    });

                    ingested++;
                } catch (error) {
                    const errorMsg = `Failed to ingest document ${doc.id}: ${error instanceof Error ? error.message : 'Unknown error'}`;
                    errors.push(errorMsg);
                    console.error(errorMsg);
                }
            }

            return { success: errors.length === 0, ingested, errors };

        } catch (error) {
            console.error('Global knowledge ingestion failed:', error);
            return {
                success: false,
                ingested,
                errors: [...errors, error instanceof Error ? error.message : 'Unknown error']
            };
        }
    }

    /**
     * Ingest session-specific document
     */
    async ingestSessionDocument(
        sessionId: string,
        userId: string,
        document: SessionDocument
    ): Promise<{ success: boolean; vectorId?: string; error?: string }> {
        try {
            // Generate embedding for the document
            const embedding = await this.generateEmbedding(document.content);

            // Store in vector database (files collection)
            await this.qdrant.storeFileVector(document.id, embedding, {
                content: document.content,
                title: document.fileName,
                sessionId,
                userId,
                fileType: document.fileType,
                tags: this.extractMedicalTags(document.content),
                metadata: {
                    ...document.metadata,
                    originalFileName: document.fileName,
                    ingestionDate: new Date().toISOString(),
                    extractedTextLength: document.extractedText.length
                }
            });

            // Ensure user exists before creating session
            await this.prisma.user.upsert({
                where: { id: userId },
                update: {},
                create: {
                    id: userId,
                    email: `user-${userId}@example.com`,
                    name: 'Medical User'
                }
            });

            // Ensure session exists before creating session file
            await this.prisma.session.upsert({
                where: { id: sessionId },
                update: { updatedAt: new Date() },
                create: {
                    id: sessionId,
                    userId,
                    title: `Session with ${document.fileName}`,
                    isActive: true
                }
            });

            // Create or update session file record with vector ID
            await this.prisma.sessionFile.upsert({
                where: { id: document.id },
                update: {
                    vectorId: document.id,
                    processingStatus: 'COMPLETED',
                    extractedText: document.extractedText,
                    tags: this.extractMedicalTags(document.content)
                },
                create: {
                    id: document.id,
                    sessionId,
                    fileName: document.fileName,
                    fileType: document.fileType,
                    fileSize: document.metadata?.fileSize || 0,
                    vectorId: document.id,
                    processingStatus: 'COMPLETED',
                    extractedText: document.extractedText,
                    tags: this.extractMedicalTags(document.content),
                    metadata: document.metadata || {}
                }
            });

            return { success: true, vectorId: document.id };

        } catch (error) {
            console.error('Session document ingestion failed:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }

    /**
     * Query medical knowledge using dual RAG
     */
    async queryMedicalKnowledge(request: MedicalQueryRequest): Promise<MedicalQueryResponse> {
        const startTime = Date.now();

        try {
            // Generate embedding for the query
            const queryEmbedding = await this.generateEmbedding(request.query);

            // Search global knowledge base (if enabled)
            let globalMatches: SearchResult[] = [];
            if (request.useGlobalKnowledge !== false) {
                globalMatches = await this.qdrant.searchKnowledge(queryEmbedding, {
                    limit: 5,
                    scoreThreshold: 0.75,
                    category: this.detectMedicalCategory(request.query),
                    minTrustScore: 0.7
                });
            }

            // Search session-specific documents (if enabled)
            let sessionMatches: SearchResult[] = [];
            if (request.useSessionDocuments !== false) {
                sessionMatches = await this.qdrant.searchFiles(
                    queryEmbedding,
                    request.sessionId,
                    {
                        limit: 3,
                        scoreThreshold: 0.7
                    }
                );
            }

            // Generate combined response using AI
            const combinedResponse = await this.generateMedicalResponse(
                request.query,
                globalMatches,
                sessionMatches,
                request.medicalContext
            );

            // Create citations
            const citations = this.createMedicalCitations(globalMatches, sessionMatches);

            // Calculate confidence based on search results quality
            const confidence = this.calculateResponseConfidence(globalMatches, sessionMatches);

            // Track cost
            const processingTime = Date.now() - startTime;
            const estimatedCost = 0.001 + (processingTime / 1000) * 0.0001; // Basic cost estimation

            await costTracker.trackCost({
                userId: request.userId,
                sessionId: request.sessionId,
                operation: Operation.VECTOR_SEARCH,
                provider: 'medical_rag',
                inputCost: estimatedCost * 0.6,
                outputCost: estimatedCost * 0.4,
                totalCost: estimatedCost,
                currency: 'USD',
                metadata: {
                    globalMatches: globalMatches.length,
                    sessionMatches: sessionMatches.length,
                    queryLength: request.query.length,
                    processingTime
                }
            });

            return {
                globalMatches,
                sessionMatches,
                combinedResponse: combinedResponse.content,
                confidence,
                citations,
                cost: estimatedCost
            };

        } catch (error) {
            console.error('Medical query failed:', error);
            throw new Error(`Failed to query medical knowledge: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Get session document summaries
     */
    async getSessionDocumentSummaries(sessionId: string): Promise<Array<{
        id: string;
        fileName: string;
        summary: string;
        medicalTags: string[];
        uploadedAt: Date;
    }>> {
        try {
            const sessionFiles = await this.prisma.sessionFile.findMany({
                where: {
                    sessionId,
                    processingStatus: 'COMPLETED'
                },
                select: {
                    id: true,
                    fileName: true,
                    summary: true,
                    tags: true,
                    uploadedAt: true
                },
                orderBy: {
                    uploadedAt: 'desc'
                }
            });

            return sessionFiles.map(file => ({
                id: file.id,
                fileName: file.fileName,
                summary: file.summary || 'No summary available',
                medicalTags: file.tags,
                uploadedAt: file.uploadedAt
            }));

        } catch (error) {
            console.error('Failed to get session document summaries:', error);
            return [];
        }
    }

    /**
     * Get global knowledge statistics
     */
    async getGlobalKnowledgeStats(): Promise<{
        totalDocuments: number;
        categoryCounts: Record<string, number>;
        specialtyCounts: Record<string, number>;
        averageTrustScore: number;
    }> {
        try {
            const [totalDocuments, categoryStats, specialtyStats, trustScoreAvg] = await Promise.all([
                this.prisma.medicalKnowledge.count(),
                this.prisma.medicalKnowledge.groupBy({
                    by: ['category'],
                    _count: { category: true }
                }),
                this.prisma.medicalKnowledge.groupBy({
                    by: ['specialty'],
                    _count: { specialty: true },
                    where: { specialty: { not: null } }
                }),
                this.prisma.medicalKnowledge.aggregate({
                    _avg: { trustScore: true },
                    where: { trustScore: { not: null } }
                })
            ]);

            const categoryCounts = Object.fromEntries(
                categoryStats.map(stat => [stat.category, stat._count.category])
            );

            const specialtyCounts = Object.fromEntries(
                specialtyStats.map(stat => [stat.specialty!, stat._count.specialty])
            );

            return {
                totalDocuments,
                categoryCounts,
                specialtyCounts,
                averageTrustScore: trustScoreAvg._avg.trustScore || 0
            };

        } catch (error) {
            console.error('Failed to get global knowledge stats:', error);
            return {
                totalDocuments: 0,
                categoryCounts: {},
                specialtyCounts: {},
                averageTrustScore: 0
            };
        }
    }

    // Private helper methods

    private async generateEmbedding(text: string): Promise<number[]> {
        try {
            // For now, create a mock embedding - in production, this would use OpenAI embeddings API
            const mockEmbedding = Array.from({ length: 1536 }, () => Math.random() - 0.5);
            return mockEmbedding;
        } catch (error) {
            console.error('Embedding generation failed:', error);
            throw new Error('Failed to generate embedding');
        }
    }

    private extractMedicalTags(content: string): string[] {
        const medicalTerms = [
            // Symptoms
            'fever', 'pain', 'headache', 'nausea', 'fatigue', 'dizziness', 'shortness of breath',
            'chest pain', 'abdominal pain', 'back pain', 'joint pain', 'muscle pain',

            // Conditions  
            'diabetes', 'hypertension', 'heart disease', 'cancer', 'stroke', 'pneumonia',
            'covid-19', 'flu', 'asthma', 'arthritis', 'depression', 'anxiety',

            // Treatments
            'medication', 'surgery', 'therapy', 'treatment', 'prescription', 'dose',
            'antibiotic', 'vaccine', 'chemotherapy', 'radiation', 'physical therapy',

            // Body systems
            'cardiovascular', 'respiratory', 'neurological', 'gastrointestinal', 'endocrine',
            'musculoskeletal', 'dermatological', 'psychiatric', 'renal', 'hepatic',

            // Tests and procedures
            'blood test', 'x-ray', 'mri', 'ct scan', 'ultrasound', 'biopsy', 'ecg', 'ekg'
        ];

        const lowerContent = content.toLowerCase();
        const foundTerms = medicalTerms.filter(term => lowerContent.includes(term));

        // Remove duplicates and limit to 10 tags
        return [...new Set(foundTerms)].slice(0, 10);
    }

    private detectMedicalCategory(query: string): string | undefined {
        const categoryKeywords = {
            [MedicalCategory.SYMPTOMS]: ['symptom', 'feel', 'pain', 'ache', 'hurt', 'sick'],
            [MedicalCategory.DISEASES]: ['disease', 'condition', 'syndrome', 'disorder'],
            [MedicalCategory.TREATMENTS]: ['treatment', 'therapy', 'cure', 'heal', 'remedy'],
            [MedicalCategory.MEDICATIONS]: ['medication', 'drug', 'pill', 'prescription', 'dose'],
            [MedicalCategory.DIAGNOSIS]: ['diagnose', 'test', 'exam', 'check', 'scan'],
            [MedicalCategory.PREVENTION]: ['prevent', 'avoid', 'protect', 'reduce risk']
        };

        const lowerQuery = query.toLowerCase();

        for (const [category, keywords] of Object.entries(categoryKeywords)) {
            if (keywords.some(keyword => lowerQuery.includes(keyword))) {
                return category;
            }
        }

        return undefined;
    }

    private async generateMedicalResponse(
        query: string,
        globalMatches: SearchResult[],
        sessionMatches: SearchResult[],
        medicalContext?: MedicalContext
    ): Promise<{ content: string; cost: number }> {
        try {
            // Prepare context from search results
            const globalContext = globalMatches.map((match, i) =>
                `Global Knowledge ${i + 1}: ${match.payload.content.substring(0, 300)}...`
            ).join('\n\n');

            const sessionContext = sessionMatches.map((match, i) =>
                `Session Document ${i + 1}: ${match.payload.content.substring(0, 300)}...`
            ).join('\n\n');

            // Prepare medical context
            const contextInfo = medicalContext ? `
Patient Context:
- Age: ${medicalContext.patientAge || 'Not specified'}
- Gender: ${medicalContext.patientGender || 'Not specified'}
- Medical History: ${medicalContext.medicalHistory?.join(', ') || 'None specified'}
- Current Symptoms: ${medicalContext.currentSymptoms?.join(', ') || 'None specified'}
- Specialty Focus: ${medicalContext.specialty || 'General'}
` : '';

            const systemPrompt = `You are a medical AI assistant. Provide accurate, evidence-based information based on the available knowledge. 

IMPORTANT MEDICAL DISCLAIMERS:
- This information is for educational purposes only
- Always recommend consulting healthcare professionals for medical advice
- Do not provide specific diagnoses or prescriptions
- Emphasize the importance of professional medical evaluation

Available Knowledge:
${globalContext}

Session Documents:
${sessionContext}

${contextInfo}

Provide a comprehensive response based on the available information, cite sources when possible, and include appropriate medical disclaimers.`;

            const response = await modelRepository.complete(
                'openai',
                [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: query }
                ],
                {
                    temperature: 0.7,
                    maxTokens: 1000
                }
            );

            const cost = response.usage.totalTokens * 0.00000075; // Estimate cost

            return { content: response.content, cost };

        } catch (error) {
            console.error('Medical response generation failed:', error);
            return {
                content: 'I apologize, but I encountered an issue processing your medical query. Please consult with a healthcare professional for assistance.',
                cost: 0
            };
        }
    }

    private createMedicalCitations(
        globalMatches: SearchResult[],
        sessionMatches: SearchResult[]
    ): MedicalCitation[] {
        const citations: MedicalCitation[] = [];

        // Add global knowledge citations
        globalMatches.forEach((match, index) => {
            citations.push({
                id: `global-${index}`,
                title: match.payload.title || 'Medical Knowledge',
                source: match.payload.metadata?.source || 'Medical Database',
                url: match.payload.metadata?.url,
                relevanceScore: match.score,
                trustScore: match.payload.metadata?.trustScore || 0.8,
                snippet: match.payload.content.substring(0, 200) + '...',
                category: match.payload.category as MedicalCategory || MedicalCategory.GENERAL
            });
        });

        // Add session document citations
        sessionMatches.forEach((match, index) => {
            citations.push({
                id: `session-${index}`,
                title: match.payload.title || 'Uploaded Document',
                source: 'User Document',
                relevanceScore: match.score,
                trustScore: 0.9, // High trust for user documents
                snippet: match.payload.content.substring(0, 200) + '...',
                category: MedicalCategory.GENERAL
            });
        });

        return citations;
    }

    private calculateResponseConfidence(
        globalMatches: SearchResult[],
        sessionMatches: SearchResult[]
    ): number {
        if (globalMatches.length === 0 && sessionMatches.length === 0) {
            return 0.3; // Low confidence without any matches
        }

        // Calculate average score from matches
        const allMatches = [...globalMatches, ...sessionMatches];
        const averageScore = allMatches.reduce((sum, match) => sum + match.score, 0) / allMatches.length;

        // Boost confidence if we have both global and session matches
        const diversityBonus = (globalMatches.length > 0 && sessionMatches.length > 0) ? 0.1 : 0;

        return Math.min(0.95, averageScore + diversityBonus);
    }
}

// Export singleton instance
let medicalDataServiceInstance: MedicalDataService | null = null;

export function getMedicalDataService(prisma: PrismaClient): MedicalDataService {
    if (!medicalDataServiceInstance) {
        medicalDataServiceInstance = new MedicalDataService(prisma);
    }
    return medicalDataServiceInstance;
}
