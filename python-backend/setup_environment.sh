#!/bin/bash
set -e

echo "🚀 Setting up Doctor GPT Backend Environment"
echo "============================================="

# Check if conda is installed
if ! command -v conda &> /dev/null; then
    echo "❌ Conda is not installed. Please install Miniconda or Anaconda first."
    echo "   Download from: https://docs.conda.io/en/latest/miniconda.html"
    exit 1
fi

# Create conda environment
echo "🔄 Creating conda environment..."
if conda env list | grep -q "doctor-gpt-backend"; then
    echo "⚠️  Environment 'doctor-gpt-backend' already exists. Removing it..."
    conda env remove -n doctor-gpt-backend -y
fi

conda env create -f environment.yml

# Activate environment and install dependencies
echo "🔄 Installing Python dependencies..."
eval "$(conda shell.bash hook)"
conda activate doctor-gpt-backend

# Install poetry in the environment if not already installed
if ! command -v poetry &> /dev/null; then
    echo "🔄 Installing Poetry..."
    pip install poetry
fi

# Install project dependencies
echo "🔄 Installing project dependencies with Poetry..."
poetry install

# Copy environment file
echo "🔄 Setting up environment configuration..."
if [ ! -f "../langchain-nextjs-template/.env" ]; then
    echo "⚠️  Main .env file not found. Creating from example..."
    if [ -f "../langchain-nextjs-template/env.example" ]; then
        cp "../langchain-nextjs-template/env.example" "../langchain-nextjs-template/.env"
        echo "📝 Please edit ../langchain-nextjs-template/.env with your API keys"
    else
        echo "❌ No env.example file found. Please create .env manually."
    fi
else
    echo "✅ Environment file found"
fi

# Check if Docker is running (for PostgreSQL and Qdrant)
if ! docker info >/dev/null 2>&1; then
    echo "⚠️  Docker is not running. Please start Docker for PostgreSQL and Qdrant."
    echo "   You can start the services with: docker-compose up -d"
else
    echo "✅ Docker is running"
fi

echo ""
echo "🎉 Environment setup completed!"
echo ""
echo "📋 Next steps:"
echo "   1. Activate the environment: conda activate doctor-gpt-backend"
echo "   2. Start Docker services: cd ../langchain-nextjs-template && docker-compose up -d"
echo "   3. Initialize databases: python scripts/init_databases.py"
echo "   4. Run migrations: alembic upgrade head"
echo "   5. Start the server: uvicorn app.main:app --reload"
echo "   6. Test APIs: python scripts/test_apis.py"
echo ""
echo "🔗 Access points:"
echo "   - FastAPI: http://localhost:8000"
echo "   - API Docs: http://localhost:8000/api/v1/docs"
echo "   - PostgreSQL: localhost:5432"
echo "   - Qdrant: http://localhost:6333"
echo ""
echo "💡 Don't forget to configure your API keys in the .env file!"

