# Doctor GPT Backend - Python FastAPI Implementation

Advanced medical AI assistant backend with multi-model reasoning, RAG, and healthcare focus, migrated from NextJS to Python FastAPI.

## 🏗️ Architecture

- **FastAPI** - Modern, fast web framework for building APIs
- **SQLAlchemy** - Python SQL toolkit and ORM
- **Alembic** - Database migration tool
- **Qdrant** - Vector database for semantic search
- **LiteLLM** - Cost tracking for AI model usage
- **Poetry** - Dependency management
- **Pydantic** - Data validation using Python type annotations

## 🚀 Quick Start

### Prerequisites

- Python 3.11+
- Conda (Miniconda/Anaconda)
- Docker & Docker Compose
- PostgreSQL (via Docker)
- Qdrant (via Docker)

### 1. Environment Setup

```bash
# Clone and navigate to the backend
cd python-backend

# Run setup script (creates conda env and installs dependencies)
./setup_environment.sh

# Activate environment
conda activate doctor-gpt-backend
```

### 2. Database Setup

```bash
# Start Docker services (PostgreSQL, Qdrant, Redis)
cd ../langchain-nextjs-template
docker-compose up -d

# Return to backend
cd ../python-backend

# Initialize databases
python scripts/init_databases.py

# Run migrations
alembic upgrade head
```

### 3. Configuration

Edit the `.env` file in `../langchain-nextjs-template/` with your API keys:

```env
# AI Model API Keys
OPENAI_API_KEY="your_openai_api_key_here"
ANTHROPIC_API_KEY="your_anthropic_api_key_here"

# Search APIs
TAVILY_API_KEY="your_tavily_api_key_here"

# Database URLs
DATABASE_URL="postgresql://doctor_gpt:doctor_gpt_password@localhost:5432/doctor_gpt"
QDRANT_URL="http://localhost:6333"
```

### 4. Start the Server

```bash
# Development server with auto-reload
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Production server
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

### 5. Test the APIs

```bash
# Run comprehensive API tests
python scripts/test_apis.py

# Or test specific endpoints manually
curl http://localhost:8000/health
```

## 📚 API Documentation

Once the server is running, visit:

- **Interactive API Docs**: http://localhost:8000/api/v1/docs
- **ReDoc Documentation**: http://localhost:8000/api/v1/redoc
- **OpenAPI JSON**: http://localhost:8000/api/v1/openapi.json

## 🔧 Key Features

### Multi-Model AI Integration
- **OpenAI GPT-4** integration via LangChain
- **Anthropic Claude** integration via LangChain
- **LiteLLM** for accurate cost tracking
- Multi-model reasoning with consensus building

### Medical Document Processing
- **Advanced PDF extraction** with multiple fallback strategies
- **OCR support** for scanned documents using Tesseract
- **Smart chunking** with semantic section detection
- **Medical entity extraction** and tagging

### Vector Search & RAG
- **Qdrant vector database** for semantic search
- **Dual RAG approach** (global knowledge + session documents)
- **Embedding generation** with OpenAI text-embedding-ada-002
- **Citation tracking** and source reliability scoring

### Database & Migrations
- **PostgreSQL** for structured data
- **Alembic migrations** for schema versioning
- **Async SQLAlchemy** for high performance
- **Comprehensive data models** for medical workflows

## 📁 Project Structure

```
python-backend/
├── app/
│   ├── api/                    # API routes and endpoints
│   │   └── endpoints/         # Individual endpoint modules
│   ├── core/                  # Core configuration and settings
│   ├── db/                    # Database configuration
│   ├── models/               # SQLAlchemy models
│   ├── services/             # Business logic services
│   ├── utils/                # Utility functions
│   └── workflows/            # Complex workflows
├── alembic/                  # Database migrations
├── scripts/                  # Utility scripts
├── tests/                    # Test files
├── pyproject.toml           # Poetry dependencies
├── environment.yml          # Conda environment
└── README.md
```

## 🧪 Testing

### Run All Tests
```bash
# Unit tests
pytest tests/unit/

# Integration tests
pytest tests/integration/

# API tests
python scripts/test_apis.py

# Load tests
locust -f tests/load_test.py
```

### Manual Testing
```bash
# Health check
curl http://localhost:8000/health

# Upload document
curl -X POST "http://localhost:8000/api/v1/upload/medical-documents" \
  -F "file=@test_document.pdf" \
  -F "userId=test-user" \
  -F "reportType=lab_report"

# Chat with AI
curl -X POST "http://localhost:8000/api/v1/chat/doctor-gpt" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role": "user", "content": "What are the symptoms of diabetes?"}],
    "userId": "test-user"
  }'
```

## 🔄 Database Operations

### Migrations
```bash
# Create new migration
alembic revision --autogenerate -m "Description of changes"

# Upgrade to latest
alembic upgrade head

# Downgrade one step
alembic downgrade -1

# Check current version
alembic current

# View migration history
alembic history --verbose
```

### Reset Database
```bash
# Reset all data (destructive!)
alembic downgrade base
alembic upgrade head
python scripts/init_databases.py
```

## 📊 Monitoring & Observability

### Metrics
- **Prometheus metrics** at `/metrics`
- **Cost tracking** via LiteLLM integration
- **Performance monitoring** with structured logging

### Logs
- **Structured logging** with contextual information
- **Different log levels** for development/production
- **Error tracking** with detailed stack traces

### Health Checks
- **Application health**: `/health`
- **Admin health**: `/api/v1/admin/health`
- **Retrieval health**: `/api/v1/retrieval/health`

## 🔒 Security

### Authentication
- **JWT token** support (configurable)
- **API key** authentication for external services
- **Rate limiting** to prevent abuse

### Data Protection
- **Input validation** with Pydantic
- **SQL injection** prevention via SQLAlchemy
- **CORS** configuration for frontend integration
- **PHI redaction** utilities for medical data

## 🚀 Deployment

### Docker
```bash
# Build image
docker build -t doctor-gpt-backend .

# Run container
docker run -p 8000:8000 doctor-gpt-backend
```

### Production Considerations
- Set `ENVIRONMENT=production` in `.env`
- Configure proper `SECRET_KEY` and `JWT_SECRET`
- Set up SSL/TLS termination
- Configure log aggregation
- Set up monitoring and alerting

## 🔗 Integration Points

### Frontend Integration
The backend is designed to work with the existing NextJS frontend:
- **Same API endpoints** as the original backend
- **Compatible response formats** for seamless migration
- **Shared environment configuration** via `.env` files

### External Services
- **OpenAI/Anthropic APIs** for language models
- **Tavily API** for web search capabilities
- **Qdrant** for vector storage and similarity search

## 🛠️ Development

### Code Quality
```bash
# Format code
black .
isort .

# Lint code
flake8 .
mypy .

# Run pre-commit hooks
pre-commit run --all-files
```

### Adding New Features
1. Create models in `app/models/`
2. Create database migrations with Alembic
3. Implement services in `app/services/`
4. Add API endpoints in `app/api/endpoints/`
5. Write tests in `tests/`
6. Update documentation

## 📝 Migration Notes

This backend is a complete migration from the original NextJS backend with the following improvements:

- **Better performance** with async Python and FastAPI
- **Stronger typing** with Pydantic and SQLAlchemy
- **Improved error handling** and logging
- **Better cost tracking** with LiteLLM
- **Enhanced security** with proper input validation
- **Cleaner architecture** with separation of concerns

All original functionality has been preserved while improving code quality, performance, and maintainability.

## 🆘 Troubleshooting

### Common Issues

1. **Database connection failed**
   - Ensure PostgreSQL is running: `docker-compose ps`
   - Check connection string in `.env`

2. **Qdrant not available**
   - Ensure Qdrant is running: `curl http://localhost:6333/health`
   - Check Qdrant URL in configuration

3. **AI API errors**
   - Verify API keys in `.env`
   - Check API rate limits and quotas

4. **Import errors**
   - Ensure conda environment is activated
   - Run `poetry install` to update dependencies

### Getting Help
- Check the logs for detailed error messages
- Run health checks to identify failing components
- Use the test scripts to validate functionality
- Consult the API documentation for endpoint details

## 📄 License

MIT License - see the original project for details.

