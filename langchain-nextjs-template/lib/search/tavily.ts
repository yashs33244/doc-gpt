/**
 * Tavily Search Integration for Doctor GPT
 * Provides medical-focused web search with citation support
 */

import { TavilySearchResults } from '@langchain/community/tools/tavily_search';
import { config } from '../../config';
import { costTracker } from '../cost-tracking/tracker';
import { Citation } from '../models/types';

export interface TavilySearchOptions {
    maxResults?: number;
    includeDomains?: string[];
    excludeDomains?: string[];
    searchDepth?: 'basic' | 'advanced';
    includeImages?: boolean;
    includeAnswer?: boolean;
    includeRawContent?: boolean;
}

export interface TavilyResult {
    title: string;
    url: string;
    content: string;
    score: number;
    publishedDate?: string;
    author?: string;
    rawContent?: string;
}

export interface TavilyResponse {
    query: string;
    followUpQuestions?: string[];
    answer?: string;
    results: TavilyResult[];
    images?: Array<{
        url: string;
        description: string;
    }>;
    searchId: string;
    responseTime: number;
}

export interface MedicalSearchContext {
    specialization?: 'cardiology' | 'neurology' | 'oncology' | 'pediatrics' | 'general';
    evidenceLevel?: 'systematic_review' | 'rct' | 'cohort' | 'case_control' | 'case_series' | 'expert_opinion';
    dateRange?: 'last_year' | 'last_5_years' | 'last_10_years' | 'all_time';
    sourcePreference?: 'pubmed' | 'clinical_trials' | 'guidelines' | 'all';
}

export class TavilySearchService {
    private static instance: TavilySearchService;
    private tavilyTool: TavilySearchResults;
    private readonly apiKey: string;

    // Trusted medical domains for healthcare queries
    private readonly MEDICAL_DOMAINS = [
        'pubmed.ncbi.nlm.nih.gov',
        'www.ncbi.nlm.nih.gov',
        'clinicaltrials.gov',
        'www.who.int',
        'www.cdc.gov',
        'www.mayoclinic.org',
        'www.clevelandclinic.org',
        'www.hopkinsmedicine.org',
        'www.nih.gov',
        'www.medlineplus.gov',
        'www.uptodate.com',
        'www.nejm.org',
        'www.thelancet.com',
        'jamanetwork.com',
        'www.bmj.com',
        'www.nature.com',
        'www.sciencedirect.com',
        'scholar.google.com',
        'www.cochranelibrary.com',
        'guidelines.gov',
        'www.aafp.org',
        'www.acponline.org',
        'www.ama-assn.org'
    ];

    private readonly EXCLUDE_DOMAINS = [
        'webmd.com',
        'healthline.com',
        'medicalnewstoday.com',
        'everydayhealth.com',
        'wikipedia.org', // While useful, prefer primary sources for medical info
        'reddit.com',
        'quora.com',
        'yahoo.com',
        'ask.com'
    ];

  private constructor() {
    if (config.hasTavily) {
      this.apiKey = config.tavilyApiKey!;
      this.tavilyTool = new TavilySearchResults({
        apiKey: this.apiKey,
        maxResults: 10,
      });
      console.log('✅ Tavily search initialized');
    } else {
      this.apiKey = 'mock-api-key';
      this.tavilyTool = null as any; // Will use mock implementation
      console.log('🔧 Tavily API key not configured, using mock search');
    }
  }

    public static getInstance(): TavilySearchService {
        if (!TavilySearchService.instance) {
            TavilySearchService.instance = new TavilySearchService();
        }
        return TavilySearchService.instance;
    }

    /**
     * Perform a medical-focused search
     */
    public async searchMedical(
        query: string,
        userId: string,
        medicalContext?: MedicalSearchContext,
        options?: TavilySearchOptions,
        sessionId?: string,
        chatId?: string
    ): Promise<TavilyResponse> {
        const startTime = Date.now();

        try {
            // Enhance query for medical search
            const enhancedQuery = this.enhanceQueryForMedical(query, medicalContext);

            // Configure search options for medical content
            const searchOptions = this.configureMedicalSearch(options, medicalContext);

            // Perform the search
            const results = await this.performSearch(enhancedQuery, searchOptions);

            // Filter and rank results for medical relevance
            const filteredResults = this.filterMedicalResults(results);

            // Convert to citation format
            const citations = this.convertToCitations(filteredResults);

            const responseTime = Date.now() - startTime;

            // Track cost
            await costTracker.trackWebSearch(
                userId,
                'tavily',
                1,
                0.001, // $0.001 per search
                sessionId,
                chatId,
                {
                    query: enhancedQuery,
                    resultsCount: filteredResults.length,
                    medicalContext,
                    responseTime
                }
            );

            return {
                query: enhancedQuery,
                results: filteredResults,
                searchId: crypto.randomUUID(),
                responseTime,
                followUpQuestions: this.generateFollowUpQuestions(query, medicalContext),
            };

        } catch (error) {
            console.error('Tavily search failed:', error);
            throw new Error(`Medical search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Search for specific medical evidence
     */
    public async searchEvidence(
        condition: string,
        treatment: string,
        userId: string,
        evidenceLevel: MedicalSearchContext['evidenceLevel'] = 'systematic_review',
        sessionId?: string,
        chatId?: string
    ): Promise<TavilyResponse> {
        const query = `${condition} ${treatment} evidence ${evidenceLevel} systematic review meta-analysis`;

        return this.searchMedical(
            query,
            userId,
            {
                evidenceLevel,
                sourcePreference: 'pubmed',
                dateRange: 'last_5_years'
            },
            {
                maxResults: 15,
                searchDepth: 'advanced',
                includeDomains: [
                    'pubmed.ncbi.nlm.nih.gov',
                    'www.cochranelibrary.com',
                    'clinicaltrials.gov'
                ]
            },
            sessionId,
            chatId
        );
    }

    /**
     * Search for clinical guidelines
     */
    public async searchGuidelines(
        condition: string,
        userId: string,
        organization?: 'aha' | 'acc' | 'asco' | 'acp' | 'aafp',
        sessionId?: string,
        chatId?: string
    ): Promise<TavilyResponse> {
        let query = `${condition} clinical guidelines practice guidelines`;

        if (organization) {
            const orgMap = {
                'aha': 'American Heart Association',
                'acc': 'American College of Cardiology',
                'asco': 'American Society of Clinical Oncology',
                'acp': 'American College of Physicians',
                'aafp': 'American Academy of Family Physicians'
            };
            query += ` ${orgMap[organization]}`;
        }

        return this.searchMedical(
            query,
            userId,
            {
                sourcePreference: 'guidelines',
                dateRange: 'last_5_years'
            },
            {
                maxResults: 10,
                searchDepth: 'advanced',
                includeDomains: [
                    'guidelines.gov',
                    'www.aha.org',
                    'www.acc.org',
                    'www.asco.org',
                    'www.acponline.org',
                    'www.aafp.org'
                ]
            },
            sessionId,
            chatId
        );
    }

    /**
     * Search for drug information
     */
    public async searchDrugInfo(
        drugName: string,
        userId: string,
        context: 'safety' | 'efficacy' | 'interactions' | 'dosing' = 'safety',
        sessionId?: string,
        chatId?: string
    ): Promise<TavilyResponse> {
        const query = `${drugName} ${context} FDA prescribing information contraindications`;

        return this.searchMedical(
            query,
            userId,
            {
                sourcePreference: 'clinical_trials',
                dateRange: 'last_5_years'
            },
            {
                maxResults: 12,
                searchDepth: 'advanced',
                includeDomains: [
                    'www.fda.gov',
                    'dailymed.nlm.nih.gov',
                    'pubmed.ncbi.nlm.nih.gov',
                    'clinicaltrials.gov'
                ]
            },
            sessionId,
            chatId
        );
    }

    /**
     * Convert Tavily results to Citation format
     */
    public convertToCitations(results: TavilyResult[]): Citation[] {
        return results.map((result, index) => ({
            id: `tavily-${index}`,
            title: result.title,
            url: result.url,
            source: this.extractSourceName(result.url),
            snippet: result.content.substring(0, 200) + '...',
            relevanceScore: result.score,
            publicationDate: result.publishedDate,
            authors: result.author ? [result.author] : undefined
        }));
    }

    /**
     * Check if a domain is trusted for medical information
     */
    public isTrustedMedicalDomain(url: string): boolean {
        try {
            const domain = new URL(url).hostname;
            return this.MEDICAL_DOMAINS.some(trustedDomain =>
                domain === trustedDomain || domain.endsWith('.' + trustedDomain)
            );
        } catch {
            return false;
        }
    }

    /**
     * Get reliability score for a medical source
     */
    public getSourceReliabilityScore(url: string): number {
        const domain = new URL(url).hostname;

        // Tier 1: Primary research and systematic reviews (0.9-1.0)
        if (domain.includes('pubmed') || domain.includes('nejm') || domain.includes('thelancet') || domain.includes('bmj')) {
            return 0.95;
        }

        // Tier 2: Government health agencies (0.8-0.9)
        if (domain.includes('nih.gov') || domain.includes('cdc.gov') || domain.includes('fda.gov')) {
            return 0.9;
        }

        // Tier 3: Professional medical organizations (0.7-0.8)
        if (domain.includes('mayoclinic') || domain.includes('clevelandclinic') || domain.includes('hopkinsmedicine')) {
            return 0.8;
        }

        // Tier 4: Clinical guidelines (0.8-0.9)
        if (domain.includes('guidelines.gov') || domain.includes('cochranelibrary')) {
            return 0.85;
        }

        // Tier 5: Medical education sites (0.6-0.7)
        if (domain.includes('uptodate') || domain.includes('medlineplus')) {
            return 0.7;
        }

        // Default for other sources
        return 0.5;
    }

    private enhanceQueryForMedical(query: string, context?: MedicalSearchContext): string {
        let enhancedQuery = query;

        // Add medical context terms
        if (context?.specialization) {
            enhancedQuery += ` ${context.specialization}`;
        }

        if (context?.evidenceLevel) {
            const evidenceTerms = {
                'systematic_review': 'systematic review meta-analysis',
                'rct': 'randomized controlled trial RCT',
                'cohort': 'cohort study',
                'case_control': 'case-control study',
                'case_series': 'case series case report',
                'expert_opinion': 'expert opinion consensus statement'
            };
            enhancedQuery += ` ${evidenceTerms[context.evidenceLevel]}`;
        }

        // Add source preference terms
        if (context?.sourcePreference === 'pubmed') {
            enhancedQuery += ' site:pubmed.ncbi.nlm.nih.gov';
        } else if (context?.sourcePreference === 'clinical_trials') {
            enhancedQuery += ' site:clinicaltrials.gov';
        } else if (context?.sourcePreference === 'guidelines') {
            enhancedQuery += ' clinical guidelines practice guidelines';
        }

        return enhancedQuery;
    }

    private configureMedicalSearch(options?: TavilySearchOptions, context?: MedicalSearchContext): TavilySearchOptions {
        const defaultOptions: TavilySearchOptions = {
            maxResults: 10,
            searchDepth: 'advanced',
            includeAnswer: true,
            includeDomains: this.MEDICAL_DOMAINS,
            excludeDomains: this.EXCLUDE_DOMAINS
        };

        // Override with context-specific domains
        if (context?.sourcePreference === 'pubmed') {
            defaultOptions.includeDomains = ['pubmed.ncbi.nlm.nih.gov', 'www.ncbi.nlm.nih.gov'];
        } else if (context?.sourcePreference === 'clinical_trials') {
            defaultOptions.includeDomains = ['clinicaltrials.gov', 'pubmed.ncbi.nlm.nih.gov'];
        } else if (context?.sourcePreference === 'guidelines') {
            defaultOptions.includeDomains = ['guidelines.gov', ...this.MEDICAL_DOMAINS.filter(d => d.includes('guidelines'))];
        }

        return { ...defaultOptions, ...options };
    }

  private async performSearch(query: string, options: TavilySearchOptions): Promise<TavilyResult[]> {
    if (!config.hasTavily) {
      // Return mock search results for development
      return this.getMockSearchResults(query);
    }

    try {
      // Use the LangChain Tavily tool
      const results = await this.tavilyTool.invoke(query);
      
      // Parse results - the tool returns a string that needs to be parsed
      try {
        const parsedResults = JSON.parse(results);
        if (Array.isArray(parsedResults)) {
          return parsedResults.map((result, index) => ({
            title: result.title || '',
            url: result.url || '',
            content: result.content || result.snippet || '',
            score: result.score || (1 - index * 0.1), // Approximate score based on position
            publishedDate: result.published_date,
            author: result.author
          }));
        }
      } catch {
        // If parsing fails, return mock results
        console.warn('Failed to parse Tavily results, using mock data');
        return this.getMockSearchResults(query);
      }
    } catch (error) {
      console.warn('Tavily search failed, using mock results:', error);
      return this.getMockSearchResults(query);
    }
    
    return [];
  }

  private getMockSearchResults(query: string): TavilyResult[] {
    const mockResults: TavilyResult[] = [
      {
        title: `Medical Information about "${query}" - Mock Result`,
        url: 'https://pubmed.ncbi.nlm.nih.gov/mock-12345',
        content: `This is a mock search result for "${query}". In production, this would contain real medical information from trusted sources like PubMed, NIH, and medical journals. Configure TAVILY_API_KEY to get real search results.`,
        score: 0.9,
        publishedDate: new Date().toISOString(),
        author: 'Mock Medical Research Team'
      },
      {
        title: `Clinical Guidelines for ${query} - Development Mode`,
        url: 'https://www.mayoclinic.org/mock-guidelines',
        content: `Mock clinical guidelines related to "${query}". This demonstrates the citation and search functionality. Real search results would provide current, evidence-based medical information.`,
        score: 0.8,
        publishedDate: new Date().toISOString(),
        author: 'Mock Clinical Guidelines Committee'
      },
      {
        title: `Recent Research on ${query} - Test Result`,
        url: 'https://www.nejm.org/mock-research',
        content: `Latest research findings on "${query}" (mock data). Production environment would access current medical literature and peer-reviewed research papers.`,
        score: 0.7,
        publishedDate: new Date().toISOString(),
        author: 'Mock Research Authors'
      }
    ];

    return mockResults;
  }

    private filterMedicalResults(results: TavilyResult[]): TavilyResult[] {
        return results
            .filter(result => result.url && result.title && result.content)
            .filter(result => this.isTrustedMedicalDomain(result.url))
            .map(result => ({
                ...result,
                score: result.score * this.getSourceReliabilityScore(result.url)
            }))
            .sort((a, b) => b.score - a.score)
            .slice(0, 10); // Limit to top 10 results
    }

    private extractSourceName(url: string): string {
        try {
            const domain = new URL(url).hostname;

            // Map common domains to readable names
            const sourceMap: Record<string, string> = {
                'pubmed.ncbi.nlm.nih.gov': 'PubMed',
                'www.ncbi.nlm.nih.gov': 'NCBI',
                'clinicaltrials.gov': 'ClinicalTrials.gov',
                'www.mayoclinic.org': 'Mayo Clinic',
                'www.clevelandclinic.org': 'Cleveland Clinic',
                'www.hopkinsmedicine.org': 'Johns Hopkins Medicine',
                'www.nejm.org': 'New England Journal of Medicine',
                'www.thelancet.com': 'The Lancet',
                'jamanetwork.com': 'JAMA Network',
                'www.bmj.com': 'BMJ',
                'www.cochranelibrary.com': 'Cochrane Library',
                'www.cdc.gov': 'CDC',
                'www.nih.gov': 'NIH',
                'www.fda.gov': 'FDA'
            };

            return sourceMap[domain] || domain.replace('www.', '');
        } catch {
            return 'Unknown Source';
        }
    }

    private generateFollowUpQuestions(query: string, context?: MedicalSearchContext): string[] {
        const baseQuestions = [
            `What are the latest clinical guidelines for ${query}?`,
            `What are the evidence-based treatments for ${query}?`,
            `Are there any recent clinical trials related to ${query}?`,
            `What are the potential side effects or risks of ${query}?`
        ];

        if (context?.specialization) {
            baseQuestions.push(`How does ${query} specifically relate to ${context.specialization}?`);
        }

        return baseQuestions.slice(0, 3); // Return top 3 questions
    }
}

// Export singleton instance
export const tavilySearch = TavilySearchService.getInstance();

export default TavilySearchService;
