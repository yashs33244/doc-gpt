/**
 * Medical Document Upload API
 * Handles file uploads with text extraction and processing for medical documents
 */

import { NextRequest, NextResponse } from 'next/server';

// Force Node.js runtime for Prisma compatibility
export const runtime = 'nodejs';
import { PrismaClient } from '@prisma/client';
import { config } from '../../../../config';
import { costTracker } from '../../../../lib/cost-tracking/tracker';
import { Operation } from '../../../../lib/cost-tracking/types';

// Initialize Prisma client
const prisma = new PrismaClient();

// File type mappings
const ALLOWED_FILE_TYPES = {
    'application/pdf': 'pdf',
    'text/plain': 'txt',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif'
} as const;

const MEDICAL_REPORT_TYPES = {
    'lab_report': 'LAB_REPORT',
    'prescription': 'PRESCRIPTION',
    'diagnostic_image': 'DIAGNOSTIC_IMAGE',
    'medical_history': 'MEDICAL_HISTORY',
    'discharge_summary': 'DISCHARGE_SUMMARY',
    'consultation_note': 'CONSULTATION_NOTE',
    'other': 'OTHER'
} as const;

interface UploadRequest {
    userId?: string;
    sessionId?: string;
    reportType?: keyof typeof MEDICAL_REPORT_TYPES;
    metadata?: Record<string, any>;
}

interface UploadResponse {
    success: boolean;
    document?: {
        id: string;
        fileName: string;
        fileType: string;
        fileSize: number;
        extractedText: string;
        summary?: string;
        reportType: string;
        processingStatus: string;
    };
    error?: string;
    cost?: {
        totalCost: number;
        breakdown: Record<string, number>;
    };
}

export async function POST(req: NextRequest) {
    const startTime = Date.now();

    try {
        // Parse form data
        const formData = await req.formData();
        const file = formData.get('file') as File;
        const userId = formData.get('userId') as string || crypto.randomUUID();
        const sessionId = formData.get('sessionId') as string || crypto.randomUUID();
        const reportType = (formData.get('reportType') as string) || 'other';
        const metadataStr = formData.get('metadata') as string;

        // Validate file
        if (!file) {
            return NextResponse.json(
                { success: false, error: 'No file provided' },
                { status: 400 }
            );
        }

        // Check file size
        if (file.size > config.maxFileSize) {
            return NextResponse.json(
                { success: false, error: `File size exceeds limit of ${config.maxFileSize / 1024 / 1024}MB` },
                { status: 400 }
            );
        }

        // Check file type
        if (!Object.keys(ALLOWED_FILE_TYPES).includes(file.type)) {
            return NextResponse.json(
                { success: false, error: `File type ${file.type} not supported` },
                { status: 400 }
            );
        }

        const fileType = ALLOWED_FILE_TYPES[file.type as keyof typeof ALLOWED_FILE_TYPES];

        // Parse metadata
        let metadata: Record<string, any> = {};
        try {
            if (metadataStr) {
                metadata = JSON.parse(metadataStr);
            }
        } catch {
            console.warn('Failed to parse metadata, using empty object');
        }

        console.log(`Processing file upload: ${file.name} (${fileType}) for user: ${userId}`);

        // Extract text from file
        const { extractedText, extractionCost } = await extractTextFromFile(file, fileType);

        // Generate summary if text is long enough
        let summary: string | undefined;
        let summaryCost = 0;
        if (extractedText.length > 500) {
            const summaryResult = await generateDocumentSummary(extractedText, userId);
            summary = summaryResult.summary;
            summaryCost = summaryResult.cost;
        }

        // Detect report type if not specified or if 'other'
        let detectedReportType = reportType;
        let detectionCost = 0;
        if (reportType === 'other' && extractedText.length > 100) {
            const detectionResult = await detectReportType(extractedText, userId);
            detectedReportType = detectionResult.reportType;
            detectionCost = detectionResult.cost;
        }

        // Create document record in database
        const documentId = crypto.randomUUID();

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

        // Save document to database
        const medicalReport = await prisma.medicalReport.create({
            data: {
                id: documentId,
                userId,
                fileName: file.name,
                fileType,
                fileSize: file.size,
                extractedText,
                summary,
                reportType: MEDICAL_REPORT_TYPES[detectedReportType as keyof typeof MEDICAL_REPORT_TYPES] || 'OTHER',
                processingStatus: 'COMPLETED',
                medicalTags: await extractMedicalTags(extractedText),
                metadata: {
                    ...metadata,
                    originalFileName: file.name,
                    uploadTimestamp: new Date().toISOString(),
                    processingTime: Date.now() - startTime,
                    fileSize: file.size,
                    extractionMethod: getExtractionMethod(fileType)
                }
            }
        });

        // Ingest document into vector database for session-specific RAG
        try {
            const { getMedicalDataService } = await import('../../../../lib/medical/medical-data-service');
            const medicalService = getMedicalDataService(prisma);

            const sessionDocument = {
                id: documentId,
                sessionId,
                userId,
                fileName: file.name,
                content: extractedText,
                extractedText,
                fileType,
                metadata: {
                    ...metadata,
                    summary,
                    reportType: detectedReportType,
                    medicalTags: await extractMedicalTags(extractedText)
                }
            };

            const ingestResult = await medicalService.ingestSessionDocument(sessionId, userId, sessionDocument);

            if (ingestResult.success) {
                console.log(`✅ Document ${documentId} ingested into vector database`);
            } else {
                console.warn(`⚠️  Vector ingestion failed for ${documentId}: ${ingestResult.error}`);
            }
        } catch (vectorError) {
            console.error('Vector ingestion error:', vectorError);
            // Don't fail the upload if vector ingestion fails
        }

        // Track costs
        const totalCost = extractionCost + summaryCost + detectionCost;
        await costTracker.trackCost({
            userId,
            sessionId,
            operation: Operation.FILE_PROCESSING,
            provider: 'document_processor',
            inputCost: totalCost,
            outputCost: 0,
            totalCost,
            currency: 'USD',
            metadata: {
                fileName: file.name,
                fileType,
                fileSize: file.size,
                extractedTextLength: extractedText.length,
                reportType: detectedReportType,
                processingSteps: ['extraction', 'summary', 'type_detection'].filter((_, i) =>
                    [true, !!summary, detectedReportType !== reportType][i]
                )
            }
        });

        const response: UploadResponse = {
            success: true,
            document: {
                id: medicalReport.id,
                fileName: medicalReport.fileName,
                fileType: medicalReport.fileType,
                fileSize: medicalReport.fileSize,
                extractedText: medicalReport.extractedText,
                summary: medicalReport.summary || undefined,
                reportType: medicalReport.reportType || 'OTHER',
                processingStatus: medicalReport.processingStatus
            },
            cost: {
                totalCost,
                breakdown: {
                    extraction: extractionCost,
                    summary: summaryCost,
                    typeDetection: detectionCost
                }
            }
        };

        console.log(`Document processed successfully: ${documentId} in ${Date.now() - startTime}ms`);

        return NextResponse.json(response);

    } catch (error) {
        console.error('File upload processing failed:', error);

        // Track error cost
        try {
            await costTracker.trackCost({
                userId: 'unknown',
                operation: Operation.FILE_PROCESSING,
                provider: 'error',
                inputCost: 0,
                outputCost: 0.001,
                totalCost: 0.001,
                currency: 'USD',
                metadata: {
                    error: error instanceof Error ? error.message : 'Unknown error',
                    endpoint: '/api/upload/medical-documents'
                }
            });
        } catch (costError) {
            console.error('Failed to track error cost:', costError);
        }

        return NextResponse.json(
            {
                success: false,
                error: 'Failed to process file',
                details: config.isDevelopment ? (error instanceof Error ? error.message : 'Unknown error') : undefined
            },
            { status: 500 }
        );
    }
}

/**
 * Extract text from uploaded file based on file type
 */
async function extractTextFromFile(file: File, fileType: string): Promise<{ extractedText: string; extractionCost: number }> {
    const fileBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(fileBuffer);

    let extractedText = '';
    let extractionCost = 0.0005; // Base extraction cost

    try {
        switch (fileType) {
            case 'txt':
                extractedText = new TextDecoder().decode(uint8Array);
                break;

            case 'pdf':
                // In production, use a PDF parsing library like pdf-parse
                extractedText = await extractTextFromPDF(uint8Array);
                extractionCost = 0.001; // Higher cost for PDF processing
                break;

            case 'docx':
                // In production, use a DOCX parsing library
                extractedText = await extractTextFromDOCX(uint8Array);
                extractionCost = 0.001;
                break;

            case 'jpg':
            case 'png':
            case 'gif':
                // In production, use OCR service like Tesseract or cloud OCR
                extractedText = await extractTextFromImage(uint8Array, fileType);
                extractionCost = 0.002; // Higher cost for OCR
                break;

            default:
                throw new Error(`Unsupported file type: ${fileType}`);
        }

        if (!extractedText.trim()) {
            throw new Error('No text could be extracted from the file');
        }

        return { extractedText: extractedText.trim(), extractionCost };

    } catch (error) {
        console.error(`Text extraction failed for ${fileType}:`, error);
        return {
            extractedText: `[Error extracting text from ${fileType} file: ${error instanceof Error ? error.message : 'Unknown error'}]`,
            extractionCost: 0
        };
    }
}

/**
 * Extract text from PDF (placeholder implementation)
 */
async function extractTextFromPDF(buffer: Uint8Array): Promise<string> {
    // Placeholder implementation
    // In production, use pdf-parse or similar library
    return '[PDF text extraction would be implemented here with pdf-parse library]';
}

/**
 * Extract text from DOCX (placeholder implementation)  
 */
async function extractTextFromDOCX(buffer: Uint8Array): Promise<string> {
    // Placeholder implementation
    // In production, use mammoth.js or similar library
    return '[DOCX text extraction would be implemented here with mammoth.js library]';
}

/**
 * Extract text from image using OCR (placeholder implementation)
 */
async function extractTextFromImage(buffer: Uint8Array, fileType: string): Promise<string> {
    // Placeholder implementation
    // In production, use Tesseract.js or cloud OCR service
    return '[Image OCR text extraction would be implemented here with Tesseract.js or cloud OCR]';
}

/**
 * Generate document summary using AI
 */
async function generateDocumentSummary(text: string, userId: string): Promise<{ summary: string; cost: number }> {
    try {
        const { modelRepository } = await import('../../../../lib/models/repository');

        const response = await modelRepository.complete(
            'openai',
            [
                {
                    role: 'system',
                    content: 'You are a medical document summarizer. Create a concise, accurate summary of the medical document. Focus on key findings, diagnoses, treatments, and recommendations.'
                },
                {
                    role: 'user',
                    content: `Please summarize this medical document:\n\n${text.substring(0, 3000)}...` // Limit input length
                }
            ],
            { maxTokens: 200, temperature: 0.3 }
        );

        const cost = response.usage.totalTokens * 0.00000075; // Average cost

        return { summary: response.content, cost };

    } catch (error) {
        console.error('Summary generation failed:', error);
        return { summary: 'Summary generation failed', cost: 0 };
    }
}

/**
 * Detect report type using AI
 */
async function detectReportType(text: string, userId: string): Promise<{ reportType: string; cost: number }> {
    try {
        const { modelRepository } = await import('../../../../lib/models/repository');

        const response = await modelRepository.complete(
            'openai',
            [
                {
                    role: 'system',
                    content: `You are a medical document classifier. Classify the document type based on its content. 
          
          Choose from these types:
          - lab_report: Laboratory test results, blood work, pathology reports
          - prescription: Medication prescriptions, pharmacy records
          - diagnostic_image: Radiology reports, imaging studies, X-ray reports
          - medical_history: Patient history, previous conditions, family history
          - discharge_summary: Hospital discharge summaries, treatment summaries
          - consultation_note: Doctor visits, consultation notes, progress notes
          - other: Any other medical document
          
          Respond with only the type name (e.g., "lab_report").`
                },
                {
                    role: 'user',
                    content: `Classify this medical document:\n\n${text.substring(0, 1000)}...`
                }
            ],
            { maxTokens: 10, temperature: 0.1 }
        );

        const detectedType = response.content.trim().toLowerCase();
        const validTypes = Object.keys(MEDICAL_REPORT_TYPES);
        const reportType = validTypes.includes(detectedType) ? detectedType : 'other';

        const cost = response.usage.totalTokens * 0.00000075;

        return { reportType, cost };

    } catch (error) {
        console.error('Report type detection failed:', error);
        return { reportType: 'other', cost: 0 };
    }
}

/**
 * Extract medical tags from document text
 */
async function extractMedicalTags(text: string): Promise<string[]> {
    // Simple keyword-based tagging
    // In production, this would use NLP models
    const medicalKeywords = [
        'blood pressure', 'diabetes', 'cholesterol', 'heart rate', 'temperature',
        'medication', 'prescription', 'dosage', 'treatment', 'diagnosis',
        'symptoms', 'pain', 'fever', 'infection', 'allergy', 'test results',
        'x-ray', 'mri', 'ct scan', 'ultrasound', 'biopsy', 'surgery'
    ];

    const lowerText = text.toLowerCase();
    const foundTags = medicalKeywords.filter(keyword => lowerText.includes(keyword));

    return foundTags.slice(0, 10); // Limit to 10 tags
}

/**
 * Get extraction method name for metadata
 */
function getExtractionMethod(fileType: string): string {
    const methods = {
        'txt': 'direct_text',
        'pdf': 'pdf_parsing',
        'docx': 'docx_parsing',
        'jpg': 'ocr_tesseract',
        'png': 'ocr_tesseract',
        'gif': 'ocr_tesseract'
    };

    return methods[fileType as keyof typeof methods] || 'unknown';
}

// Export GET method for health check
export async function GET() {
    return NextResponse.json({
        status: 'healthy',
        service: 'medical-document-upload-api',
        supportedTypes: Object.keys(ALLOWED_FILE_TYPES),
        maxFileSize: config.maxFileSize,
        version: '1.0.0',
        timestamp: new Date().toISOString()
    });
}
