# Doctor GPT Setup Guide

Welcome to Doctor GPT - a comprehensive medical AI assistant built with multimodal capabilities, multi-model reasoning, and healthcare-focused features.

## 🏗️ Architecture Overview

Doctor GPT is built with a scalable, production-ready architecture following SOLID principles:

- **Frontend**: Next.js 15 with TypeScript and Tailwind CSS
- **Backend**: Node.js with Next.js API routes
- **Database**: PostgreSQL 16 with pgvector extension for vector operations
- **AI Models**: OpenAI GPT-4o + Anthropic Claude 3.5 Sonnet with multi-model reasoning
- **Search**: Tavily API for medical-focused web search with citations
- **Workflow**: LangGraph for orchestrating complex medical reasoning pipelines
- **Monitoring**: Comprehensive cost tracking and analytics
- **Architecture Patterns**: Repository pattern, Strategy pattern, Factory pattern

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ or Bun
- Docker and Docker Compose
- API Keys for:
  - OpenAI (GPT-4o/GPT-4o-mini)
  - Anthropic (Claude 3.5 Sonnet)
  - Tavily (for medical search)

### 1. Clone and Setup Environment

```bash
# Clone the repository
git clone https://github.com/langchain-ai/langchain-nextjs-template.git doctor-gpt
cd doctor-gpt

# Copy environment template
cp env.example .env.local

# Edit .env.local with your API keys
nano .env.local
```

### 2. Configure Environment Variables

Update `.env.local` with your credentials:

```bash
# Required API Keys
OPENAI_API_KEY="sk-your-openai-key-here"
ANTHROPIC_API_KEY="sk-ant-your-anthropic-key-here"
TAVILY_API_KEY="tvly-your-tavily-key-here"

# Database (automatically configured for Docker)
DATABASE_URL="postgresql://doctor_gpt:doctor_gpt_password@localhost:5432/doctor_gpt"
DIRECT_URL="postgresql://doctor_gpt:doctor_gpt_password@localhost:5432/doctor_gpt"

# Application Settings
NODE_ENV="development"
APP_URL="http://localhost:3000"
ENABLE_COST_TRACKING="true"
```

### 3. Start Database Services

```bash
# Start PostgreSQL with pgvector extension
docker-compose up -d postgres

# Optional: Start all services including pgAdmin and Redis
docker-compose --profile dev up -d

# Verify database is running
docker-compose ps
```

### 4. Initialize Database

```bash
# Install dependencies
bun install

# Generate Prisma client
bun prisma generate

# Run database migrations
bun prisma migrate dev --name init

# Seed with medical data
bun ts-node scripts/seed-medical-data.ts
```

### 5. Start Development Server

```bash
# Start the application
bun dev

# Application will be available at:
# - Main app: http://localhost:3000
# - pgAdmin: http://localhost:5050 (admin@doctorgpt.local / admin)
# - Minio: http://localhost:9001 (minioadmin / minioadmin)
```

## 🏥 Features

### Core Medical Features

1. **Multi-Model Medical Reasoning**
   - Combines OpenAI GPT-4o and Anthropic Claude 3.5 Sonnet
   - Consensus-based responses with confidence scoring
   - Medical safety validation and fact-checking

2. **Medical Document Processing**
   - Upload and analyze prescriptions, lab reports, medical images
   - Automatic text extraction (PDF, DOCX, images via OCR)
   - Medical entity recognition and classification
   - Vector embedding storage for semantic search

3. **Evidence-Based Search**
   - Tavily integration for medical literature search
   - Prioritizes trusted sources (PubMed, NIH, Mayo Clinic, etc.)
   - Automatic citation generation with reliability scoring
   - Real-time fact-checking against medical guidelines

4. **LangGraph Workflow Engine**
   - Sophisticated medical reasoning pipeline
   - Document ingestion → Embedding → RAG retrieval → Multi-model inference
   - Response validation and citation enhancement
   - Quality scoring and safety checks

5. **Cost Tracking & Analytics**
   - Real-time cost monitoring for all API calls
   - Budget management with alerts
   - Detailed usage analytics by user, session, and operation
   - Cost optimization insights

### Technical Features

1. **Scalable Architecture**
   - Repository pattern for AI model management
   - Centralized configuration management
   - Modular, testable code following SOLID principles
   - Async session management with Prisma

2. **Production-Ready Database**
   - PostgreSQL 16 with pgvector for high-performance vector operations
   - Optimized for medical data with custom vector similarity functions
   - Comprehensive indexing for fast searches
   - Redis caching for session management

3. **Advanced RAG Pipeline**
   - Vector similarity search for relevant document retrieval
   - Hybrid search combining vector and keyword matching
   - Medical domain-specific embedding strategies
   - Dynamic context assembly for model queries

4. **Security & Compliance**
   - Medical data anonymization
   - Audit logging for all operations
   - Rate limiting and quota management
   - HIPAA-conscious design patterns

## 📊 API Endpoints

### Chat API
```bash
POST /api/chat/doctor-gpt
Content-Type: application/json

{
  "messages": [
    {
      "role": "user", 
      "content": "I have chest pain and shortness of breath"
    }
  ],
  "userId": "user-123",
  "medicalContext": {
    "patientAge": 45,
    "currentSymptoms": ["chest pain", "shortness of breath"],
    "urgencyLevel": "high"
  }
}
```

### File Upload API
```bash
POST /api/upload/medical-documents
Content-Type: multipart/form-data

FormData:
- file: (medical document)
- userId: "user-123"
- reportType: "lab_report"
```

### Health Check
```bash
GET /api/chat/doctor-gpt
GET /api/upload/medical-documents
```

## 🧪 Testing the System

### 1. Test Medical Chat

Visit `http://localhost:3000` and try these queries:

```
"I'm experiencing chest pain and shortness of breath. What should I do?"

"Can you explain the results of my blood glucose test showing 145 mg/dL?"

"What are the side effects of metformin for diabetes?"
```

### 2. Test Document Upload

1. Create a sample medical document (text file):
```
Patient: John Doe
Test: Blood Glucose
Result: 145 mg/dL (Normal: 70-100)
Date: Today
```

2. Upload via the frontend or API:
```bash
curl -X POST http://localhost:3000/api/upload/medical-documents \
  -F "file=@test-results.txt" \
  -F "userId=test-user" \
  -F "reportType=lab_report"
```

### 3. Verify Database

Access pgAdmin at `http://localhost:5050`:
- Email: `admin@doctorgpt.local`
- Password: `admin`

Check these tables:
- `medical_reports` - Uploaded documents
- `chats` - Conversation history
- `cost_logs` - API usage tracking
- `medical_knowledge` - Seeded medical data

## 📈 Monitoring & Analytics

### Cost Tracking Dashboard

The system tracks costs for:
- Model inference (per token)
- Web searches (per query)
- Document processing (per file)
- Vector operations (per query)

Access cost data via:
```typescript
import { costTracker } from './lib/cost-tracking/tracker';

// Get user cost summary
const summary = await costTracker.getCostSummary('user-id');

// Set budget limits
await costTracker.setBudget('user-id', 'daily', 10.00);
```

### Health Monitoring

```bash
# Check service health
curl http://localhost:3000/api/chat/doctor-gpt
curl http://localhost:3000/api/upload/medical-documents

# Check database connection
docker-compose exec postgres pg_isready

# View logs
docker-compose logs postgres
docker-compose logs redis
```

## 🔧 Configuration Options

### Model Configuration

Modify `lib/models/repository.ts` to:
- Add new AI providers
- Adjust model priorities
- Configure fallback strategies
- Set rate limits

### Workflow Configuration

Customize `lib/workflows/doctor-gpt-workflow.ts` to:
- Modify reasoning pipeline
- Add new validation steps
- Adjust confidence thresholds
- Configure citation requirements

### Search Configuration

Update `lib/search/tavily.ts` to:
- Add medical domains
- Adjust source reliability scores
- Configure search parameters
- Customize medical specializations

## 🚨 Important Medical Disclaimers

⚠️ **This is a demonstration system and should NOT be used for actual medical diagnosis or treatment.**

- All responses include medical disclaimers
- The system emphasizes consulting healthcare professionals
- No diagnostic capabilities - educational information only
- Implements safety checks for high-risk medical content

## 🔄 Development Workflow

### Adding New Features

1. **New AI Provider**:
   - Implement `AIModelProvider` interface
   - Add to `ModelRepository`
   - Update configuration

2. **New Workflow Node**:
   - Define in `lib/workflows/types.ts`
   - Implement in `doctor-gpt-workflow.ts`
   - Add routing logic

3. **New Medical Source**:
   - Extend Tavily search domains
   - Add source reliability scoring
   - Update citation format

### Testing

```bash
# Run type checking
bun run tsc

# Run linting
bun run lint

# Test database connection
bun prisma studio

# Validate configuration
node -e "require('./config').config.validateConfig()"
```

## 📦 Production Deployment

### Environment Setup

1. **Database**: Use managed PostgreSQL with pgvector extension
2. **Redis**: Use managed Redis for caching
3. **File Storage**: Configure S3-compatible storage for documents
4. **Monitoring**: Set up error tracking and performance monitoring

### Security Considerations

1. **API Keys**: Use environment-specific secrets management
2. **Database**: Enable SSL, configure firewall rules
3. **Rate Limiting**: Implement IP-based rate limiting
4. **Audit Logs**: Enable comprehensive logging for compliance

### Scaling

The architecture supports horizontal scaling:
- **API**: Stateless Next.js deployment
- **Database**: Read replicas for query scaling
- **Vector Search**: Distributed vector databases
- **Caching**: Redis cluster for session management

## 🤝 Contributing

The codebase follows strict engineering principles:

1. **SOLID Principles**: Single responsibility, Open/closed, Liskov substitution, Interface segregation, Dependency inversion
2. **DRY**: Don't repeat yourself
3. **KISS**: Keep it simple, stupid
4. **YAGNI**: You aren't gonna need it

Please maintain these standards when contributing.

## 📞 Support

For issues and questions:
1. Check the logs: `docker-compose logs`
2. Verify configuration: `config.validateConfig()`
3. Test database connectivity: `prisma studio`
4. Review API responses for error details

## 🎯 Next Steps

This foundation provides:
✅ Multi-model medical reasoning
✅ Document processing and RAG
✅ Cost tracking and analytics  
✅ Production-ready architecture
✅ Comprehensive Docker setup

Potential enhancements:
- [ ] Real-time voice interaction
- [ ] Medical image analysis (X-rays, MRIs)
- [ ] Integration with EHR systems
- [ ] Telemedicine video capabilities
- [ ] Mobile application
- [ ] Advanced medical NLP models

---

**Remember**: This is a sophisticated medical AI demo. Always consult healthcare professionals for actual medical advice!
