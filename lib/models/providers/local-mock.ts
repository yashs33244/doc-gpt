/**
 * Local Mock Provider for Doctor GPT Development
 * Provides mock responses when external APIs are not available
 */

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

export class LocalMockProvider implements AIModelProvider {
  name = 'local-mock';
  models = ['mock-gpt-4', 'mock-claude-3'];

  constructor() {
    console.log('🔧 Using Local Mock Provider for development');
  }

  async complete(
    messages: Message[], 
    modelConfig?: ModelConfig,
    medicalContext?: MedicalContext
  ): Promise<ModelResponse> {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 500));

    const userMessage = messages.find(m => m.role === 'user')?.content || '';
    const isMedical = this.detectMedicalQuery(userMessage);
    
    let mockResponse = '';
    
    if (isMedical) {
      mockResponse = this.generateMedicalResponse(userMessage, medicalContext);
    } else {
      mockResponse = this.generateGeneralResponse(userMessage);
    }

    return {
      content: mockResponse,
      finishReason: 'stop',
      model: 'mock-gpt-4',
      usage: {
        promptTokens: Math.floor(userMessage.length / 4),
        completionTokens: Math.floor(mockResponse.length / 4),
        totalTokens: Math.floor((userMessage.length + mockResponse.length) / 4),
      },
      metadata: {
        provider: this.name,
        mock: true,
        timestamp: new Date().toISOString()
      }
    };
  }

  async *streamComplete(
    messages: Message[], 
    modelConfig?: ModelConfig,
    medicalContext?: MedicalContext
  ): AsyncGenerator<StreamingModelResponse> {
    const response = await this.complete(messages, modelConfig, medicalContext);
    const words = response.content.split(' ');
    
    for (let i = 0; i < words.length; i++) {
      await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 100));
      
      yield {
        content: words[i] + (i < words.length - 1 ? ' ' : ''),
        done: false,
      };
    }

    yield {
      content: '',
      done: true,
      usage: response.usage
    };
  }

  async medicalComplete(
    messages: Message[], 
    modelConfig?: ModelConfig,
    medicalContext?: MedicalContext
  ): Promise<MedicalResponse> {
    const baseResponse = await this.complete(messages, modelConfig, medicalContext);
    
    const mockCitations: Citation[] = [
      {
        id: 'mock-citation-1',
        title: 'Mock Medical Reference',
        url: 'https://pubmed.ncbi.nlm.nih.gov/mock-123456',
        source: 'PubMed',
        snippet: 'This is a mock citation for development purposes.',
        relevanceScore: 0.85
      },
      {
        id: 'mock-citation-2',
        title: 'Mock Clinical Guidelines',
        url: 'https://www.mayoclinic.org/mock-guidelines',
        source: 'Mayo Clinic',
        snippet: 'Mock clinical guidelines reference.',
        relevanceScore: 0.75
      }
    ];

    return {
      ...baseResponse,
      citations: mockCitations,
      confidence: 0.8,
      medicalDisclaimer: "⚠️ DEVELOPMENT MODE: This is a mock response for testing purposes. This information is for educational purposes only and is not a substitute for professional medical advice, diagnosis, or treatment. Always seek the advice of your physician or other qualified health provider.",
      riskAssessment: medicalContext?.urgencyLevel ? {
        level: medicalContext.urgencyLevel as 'low' | 'medium' | 'high',
        factors: medicalContext.currentSymptoms || ['mock symptom assessment']
      } : undefined,
      recommendedActions: [
        "🧪 This is a development environment",
        "Consult with a healthcare professional for real medical advice",
        "Configure real API keys in .env.local for production use"
      ]
    };
  }

  calculateCost(usage: ModelResponse['usage']): CostInfo {
    // Mock costs - much lower than real APIs
    const inputCost = usage.promptTokens * 0.000001;
    const outputCost = usage.completionTokens * 0.000001;
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
    return true; // Always available for local development
  }

  getCapabilities(model: string): ModelCapabilities {
    return {
      maxTokens: 4000,
      supportsStreaming: true,
      supportsFunctionCalling: false,
      supportsVision: false,
      contextWindow: 8000,
      isMultimodal: false,
      specializations: ['mock', 'development', 'testing']
    };
  }

  private detectMedicalQuery(query: string): boolean {
    const medicalKeywords = [
      'symptom', 'symptoms', 'pain', 'ache', 'fever', 'headache',
      'medication', 'medicine', 'drug', 'prescription',
      'doctor', 'hospital', 'medical', 'health',
      'diagnosis', 'treatment', 'disease', 'condition',
      'blood', 'pressure', 'heart', 'diabetes', 'cancer'
    ];

    const lowerQuery = query.toLowerCase();
    return medicalKeywords.some(keyword => lowerQuery.includes(keyword));
  }

  private generateMedicalResponse(query: string, context?: MedicalContext): string {
    const responses = [
      `Thank you for your medical question about "${query}". In a production environment, this would be processed by advanced AI models with access to current medical literature.`,
      
      `I understand you're asking about medical concerns. This mock response would normally provide evidence-based information from trusted medical sources like PubMed, NIH, and clinical guidelines.`,
      
      `Your query "${query}" would typically trigger our multi-model medical reasoning pipeline, combining insights from multiple AI providers for accurate, citation-backed responses.`,
      
      `This is a development environment response. In production, your medical query would be processed with access to current medical research, clinical guidelines, and evidence-based treatment recommendations.`
    ];

    let baseResponse = responses[Math.floor(Math.random() * responses.length)];

    if (context?.urgencyLevel === 'high' || context?.urgencyLevel === 'emergency') {
      baseResponse = `🚨 HIGH URGENCY DETECTED: ${baseResponse}\n\nIMPORTANT: If this is a real emergency, please call emergency services immediately.`;
    }

    if (context?.currentSymptoms?.length) {
      baseResponse += `\n\nSymptoms noted: ${context.currentSymptoms.join(', ')}`;
    }

    baseResponse += `\n\n**Next Steps:**\n1. Configure real API keys for production use\n2. Consult healthcare professionals for actual medical advice\n3. This system is designed to supplement, not replace, professional medical consultation`;

    return baseResponse;
  }

  private generateGeneralResponse(query: string): string {
    const responses = [
      `Thank you for your question: "${query}". This is a mock response from the local development environment.`,
      
      `I see you're asking about "${query}". In production, this would be handled by real AI models with access to current information.`,
      
      `Your query "${query}" has been received. This mock provider is active because no external API keys are configured.`,
      
      `This is a development response to your question about "${query}". Configure OpenAI and Anthropic API keys to use real AI models.`
    ];

    let baseResponse = responses[Math.floor(Math.random() * responses.length)];
    
    baseResponse += `\n\n**Development Mode Active:**\n- No external API calls are being made\n- Add your API keys to .env.local to use real AI models\n- This mock provider helps you test the application structure`;

    return baseResponse;
  }
}
