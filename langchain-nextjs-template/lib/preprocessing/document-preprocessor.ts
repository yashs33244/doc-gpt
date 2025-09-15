/**
 * Document Preprocessing Service for Doctor GPT
 * Implements Agentic AI Patterns for medical document processing
 * 
 * Features:
 * - Clean medical docs (remove headers/footers/page numbers/duplicates)
 * - Normalize units and medical terms
 * - Semantic chunking (200-500 tokens with 50-100 overlap)
 * - Rich metadata attachment
 * - Real embeddings generation
 * - Version tracking with timestamps
 */

import { PrismaClient } from '@prisma/client';
import { getQdrantService } from '../vector/qdrant-service';
import { modelRepository } from '../models/repository';
import { costTracker } from '../cost-tracking/tracker';
import { Operation } from '../cost-tracking/types';

// Types for document preprocessing
export interface DocumentChunk {
    id: string;
    documentId: string;
    content: string;
    startIndex: number;
    endIndex: number;
    tokenCount: number;
    chunkIndex: number;
    semanticSection?: string;
    metadata: ChunkMetadata;
}

export interface ChunkMetadata {
    patientId?: string;
    doctorId?: string;
    docType: string;
    date: string;
    source: string;
    section?: string;
    medicalTerms: string[];
    normalizedUnits: Record<string, string>;
    confidence: number;
    processingVersion: string;
    chunkType: 'header' | 'body' | 'footer' | 'table' | 'list' | 'conclusion';
}

export interface PreprocessingResult {
    success: boolean;
    documentId: string;
    chunks: DocumentChunk[];
    metadata: ProcessingMetadata;
    embeddings: EmbeddingResult[];
    error?: string;
    cost: PreprocessingCost;
}

export interface ProcessingMetadata {
    originalLength: number;
    cleanedLength: number;
    chunkCount: number;
    processingTime: number;
    version: string;
    timestamp: string;
    qualityScore: number;
    detectedLanguage: string;
    documentStructure: DocumentStructure;
}

export interface DocumentStructure {
    hasHeader: boolean;
    hasFooter: boolean;
    hasTables: boolean;
    hasLists: boolean;
    pageCount?: number;
    sections: string[];
}

export interface EmbeddingResult {
    chunkId: string;
    embedding: number[];
    model: string;
    cost: number;
}

export interface PreprocessingCost {
    extraction: number;
    cleaning: number;
    chunking: number;
    embedding: number;
    storage: number;
    total: number;
}

export class DocumentPreprocessor {
    private prisma: PrismaClient;
    private qdrant: ReturnType<typeof getQdrantService>;
    private version = '1.2.0';

    // Medical term normalization mappings
    private medicalTermMappings = {
        // Units
        'mg': 'milligrams',
        'mcg': 'micrograms',
        'ml': 'milliliters',
        'cc_volume': 'cubic_centimeters',
        'mmHg': 'millimeters_mercury',
        'bpm': 'beats_per_minute',
        'kg': 'kilograms',
        'lbs': 'pounds',
        'in': 'inches',
        'cm': 'centimeters',
        'ft': 'feet',

        // Common abbreviations
        'pt': 'patient',
        'pts': 'patients',
        'dx': 'diagnosis',
        'tx': 'treatment',
        'rx': 'prescription',
        'sx': 'symptoms',
        'hx': 'history',
        'pe': 'physical_examination',
        'cc': 'chief_complaint',
        'hpi': 'history_of_present_illness',
        'pmh': 'past_medical_history',
        'sh': 'social_history',
        'fh': 'family_history',
        'ros': 'review_of_systems',
        'a&p': 'assessment_and_plan',

        // Vital signs
        'hr': 'heart_rate',
        'bp': 'blood_pressure',
        'rr': 'respiratory_rate',
        'temp': 'temperature',
        'o2sat': 'oxygen_saturation',
        'wt': 'weight',
        'ht': 'height'
    };

    // Medical units normalization
    private unitConversions = {
        'mg/dl': 'milligrams_per_deciliter',
        'mmol/l': 'millimoles_per_liter',
        'mEq/L': 'milliequivalents_per_liter',
        'mg%': 'milligrams_percent',
        'g/dl': 'grams_per_deciliter',
        'u/l': 'units_per_liter',
        'iu/l': 'international_units_per_liter',
        'ng/ml': 'nanograms_per_milliliter',
        'pg/ml': 'picograms_per_milliliter',
        'μg/dl': 'micrograms_per_deciliter'
    };

    constructor(prisma: PrismaClient) {
        this.prisma = prisma;
        this.qdrant = getQdrantService();

        // Initialize Qdrant collections on startup
        this.initializeQdrant().catch(error => {
            console.warn('Failed to initialize Qdrant collections:', error.message);
        });
    }

    /**
     * Initialize Qdrant collections
     */
    private async initializeQdrant(): Promise<void> {
        try {
            await this.qdrant.initializeCollections();
            console.log('✅ Qdrant collections initialized');
        } catch (error) {
            console.error('❌ Failed to initialize Qdrant collections:', error);
            throw error;
        }
    }

    /**
     * Main preprocessing pipeline
     */
    async preprocessDocument(
        documentId: string,
        rawContent: string,
        metadata: Partial<ChunkMetadata>,
        context?: {
            userId?: string;
            sessionId?: string;
        }
    ): Promise<PreprocessingResult> {
        const startTime = Date.now();
        const cost: PreprocessingCost = {
            extraction: 0,
            cleaning: 0,
            chunking: 0,
            embedding: 0,
            storage: 0,
            total: 0
        };

        try {
            console.log(`Starting document preprocessing for ${documentId}`);

            // Step 1: Document Analysis and Structure Detection
            const documentStructure = await this.analyzeDocumentStructure(rawContent);

            // Step 2: Clean the document
            const { cleanedContent, cleaningCost } = await this.cleanDocument(rawContent, documentStructure);
            cost.cleaning = cleaningCost;

            // Step 3: Normalize medical terms and units
            const { normalizedContent, normalizedUnits, medicalTerms } = await this.normalizeContent(cleanedContent);

            // Step 4: Semantic chunking
            const { chunks, chunkingCost } = await this.performSemanticChunking(
                normalizedContent,
                documentId,
                {
                    ...metadata,
                    normalizedUnits,
                    medicalTerms,
                    processingVersion: this.version,
                    confidence: 0.9,
                    docType: metadata.docType || 'unknown'
                }
            );
            cost.chunking = chunkingCost;

            // Step 5: Generate embeddings for each chunk
            const { embeddings, embeddingCost } = await this.generateEmbeddings(chunks);
            cost.embedding = embeddingCost;

            // Step 6: Initialize Qdrant if needed and store in databases
            try {
                await this.qdrant.initializeCollections();
            } catch (initError) {
                console.warn('Qdrant initialization warning:', initError);
            }

            const storageCost = await this.storeProcessedDocument(documentId, chunks, embeddings, context);
            cost.storage = storageCost;

            // Calculate processing metadata
            const processingTime = Date.now() - startTime;
            cost.total = cost.cleaning + cost.chunking + cost.embedding + cost.storage;

            const processingMetadata: ProcessingMetadata = {
                originalLength: rawContent.length,
                cleanedLength: cleanedContent.length,
                chunkCount: chunks.length,
                processingTime,
                version: this.version,
                timestamp: new Date().toISOString(),
                qualityScore: this.calculateQualityScore(rawContent, cleanedContent, chunks),
                detectedLanguage: 'en', // TODO: Implement language detection
                documentStructure
            };

            // Track costs
            await costTracker.trackCost({
                userId: metadata.patientId || 'system',
                operation: Operation.FILE_PROCESSING,
                provider: 'document_preprocessor',
                inputCost: cost.total * 0.6,
                outputCost: cost.total * 0.4,
                totalCost: cost.total,
                currency: 'USD',
                metadata: {
                    documentId,
                    chunkCount: chunks.length,
                    processingTime,
                    version: this.version
                }
            });

            console.log(`Document preprocessing completed for ${documentId} in ${processingTime}ms`);

            return {
                success: true,
                documentId,
                chunks,
                metadata: processingMetadata,
                embeddings,
                cost
            };

        } catch (error) {
            console.error(`Document preprocessing failed for ${documentId}:`, error);

            return {
                success: false,
                documentId,
                chunks: [],
                metadata: {
                    originalLength: rawContent.length,
                    cleanedLength: 0,
                    chunkCount: 0,
                    processingTime: Date.now() - startTime,
                    version: this.version,
                    timestamp: new Date().toISOString(),
                    qualityScore: 0,
                    detectedLanguage: 'unknown',
                    documentStructure: {
                        hasHeader: false,
                        hasFooter: false,
                        hasTables: false,
                        hasLists: false,
                        sections: []
                    }
                },
                embeddings: [],
                error: error instanceof Error ? error.message : 'Unknown error',
                cost
            };
        }
    }

    /**
     * Analyze document structure to identify headers, footers, tables, etc.
     */
    private async analyzeDocumentStructure(content: string): Promise<DocumentStructure> {
        const lines = content.split('\n');

        // Detect headers (usually first few lines with dates, hospital names, etc.)
        const hasHeader = this.detectHeader(lines);

        // Detect footers (usually last few lines with page numbers, disclaimers, etc.)
        const hasFooter = this.detectFooter(lines);

        // Detect tables (lines with multiple tabs/pipes or consistent spacing)
        const hasTables = this.detectTables(content);

        // Detect lists (lines starting with bullets, numbers, dashes)
        const hasLists = this.detectLists(lines);

        // Extract sections based on headers and medical patterns
        const sections = this.extractSections(content);

        return {
            hasHeader,
            hasFooter,
            hasTables,
            hasLists,
            pageCount: this.estimatePageCount(content),
            sections
        };
    }

    /**
     * Clean document by removing headers, footers, page numbers, and duplicates
     */
    private async cleanDocument(
        content: string,
        structure: DocumentStructure
    ): Promise<{ cleanedContent: string; cleaningCost: number }> {
        let cleaned = content;
        const startTime = Date.now();

        // Remove headers and footers based on structure analysis
        if (structure.hasHeader) {
            cleaned = this.removeHeaders(cleaned);
        }

        if (structure.hasFooter) {
            cleaned = this.removeFooters(cleaned);
        }

        // Remove page numbers and page breaks
        cleaned = this.removePageNumbers(cleaned);

        // Remove duplicate content (common in scanned documents)
        cleaned = this.removeDuplicateContent(cleaned);

        // Remove excessive whitespace and normalize line breaks
        cleaned = this.normalizeWhitespace(cleaned);

        // Remove non-medical boilerplate text
        cleaned = this.removeBoilerplate(cleaned);

        const processingTime = Date.now() - startTime;
        const cleaningCost = processingTime * 0.00001; // Estimate cost based on processing time

        return { cleanedContent: cleaned, cleaningCost };
    }

    /**
     * Normalize medical terms and units
     */
    private async normalizeContent(content: string): Promise<{
        normalizedContent: string;
        normalizedUnits: Record<string, string>;
        medicalTerms: string[];
    }> {
        let normalized = content;
        const normalizedUnits: Record<string, string> = {};
        const medicalTerms: string[] = [];

        // Normalize medical abbreviations
        for (const [abbrev, full] of Object.entries(this.medicalTermMappings)) {
            const regex = new RegExp(`\\b${abbrev.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
            if (regex.test(normalized)) {
                medicalTerms.push(abbrev);
                // Keep both abbreviated and full form for better searchability
                normalized = normalized.replace(regex, `${abbrev} (${full})`);
            }
        }

        // Normalize units
        for (const [unit, normalized_unit] of Object.entries(this.unitConversions)) {
            const regex = new RegExp(`\\b${unit.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
            if (regex.test(normalized)) {
                normalizedUnits[unit] = normalized_unit;
            }
        }

        // Extract additional medical terms using pattern matching
        const additionalTerms = this.extractMedicalTerms(content);
        medicalTerms.push(...additionalTerms);

        return {
            normalizedContent: normalized,
            normalizedUnits,
            medicalTerms: [...new Set(medicalTerms)] // Remove duplicates
        };
    }

    /**
     * Perform semantic chunking with 200-500 tokens and 50-100 token overlap
     */
    private async performSemanticChunking(
        content: string,
        documentId: string,
        metadata: Partial<ChunkMetadata>
    ): Promise<{ chunks: DocumentChunk[]; chunkingCost: number }> {
        const startTime = Date.now();
        const chunks: DocumentChunk[] = [];

        // Split content into sentences for better semantic coherence
        const sentences = this.splitIntoSentences(content);

        const minTokens = 200;
        const maxTokens = 500;
        const overlapTokens = 75; // Average of 50-100

        let currentChunk = '';
        let currentStartIndex = 0;
        let chunkIndex = 0;

        for (let i = 0; i < sentences.length; i++) {
            const sentence = sentences[i];
            const testChunk = currentChunk + (currentChunk ? ' ' : '') + sentence;
            const tokenCount = this.estimateTokenCount(testChunk);

            if (tokenCount >= minTokens && (tokenCount >= maxTokens || this.isSemanticBoundary(sentence, sentences[i + 1]))) {
                // Create chunk
                const chunk = await this.createChunk(
                    documentId,
                    currentChunk,
                    currentStartIndex,
                    currentStartIndex + currentChunk.length,
                    chunkIndex,
                    metadata
                );
                chunks.push(chunk);

                // Calculate overlap for next chunk
                const overlapText = this.getOverlapText(currentChunk, overlapTokens);
                currentChunk = overlapText + (overlapText ? ' ' : '') + sentence;
                currentStartIndex = currentStartIndex + currentChunk.length - overlapText.length;
                chunkIndex++;
            } else {
                currentChunk = testChunk;
            }
        }

        // Add final chunk if there's remaining content
        if (currentChunk.trim()) {
            const chunk = await this.createChunk(
                documentId,
                currentChunk,
                currentStartIndex,
                currentStartIndex + currentChunk.length,
                chunkIndex,
                metadata
            );
            chunks.push(chunk);
        }

        const processingTime = Date.now() - startTime;
        const chunkingCost = chunks.length * 0.0001; // Cost per chunk

        return { chunks, chunkingCost };
    }

    /**
     * Generate real embeddings using OpenAI embeddings model
     */
    private async generateEmbeddings(chunks: DocumentChunk[]): Promise<{
        embeddings: EmbeddingResult[];
        embeddingCost: number;
    }> {
        const embeddings: EmbeddingResult[] = [];
        let totalCost = 0;

        try {
            // Use OpenAI embeddings model
            const provider = 'openai';
            const model = 'text-embedding-3-small'; // More cost-effective option

            for (const chunk of chunks) {
                try {
                    const result = await modelRepository.generateEmbedding(
                        provider,
                        chunk.content,
                        { model }
                    );

                    embeddings.push({
                        chunkId: chunk.id,
                        embedding: result.embedding,
                        model: result.model,
                        cost: result.cost
                    });

                    totalCost += result.cost;

                } catch (error) {
                    console.error(`Failed to generate embedding for chunk ${chunk.id}:`, error);
                    // Create a fallback embedding (zeros) to maintain consistency
                    embeddings.push({
                        chunkId: chunk.id,
                        embedding: new Array(1536).fill(0), // OpenAI embedding dimension
                        model: 'fallback',
                        cost: 0
                    });
                }
            }

            return { embeddings, embeddingCost: totalCost };

        } catch (error) {
            console.error('Embedding generation failed:', error);
            throw new Error(`Failed to generate embeddings: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Store processed document chunks and embeddings in databases
     */
    private async storeProcessedDocument(
        documentId: string,
        chunks: DocumentChunk[],
        embeddings: EmbeddingResult[],
        context?: {
            userId?: string;
            sessionId?: string;
        }
    ): Promise<number> {
        let storageCost = 0;

        try {
            // Store chunks in PostgreSQL
            for (const chunk of chunks) {
                await this.prisma.documentChunk.upsert({
                    where: { id: chunk.id },
                    update: {
                        content: chunk.content,
                        startIndex: chunk.startIndex,
                        endIndex: chunk.endIndex,
                        tokenCount: chunk.tokenCount,
                        chunkIndex: chunk.chunkIndex,
                        semanticSection: chunk.semanticSection,
                        metadata: chunk.metadata as any,
                        updatedAt: new Date()
                    },
                    create: {
                        id: chunk.id,
                        medicalReportId: chunk.documentId, // Use medicalReportId for medical reports
                        content: chunk.content,
                        startIndex: chunk.startIndex,
                        endIndex: chunk.endIndex,
                        tokenCount: chunk.tokenCount,
                        chunkIndex: chunk.chunkIndex,
                        semanticSection: chunk.semanticSection,
                        metadata: chunk.metadata as any
                    }
                });
            }

            // Store embeddings in Qdrant vector database
            for (const embedding of embeddings) {
                const chunk = chunks.find(c => c.id === embedding.chunkId);
                if (chunk) {
                    try {
                        // Validate embedding dimensions
                        if (!Array.isArray(embedding.embedding) || embedding.embedding.length !== 1536) {
                            throw new Error(`Invalid embedding dimensions: expected 1536, got ${embedding.embedding?.length || 'undefined'}`);
                        }

                        // Validate embedding values
                        if (embedding.embedding.some(val => isNaN(val) || !isFinite(val))) {
                            throw new Error('Embedding contains invalid values (NaN or Infinity)');
                        }

                        // Clean the chunk ID to ensure it's valid for Qdrant
                        const cleanChunkId = chunk.id.replace(/[^a-zA-Z0-9_-]/g, '_');

                        await this.qdrant.storeFileVector(cleanChunkId, embedding.embedding, {
                            content: chunk.content.substring(0, 1000), // Limit content size more aggressively
                            title: `Chunk_${chunk.chunkIndex}`, // Simplify title
                            sessionId: (context?.sessionId || `doc-${documentId}`).substring(0, 64), // Limit length
                            userId: (context?.userId || 'system').substring(0, 32), // Limit length
                            fileType: 'processed_chunk',
                            tags: (chunk.metadata.medicalTerms || []).slice(0, 5), // Reduce tags
                            metadata: {
                                embeddingModel: embedding.model,
                                tokenCount: chunk.tokenCount,
                                documentId: documentId.substring(0, 64),
                                chunkIndex: chunk.chunkIndex,
                                processingVersion: this.version
                            }
                        });

                        console.log(`✅ Successfully stored vector for chunk ${chunk.id}`);
                    } catch (vectorError: any) {
                        console.error(`Failed to store vector for chunk ${chunk.id}:`, vectorError.message);
                        console.error('Embedding details:', {
                            chunkId: chunk.id,
                            embeddingLength: embedding.embedding?.length,
                            embeddingModel: embedding.model,
                            hasNaN: embedding.embedding?.some(val => isNaN(val)),
                            hasInfinity: embedding.embedding?.some(val => !isFinite(val))
                        });
                        // Continue with other chunks - don't fail the entire process
                        console.warn(`⚠️  Skipping vector storage for chunk ${chunk.id} due to error`);
                    }
                }
            }

            storageCost = chunks.length * 0.00005; // Estimate storage cost

            return storageCost;

        } catch (error) {
            console.error('Storage failed:', error);
            throw new Error(`Failed to store processed document: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    // Helper methods for document analysis and processing

    private detectHeader(lines: string[]): boolean {
        const firstFewLines = lines.slice(0, 5).join(' ').toLowerCase();
        const headerPatterns = [
            /hospital|clinic|medical center|health system/,
            /patient.*report|medical.*record|discharge.*summary/,
            /date.*birth|dob|patient.*id|mrn/,
            /confidential|private|protected.*health.*information/
        ];

        return headerPatterns.some(pattern => pattern.test(firstFewLines));
    }

    private detectFooter(lines: string[]): boolean {
        const lastFewLines = lines.slice(-5).join(' ').toLowerCase();
        const footerPatterns = [
            /page \d+|page \d+ of \d+/,
            /confidential|do not distribute/,
            /printed on|generated on|report date/,
            /end of report|report completed/
        ];

        return footerPatterns.some(pattern => pattern.test(lastFewLines));
    }

    private detectTables(content: string): boolean {
        const lines = content.split('\n');
        let tableLineCount = 0;

        for (const line of lines) {
            // Check for table indicators: multiple tabs, pipes, or consistent spacing
            if (line.includes('\t\t') || line.includes('|') || /\s{4,}\S+\s{4,}/.test(line)) {
                tableLineCount++;
            }
        }

        return tableLineCount >= 3; // At least 3 lines that look like table content
    }

    private detectLists(lines: string[]): boolean {
        let listLineCount = 0;

        for (const line of lines) {
            const trimmed = line.trim();
            if (/^[\-\*\•]\s|^\d+[\.\)]\s|^[a-zA-Z][\.\)]\s/.test(trimmed)) {
                listLineCount++;
            }
        }

        return listLineCount >= 2; // At least 2 list items
    }

    private extractSections(content: string): string[] {
        const sections: string[] = [];
        const sectionPatterns = [
            /^(chief complaint|cc):/im,
            /^(history of present illness|hpi):/im,
            /^(past medical history|pmh):/im,
            /^(social history|sh):/im,
            /^(family history|fh):/im,
            /^(review of systems|ros):/im,
            /^(physical examination|pe):/im,
            /^(assessment and plan|a&p|assessment|plan):/im,
            /^(laboratory|labs|lab results):/im,
            /^(imaging|radiology):/im,
            /^(medications|meds):/im,
            /^(allergies):/im,
            /^(vital signs|vitals):/im,
            /^(impression|diagnosis):/im
        ];

        for (const pattern of sectionPatterns) {
            const match = content.match(pattern);
            if (match) {
                sections.push(match[1].toLowerCase());
            }
        }

        return sections;
    }

    private estimatePageCount(content: string): number {
        // Rough estimate: 500 words per page, average 5 characters per word
        const charCount = content.length;
        return Math.ceil(charCount / 2500);
    }

    private removeHeaders(content: string): string {
        const lines = content.split('\n');

        // Remove first few lines that look like headers
        let startIndex = 0;
        for (let i = 0; i < Math.min(10, lines.length); i++) {
            const line = lines[i].toLowerCase();
            if (this.isHeaderLine(line)) {
                startIndex = i + 1;
            } else if (line.trim() && !this.isHeaderLine(line)) {
                break;
            }
        }

        return lines.slice(startIndex).join('\n');
    }

    private removeFooters(content: string): string {
        const lines = content.split('\n');

        // Remove last few lines that look like footers
        let endIndex = lines.length;
        for (let i = lines.length - 1; i >= Math.max(0, lines.length - 10); i--) {
            const line = lines[i].toLowerCase();
            if (this.isFooterLine(line)) {
                endIndex = i;
            } else if (line.trim() && !this.isFooterLine(line)) {
                break;
            }
        }

        return lines.slice(0, endIndex).join('\n');
    }

    private isHeaderLine(line: string): boolean {
        const headerPatterns = [
            /hospital|clinic|medical center/,
            /patient.*report|medical.*record/,
            /confidential|private|protected/,
            /^\s*$/, // Empty lines at start
            /^\s*page\s*\d+/
        ];

        return headerPatterns.some(pattern => pattern.test(line));
    }

    private isFooterLine(line: string): boolean {
        const footerPatterns = [
            /page \d+|page \d+ of \d+/,
            /confidential|do not distribute/,
            /printed on|generated on/,
            /end of report|report completed/,
            /^\s*$/ // Empty lines at end
        ];

        return footerPatterns.some(pattern => pattern.test(line));
    }

    private removePageNumbers(content: string): string {
        // Remove standalone page numbers and page breaks
        return content
            .replace(/\n\s*page\s+\d+\s*\n/gi, '\n')
            .replace(/\n\s*\d+\s*\n/g, '\n')
            .replace(/\f/g, '\n'); // Form feed characters
    }

    private removeDuplicateContent(content: string): string {
        const lines = content.split('\n');
        const uniqueLines = [];
        const seenLines = new Set();

        for (const line of lines) {
            const normalized = line.trim().toLowerCase();
            if (normalized && !seenLines.has(normalized)) {
                seenLines.add(normalized);
                uniqueLines.push(line);
            } else if (!normalized) {
                // Keep empty lines but don't check for duplicates
                uniqueLines.push(line);
            }
        }

        return uniqueLines.join('\n');
    }

    private normalizeWhitespace(content: string): string {
        return content
            .replace(/\r\n/g, '\n') // Normalize line endings
            .replace(/\r/g, '\n')
            .replace(/\n{3,}/g, '\n\n') // Replace multiple newlines with double newlines
            .replace(/[ \t]{2,}/g, ' ') // Replace multiple spaces with single space
            .replace(/^\s+|\s+$/g, ''); // Trim start and end
    }

    private removeBoilerplate(content: string): string {
        const boilerplatePatterns = [
            /this.*is.*confidential.*information/gi,
            /do.*not.*distribute.*without.*permission/gi,
            /protected.*health.*information/gi,
            /for.*medical.*purposes.*only/gi
        ];

        let cleaned = content;
        for (const pattern of boilerplatePatterns) {
            cleaned = cleaned.replace(pattern, '');
        }

        return cleaned;
    }

    private extractMedicalTerms(content: string): string[] {
        const medicalPatterns = [
            // Medications (usually end with common suffixes)
            /\b\w+(?:mycin|cillin|prazole|olol|sartan|statin|ide|ine|ole)\b/gi,
            // Medical conditions (common patterns)
            /\b(?:chronic|acute|severe|mild)\s+\w+/gi,
            // Body parts and systems
            /\b(?:cardio|pulmo|neuro|gastro|hepato|renal)\w*/gi,
            // Lab values
            /\b\w+\s*(?:mg\/dl|mmol\/l|mEq\/L|u\/l|ng\/ml|pg\/ml)\b/gi
        ];

        const terms: string[] = [];

        for (const pattern of medicalPatterns) {
            const matches = content.match(pattern) || [];
            terms.push(...matches.map(match => match.toLowerCase().trim()));
        }

        return [...new Set(terms)]; // Remove duplicates
    }

    private splitIntoSentences(content: string): string[] {
        // Split by sentence endings, but be careful with medical abbreviations
        const sentences = content
            .replace(/([.!?])\s+/g, '$1|SPLIT|')
            .split('|SPLIT|')
            .map(s => s.trim())
            .filter(s => s.length > 0);

        return sentences;
    }

    private estimateTokenCount(text: string): number {
        // Rough estimate: 1 token ≈ 4 characters for English text
        return Math.ceil(text.length / 4);
    }

    private isSemanticBoundary(currentSentence: string, nextSentence?: string): boolean {
        if (!nextSentence) return true;

        // Check for section boundaries
        const sectionStarters = [
            /^(chief complaint|history of present illness|past medical history|social history|family history|review of systems|physical examination|assessment and plan|laboratory|imaging|medications|allergies|vital signs|impression|diagnosis):/i
        ];

        return sectionStarters.some(pattern => pattern.test(nextSentence.trim()));
    }

    private getOverlapText(text: string, targetTokens: number): string {
        const words = text.split(' ');
        const targetWords = Math.ceil(targetTokens * 0.75); // Approximate word count from tokens

        if (words.length <= targetWords) return text;

        return words.slice(-targetWords).join(' ');
    }

    private async createChunk(
        documentId: string,
        content: string,
        startIndex: number,
        endIndex: number,
        chunkIndex: number,
        metadata: Partial<ChunkMetadata>
    ): Promise<DocumentChunk> {
        const chunkId = `${documentId}_chunk_${chunkIndex}`;

        // Determine chunk type based on content
        const chunkType = this.determineChunkType(content);

        // Extract semantic section
        const semanticSection = this.extractSemanticSection(content);

        return {
            id: chunkId,
            documentId,
            content: content.trim(),
            startIndex,
            endIndex,
            tokenCount: this.estimateTokenCount(content),
            chunkIndex,
            semanticSection,
            metadata: {
                patientId: metadata.patientId,
                doctorId: metadata.doctorId,
                docType: metadata.docType || 'unknown',
                date: metadata.date || new Date().toISOString(),
                source: metadata.source || 'unknown',
                section: semanticSection,
                medicalTerms: metadata.medicalTerms || [],
                normalizedUnits: metadata.normalizedUnits || {},
                confidence: metadata.confidence || 0.8,
                processingVersion: this.version,
                chunkType
            }
        };
    }

    private determineChunkType(content: string): ChunkMetadata['chunkType'] {
        const lowerContent = content.toLowerCase();

        if (/^(chief complaint|cc):/i.test(content)) return 'header';
        if (/^(assessment|plan|impression|diagnosis):/i.test(content)) return 'conclusion';
        if (/\||\t\t|^\s*\d+\.?\s+\S+/.test(content)) return 'table';
        if (/^[\-\*\•]\s|^\d+[\.\)]\s/.test(content)) return 'list';

        return 'body';
    }

    private extractSemanticSection(content: string): string | undefined {
        const sectionPatterns = [
            { pattern: /^(chief complaint|cc):/i, section: 'chief_complaint' },
            { pattern: /^(history of present illness|hpi):/i, section: 'history_present_illness' },
            { pattern: /^(past medical history|pmh):/i, section: 'past_medical_history' },
            { pattern: /^(social history|sh):/i, section: 'social_history' },
            { pattern: /^(family history|fh):/i, section: 'family_history' },
            { pattern: /^(review of systems|ros):/i, section: 'review_of_systems' },
            { pattern: /^(physical examination|pe):/i, section: 'physical_examination' },
            { pattern: /^(assessment and plan|a&p|assessment|plan):/i, section: 'assessment_plan' },
            { pattern: /^(laboratory|labs|lab results):/i, section: 'laboratory' },
            { pattern: /^(imaging|radiology):/i, section: 'imaging' },
            { pattern: /^(medications|meds):/i, section: 'medications' },
            { pattern: /^(allergies):/i, section: 'allergies' },
            { pattern: /^(vital signs|vitals):/i, section: 'vital_signs' },
            { pattern: /^(impression|diagnosis):/i, section: 'diagnosis' }
        ];

        for (const { pattern, section } of sectionPatterns) {
            if (pattern.test(content.trim())) {
                return section;
            }
        }

        return undefined;
    }

    private calculateQualityScore(original: string, cleaned: string, chunks: DocumentChunk[]): number {
        let score = 0.5; // Base score

        // Text reduction score (good if we removed noise but kept content)
        const reductionRatio = cleaned.length / original.length;
        if (reductionRatio >= 0.7 && reductionRatio <= 0.95) score += 0.2;

        // Chunk distribution score (good if chunks are reasonably sized)
        const avgChunkSize = chunks.reduce((sum, chunk) => sum + chunk.tokenCount, 0) / chunks.length;
        if (avgChunkSize >= 200 && avgChunkSize <= 500) score += 0.2;

        // Medical content score (good if we found medical terms)
        const medicalTermCount = chunks.reduce((sum, chunk) => sum + chunk.metadata.medicalTerms.length, 0);
        if (medicalTermCount >= chunks.length) score += 0.1; // At least 1 medical term per chunk

        return Math.min(1.0, score);
    }
}

// Export singleton instance
let documentPreprocessorInstance: DocumentPreprocessor | null = null;

export function getDocumentPreprocessor(prisma: PrismaClient): DocumentPreprocessor {
    if (!documentPreprocessorInstance) {
        documentPreprocessorInstance = new DocumentPreprocessor(prisma);
    }
    return documentPreprocessorInstance;
}
