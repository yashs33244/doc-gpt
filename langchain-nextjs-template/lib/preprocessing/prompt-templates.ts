/**
 * Prompt Templates for Doctor GPT
 * Implements structured prompts with stepwise reasoning and citation requirements
 * Following Agentic AI Patterns for medical AI systems
 */

export interface PromptContext {
    userQuery: string;
    retrievedChunks: RetrievedChunk[];
    patientContext?: PatientContext;
    medicalHistory?: string[];
    sessionContext?: SessionContext;
}

export interface RetrievedChunk {
    id: string;
    content: string;
    source: string;
    relevanceScore: number;
    metadata?: {
        documentId?: string;
        fileName?: string;
        section?: string;
        docType?: string;
        pubmedId?: string;
    };
}

export interface PatientContext {
    age?: number;
    gender?: 'male' | 'female' | 'other';
    medicalHistory?: string[];
    currentSymptoms?: string[];
    medications?: string[];
    allergies?: string[];
    urgencyLevel?: 'low' | 'medium' | 'high' | 'emergency';
}

export interface SessionContext {
    sessionId: string;
    userId: string;
    previousQueries?: string[];
    uploadedDocuments?: string[];
    chatHistory?: Array<{ role: string; content: string }>;
}

export interface StructuredPrompt {
    systemMessage: string;
    userMessage: string;
    expectedFormat: string;
    citationInstructions: string;
    reasoningInstructions: string;
}

export class PromptTemplateService {

    /**
     * Generate structured prompt for evidence retrieval
     */
    static generateEvidenceRetrievalPrompt(context: PromptContext): StructuredPrompt {
        const systemMessage = `You are a medical evidence synthesizer designed to analyze retrieved medical documents and provide evidence-based responses.

ROLE DEFINITION:
- Medical Evidence Synthesizer
- Analyze retrieved documents for relevant medical information
- Synthesize findings into coherent, evidence-based responses
- Provide proper citations for all medical claims

CRITICAL REQUIREMENTS:
1. Cite ALL medical claims with [DocID] or [PubMedID] format
2. Use stepwise reasoning: Evidence → Analysis → Conclusion
3. Distinguish between high-quality and low-quality evidence
4. Flag contradictory information from different sources
5. Include confidence levels for each claim

EVIDENCE QUALITY RANKING:
1. Systematic reviews and meta-analyses [HIGHEST]
2. Randomized controlled trials
3. Cohort studies  
4. Case-control studies
5. Case reports and expert opinion [LOWEST]

CITATION FORMAT:
- Use [Doc-{documentId}] for uploaded documents
- Use [PMID-{pubmedId}] for PubMed references
- Use [Source-{sourceName}] for other medical sources`;

        const retrievedContent = this.formatRetrievedChunks(context.retrievedChunks);
        const patientInfo = this.formatPatientContext(context.patientContext);

        const userMessage = `MEDICAL QUERY: ${context.userQuery}

${patientInfo}

RETRIEVED EVIDENCE:
${retrievedContent}

Please analyze the retrieved evidence and provide a structured response following the stepwise reasoning format.`;

        const expectedFormat = `EXPECTED RESPONSE FORMAT:
1. EVIDENCE ANALYSIS
   - List key findings from each source with citations
   - Assess quality and reliability of each source
   - Identify any contradictions or gaps

2. STEPWISE REASONING
   - Evidence: What the sources tell us
   - Analysis: How this applies to the query
   - Clinical Significance: What this means medically

3. SYNTHESIS AND CONCLUSION
   - Integrated response based on evidence
   - Confidence level (High/Medium/Low)
   - Limitations and caveats

4. RECOMMENDATIONS
   - Evidence-based suggestions
   - When to seek professional care
   - Follow-up considerations`;

        const citationInstructions = `CITATION REQUIREMENTS:
- Every medical claim MUST include a citation
- Use exact format: [Doc-{id}], [PMID-{id}], or [Source-{name}]
- Multiple sources: [Doc-123][PMID-456] 
- Quote key passages: "exact text" [Doc-123]
- Distinguish between primary sources and reviews`;

        const reasoningInstructions = `REASONING REQUIREMENTS:
1. Start with evidence summary
2. Analyze each piece of evidence
3. Synthesize findings step-by-step
4. Draw logical conclusions
5. Acknowledge limitations
6. Provide actionable insights`;

        return {
            systemMessage,
            userMessage,
            expectedFormat,
            citationInstructions,
            reasoningInstructions
        };
    }

    /**
     * Generate structured prompt for medical consultation
     */
    static generateMedicalConsultationPrompt(context: PromptContext): StructuredPrompt {
        const systemMessage = `You are an AI medical consultant designed to provide evidence-based medical guidance while maintaining appropriate boundaries.

ROLE DEFINITION:
- Medical Information Consultant
- Provide educational medical information
- Guide users to appropriate care
- Maintain safety and ethical boundaries

CORE PRINCIPLES:
1. Evidence-based information only
2. Cite all medical sources
3. Never diagnose or prescribe
4. Always recommend professional consultation
5. Prioritize patient safety

RESPONSE STRUCTURE:
1. Acknowledgment of query
2. Evidence-based information with citations
3. Risk assessment if applicable
4. Professional guidance recommendations
5. Safety warnings when needed

SAFETY PROTOCOLS:
- Flag emergency symptoms immediately
- Recommend urgent care for concerning symptoms
- Emphasize limitations of AI advice
- Include medical disclaimers`;

        const patientInfo = this.formatPatientContext(context.patientContext);
        const retrievedContent = this.formatRetrievedChunks(context.retrievedChunks);
        const urgencyAssessment = this.assessUrgency(context.userQuery, context.patientContext);

        const userMessage = `PATIENT QUERY: ${context.userQuery}

${patientInfo}

${urgencyAssessment}

AVAILABLE MEDICAL EVIDENCE:
${retrievedContent}

Please provide a structured medical consultation response with proper citations and safety considerations.`;

        const expectedFormat = `CONSULTATION RESPONSE FORMAT:
1. QUERY ACKNOWLEDGMENT
   - Restate patient's question
   - Note any concerning symptoms

2. MEDICAL INFORMATION
   - Evidence-based explanation with citations
   - Relevant medical background
   - Risk factors and considerations

3. PROFESSIONAL GUIDANCE
   - When to see a healthcare provider
   - What type of specialist if needed
   - Urgency of consultation

4. SELF-CARE GUIDANCE (if appropriate)
   - Evidence-based self-care measures
   - Warning signs to watch for
   - When to seek immediate care

5. MEDICAL DISCLAIMER
   - Limitations of AI advice
   - Importance of professional care`;

        const citationInstructions = `MEDICAL CITATION REQUIREMENTS:
- Cite every medical fact or recommendation
- Use format: [Doc-{id}] for uploaded documents
- Use format: [PMID-{pubmedId}] for research papers
- Include page/section references when available
- Distinguish between different evidence levels`;

        const reasoningInstructions = `MEDICAL REASONING STEPS:
1. Assess query for safety concerns
2. Gather relevant evidence from sources
3. Analyze evidence quality and relevance
4. Synthesize information appropriately
5. Provide balanced, cautious guidance
6. Include appropriate disclaimers`;

        return {
            systemMessage,
            userMessage,
            expectedFormat,
            citationInstructions,
            reasoningInstructions
        };
    }

    /**
     * Generate structured prompt for document analysis
     */
    static generateDocumentAnalysisPrompt(context: PromptContext): StructuredPrompt {
        const systemMessage = `You are a medical document analyzer specializing in interpreting uploaded medical reports and documents.

ROLE DEFINITION:
- Medical Document Interpreter
- Analyze structure and content of medical documents
- Extract key findings and recommendations
- Provide context and explanations

ANALYSIS FRAMEWORK:
1. Document type identification
2. Key findings extraction
3. Medical term explanation
4. Clinical significance assessment
5. Follow-up recommendations

INTERPRETATION PRINCIPLES:
- Explain complex medical terms
- Highlight abnormal findings
- Provide context for results
- Suggest follow-up actions
- Maintain appropriate boundaries`;

        const uploadedDocs = context.retrievedChunks.filter((chunk: any) =>
            chunk.source === 'uploaded' || chunk.metadata?.source === 'uploaded_document'
        );

        const userMessage = `DOCUMENT ANALYSIS REQUEST: ${context.userQuery}

UPLOADED DOCUMENTS TO ANALYZE:
${this.formatUploadedDocuments(uploadedDocs)}

Please analyze these documents and provide insights based on the user's question.`;

        const expectedFormat = `DOCUMENT ANALYSIS FORMAT:
1. DOCUMENT SUMMARY
   - Document type and purpose
   - Date and context
   - Key sections identified

2. FINDINGS EXTRACTION
   - Normal findings
   - Abnormal findings with explanations
   - Missing information

3. MEDICAL INTERPRETATION
   - Significance of results
   - Comparison to normal ranges
   - Potential implications

4. RECOMMENDATIONS
   - Follow-up care suggestions
   - Questions for healthcare provider
   - Monitoring recommendations`;

        const citationInstructions = `DOCUMENT CITATION FORMAT:
- Reference specific document sections: [Doc-{id}-Section-{name}]
- Quote exact values: "Blood pressure: 140/90 mmHg" [Doc-123]
- Reference page numbers when available: [Doc-123-Page-2]
- Distinguish between different documents clearly`;

        const reasoningInstructions = `DOCUMENT ANALYSIS REASONING:
1. Identify document type and structure
2. Extract factual information systematically
3. Interpret findings in medical context
4. Assess clinical significance
5. Provide educational explanations
6. Suggest appropriate next steps`;

        return {
            systemMessage,
            userMessage,
            expectedFormat,
            citationInstructions,
            reasoningInstructions
        };
    }

    /**
     * Generate structured prompt for final answer synthesis
     */
    static generateFinalAnswerPrompt(
        originalQuery: string,
        evidenceResponses: string[],
        citedSources: RetrievedChunk[]
    ): StructuredPrompt {
        const systemMessage = `You are a medical response synthesizer responsible for creating the final, polished response to a medical query.

ROLE DEFINITION:
- Synthesize multiple evidence sources
- Create coherent final response
- Ensure all claims are properly cited
- Maintain medical accuracy and safety

SYNTHESIS PRINCIPLES:
1. Integrate findings from all sources
2. Resolve conflicts between sources
3. Prioritize high-quality evidence
4. Maintain citation integrity
5. Include appropriate disclaimers

FINAL RESPONSE STANDARDS:
- Clear, accessible language
- Proper medical terminology with explanations
- Complete citation coverage
- Safety-first approach
- Professional tone`;

        const sourcesSummary = this.formatSourcesSummary(citedSources);
        const evidenceSummary = this.formatEvidenceResponses(evidenceResponses);

        const userMessage = `ORIGINAL QUERY: ${originalQuery}

EVIDENCE ANALYSIS RESULTS:
${evidenceSummary}

AVAILABLE SOURCES:
${sourcesSummary}

Please synthesize this information into a final, comprehensive response that addresses the original query.`;

        const expectedFormat = `FINAL RESPONSE FORMAT:
1. DIRECT ANSWER
   - Clear response to the original question
   - Key points with citations

2. SUPPORTING INFORMATION
   - Additional context and background
   - Relevant details with sources

3. PROFESSIONAL RECOMMENDATIONS
   - Healthcare guidance
   - Next steps and follow-up

4. MEDICAL DISCLAIMER
   - Standard medical disclaimer
   - Limitations of information provided`;

        const citationInstructions = `FINAL CITATION REQUIREMENTS:
- Every medical claim must have citation
- Consolidate duplicate citations
- Use consistent citation format throughout
- Include citation list at end if needed
- Verify all citations are accurate`;

        const reasoningInstructions = `SYNTHESIS REASONING:
1. Review all evidence sources
2. Identify key themes and findings
3. Resolve any contradictions
4. Prioritize most reliable information
5. Create coherent narrative
6. Include safety considerations`;

        return {
            systemMessage,
            userMessage,
            expectedFormat,
            citationInstructions,
            reasoningInstructions
        };
    }

    // Helper methods for formatting

    private static formatRetrievedChunks(chunks: RetrievedChunk[]): string {
        if (!chunks || chunks.length === 0) {
            return "No relevant documents found in the knowledge base.";
        }

        return chunks.map((chunk, index) => {
            const sourceInfo = chunk.metadata?.fileName || chunk.source;
            const docType = chunk.metadata?.docType || 'Unknown';
            const section = chunk.metadata?.section || 'General';

            return `[Document ${index + 1}] - ${sourceInfo} (${docType})
Section: ${section}
Relevance: ${(chunk.relevanceScore * 100).toFixed(1)}%
Content: ${chunk.content.substring(0, 500)}${chunk.content.length > 500 ? '...' : ''}
Citation ID: ${chunk.id}
---`;
        }).join('\n\n');
    }

    private static formatPatientContext(context?: PatientContext): string {
        if (!context) {
            return "PATIENT CONTEXT: No specific patient information provided.";
        }

        let formatted = "PATIENT CONTEXT:\n";
        if (context.age) formatted += `- Age: ${context.age}\n`;
        if (context.gender) formatted += `- Gender: ${context.gender}\n`;
        if (context.medicalHistory?.length) formatted += `- Medical History: ${context.medicalHistory.join(', ')}\n`;
        if (context.currentSymptoms?.length) formatted += `- Current Symptoms: ${context.currentSymptoms.join(', ')}\n`;
        if (context.medications?.length) formatted += `- Medications: ${context.medications.join(', ')}\n`;
        if (context.allergies?.length) formatted += `- Allergies: ${context.allergies.join(', ')}\n`;
        if (context.urgencyLevel) formatted += `- Urgency Level: ${context.urgencyLevel}\n`;

        return formatted;
    }

    private static formatUploadedDocuments(docs: RetrievedChunk[]): string {
        if (!docs || docs.length === 0) {
            return "No uploaded documents available for analysis.";
        }

        return docs.map((doc, index) => {
            const fileName = doc.metadata?.fileName || `Document ${index + 1}`;
            const docType = doc.metadata?.docType || 'Unknown Type';

            return `[${fileName}] - ${docType}
Content Preview: ${doc.content.substring(0, 300)}${doc.content.length > 300 ? '...' : ''}
Document ID: ${doc.id}
---`;
        }).join('\n\n');
    }

    private static assessUrgency(query: string, context?: PatientContext): string {
        const urgentTerms = [
            'emergency', 'urgent', 'severe pain', 'chest pain', 'difficulty breathing',
            'severe bleeding', 'unconscious', 'severe allergic reaction', 'stroke',
            'heart attack', 'severe injury', 'poisoning'
        ];

        const queryLower = query.toLowerCase();
        const hasUrgentTerms = urgentTerms.some(term => queryLower.includes(term));
        const urgencyLevel = context?.urgencyLevel;

        if (hasUrgentTerms || urgencyLevel === 'emergency') {
            return `⚠️ URGENCY ASSESSMENT: This query contains terms suggesting a potential emergency. 
If this is a medical emergency, please call emergency services immediately (911 in US, 999 in UK, 112 in EU).`;
        } else if (urgencyLevel === 'high') {
            return `⚠️ URGENCY ASSESSMENT: This appears to be a high-priority medical concern. 
Consider seeking medical attention promptly.`;
        } else {
            return `URGENCY ASSESSMENT: This appears to be a general medical inquiry. 
Standard medical consultation recommended.`;
        }
    }

    private static formatSourcesSummary(sources: RetrievedChunk[]): string {
        return sources.map((source, index) => {
            const sourceType = source.metadata?.pubmedId ? 'Research Paper' :
                source.metadata?.fileName ? 'Uploaded Document' : 'Medical Knowledge';

            return `${index + 1}. ${sourceType} [${source.id}]
   - Source: ${source.metadata?.fileName || source.source}
   - Type: ${source.metadata?.docType || 'General'}
   - Relevance: ${(source.relevanceScore * 100).toFixed(1)}%`;
        }).join('\n');
    }

    private static formatEvidenceResponses(responses: string[]): string {
        return responses.map((response, index) => {
            return `Evidence Analysis ${index + 1}:
${response}
---`;
        }).join('\n\n');
    }
}

export default PromptTemplateService;
