/**
 * Centralized configuration management for Doctor GPT
 * Following Single Responsibility Principle - handles all environment variables in one place
 */

import { z } from 'zod';

// Environment validation schema
const envSchema = z.object({
  // Database Configuration
  DATABASE_URL: z.string().default('postgresql://doctor_gpt:doctor_gpt_password@localhost:5432/doctor_gpt'),
  DIRECT_URL: z.string().optional(),

  // AI Model API Keys (optional for local development)
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),

  // Search & External APIs (optional for local development)
  TAVILY_API_KEY: z.string().optional(),

  // Application Configuration
  NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  APP_URL: z.string().url().default('http://localhost:3000'),

  // Vector Database Configuration
  VECTOR_DIMENSIONS: z.string().transform(Number).default('1536'),

  // Cost Tracking
  ENABLE_COST_TRACKING: z.string().transform((val) => val === 'true').default('true'),

  // Rate Limiting
  RATE_LIMIT_MAX: z.string().transform(Number).default('100'),
  RATE_LIMIT_WINDOW: z.string().transform(Number).default('900000'), // 15 minutes

  // File Upload Configuration
  MAX_FILE_SIZE: z.string().transform(Number).default('10485760'), // 10MB
  ALLOWED_FILE_TYPES: z.string().default('pdf,txt,docx,png,jpg,jpeg'),

  // LangGraph Configuration
  LANGGRAPH_API_URL: z.string().url().optional(),

  // Python Backend API Configuration
  PYTHON_API_URL: z.string().url().default('http://127.0.0.1:8000'),
  NEXT_PUBLIC_PYTHON_API_URL: z.string().url().default('http://127.0.0.1:8000'),
});

class Config {
  private static instance: Config;
  private _config: z.infer<typeof envSchema>;

  private constructor() {
    try {
      this._config = envSchema.parse(process.env);
    } catch (error) {
      // During build time, environment variables might not be available
      // Use default values for non-critical settings
      console.warn('⚠️ Configuration validation failed, using defaults for build time');
      this._config = {
        DATABASE_URL: process.env.DATABASE_URL || 'postgresql://placeholder',
        OPENAI_API_KEY: process.env.OPENAI_API_KEY || 'placeholder',
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || 'placeholder',
        TAVILY_API_KEY: process.env.TAVILY_API_KEY || 'placeholder',
        NODE_ENV: (process.env.NODE_ENV as any) || 'development',
        APP_URL: process.env.APP_URL || 'http://localhost:3000',
        VECTOR_DIMENSIONS: parseInt(process.env.VECTOR_DIMENSIONS || '1536'),
        ENABLE_COST_TRACKING: process.env.ENABLE_COST_TRACKING === 'true',
        RATE_LIMIT_MAX: parseInt(process.env.RATE_LIMIT_MAX || '100'),
        RATE_LIMIT_WINDOW: parseInt(process.env.RATE_LIMIT_WINDOW || '900000'),
        MAX_FILE_SIZE: parseInt(process.env.MAX_FILE_SIZE || '10485760'),
        ALLOWED_FILE_TYPES: process.env.ALLOWED_FILE_TYPES || 'pdf,txt,docx,png,jpg,jpeg',
        LANGGRAPH_API_URL: process.env.LANGGRAPH_API_URL,
        PYTHON_API_URL: process.env.PYTHON_API_URL || 'http://127.0.0.1:8000',
        NEXT_PUBLIC_PYTHON_API_URL: process.env.NEXT_PUBLIC_PYTHON_API_URL || 'http://127.0.0.1:8000',
        DIRECT_URL: process.env.DIRECT_URL
      };
    }
  }

  public static getInstance(): Config {
    if (!Config.instance) {
      Config.instance = new Config();
    }
    return Config.instance;
  }

  // Database Configuration
  get databaseUrl(): string {
    return this._config.DATABASE_URL;
  }

  get directUrl(): string | undefined {
    return this._config.DIRECT_URL;
  }

  // AI Model Configuration
  get openaiApiKey(): string | undefined {
    return this._config.OPENAI_API_KEY;
  }

  get anthropicApiKey(): string | undefined {
    return this._config.ANTHROPIC_API_KEY;
  }

  // Search Configuration
  get tavilyApiKey(): string | undefined {
    return this._config.TAVILY_API_KEY;
  }

  // Check if external APIs are available
  get hasOpenAI(): boolean {
    return !!this._config.OPENAI_API_KEY;
  }

  get hasAnthropic(): boolean {
    return !!this._config.ANTHROPIC_API_KEY;
  }

  get hasTavily(): boolean {
    return !!this._config.TAVILY_API_KEY;
  }

  // Application Configuration
  get nodeEnv(): 'development' | 'staging' | 'production' {
    return this._config.NODE_ENV;
  }

  get appUrl(): string {
    return this._config.APP_URL;
  }

  get isDevelopment(): boolean {
    return this._config.NODE_ENV === 'development';
  }

  get isProduction(): boolean {
    return this._config.NODE_ENV === 'production';
  }

  // Vector Database Configuration
  get vectorDimensions(): number {
    return this._config.VECTOR_DIMENSIONS;
  }

  // Cost Tracking Configuration
  get enableCostTracking(): boolean {
    return this._config.ENABLE_COST_TRACKING;
  }

  // Rate Limiting Configuration
  get rateLimitMax(): number {
    return this._config.RATE_LIMIT_MAX;
  }

  get rateLimitWindow(): number {
    return this._config.RATE_LIMIT_WINDOW;
  }

  // File Upload Configuration
  get maxFileSize(): number {
    return this._config.MAX_FILE_SIZE;
  }

  get allowedFileTypes(): string[] {
    return this._config.ALLOWED_FILE_TYPES.split(',').map(type => type.trim());
  }

  // LangGraph Configuration
  get langgraphApiUrl(): string | undefined {
    return this._config.LANGGRAPH_API_URL;
  }

  // Python Backend API Configuration
  get pythonApiUrl(): string {
    return this._config.PYTHON_API_URL;
  }

  get publicPythonApiUrl(): string {
    return this._config.NEXT_PUBLIC_PYTHON_API_URL;
  }

  // Utility methods
  public validateConfig(): void {
    try {
      envSchema.parse(process.env);
      console.log('✅ Configuration validation successful');
    } catch (error) {
      console.error('❌ Configuration validation failed:', error);
      process.exit(1);
    }
  }

  public getConfig() {
    return { ...this._config };
  }
}

// Export singleton instance
export const config = Config.getInstance();

// Export types for TypeScript
export type ConfigType = z.infer<typeof envSchema>;

// Default export for convenience
export default config;
