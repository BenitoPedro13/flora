#!/bin/bash
set -e

echo "🚀 Setting up Flora Development Environment..."

# Check for prerequisites
if ! command -v python3 &> /dev/null; then
    echo "❌ Python3 is not installed."
    exit 1
fi

if ! command -v pnpm &> /dev/null; then
    echo "❌ pnpm is not installed. Please install it: npm install -g pnpm"
    exit 1
fi

if ! command -v poetry &> /dev/null; then
    echo "⚠️ Poetry not found. Installing..."
    curl -sSL https://install.python-poetry.org | python3 -
fi

echo "📦 Installing Backend Dependencies..."
cd apps/backend
# Initialize Poetry if not exists
if [ ! -f "pyproject.toml" ]; then
    echo "⚠️ Initializing new Poetry project..."
    poetry init --name="flora-backend" --description="Satellite Data API" --author="Flora Team" -n
    poetry add fastapi uvicorn google-api-python-client earthengine-api
    poetry add --group dev pytest ruff
fi
poetry install
cd ../..

echo "📦 Installing Frontend Dependencies..."
cd apps/frontend
if [ -f "package.json" ]; then
    pnpm install
else
    echo "⚠️ Frontend not initialized. Creating Next.js app..."
    # We will use pnpm to create the app.
    # Note: This might be interactive, so we might skip this in this script and run it via tool.
    echo "Run: pnpm create next-app . --typescript --tailwind --eslint"
fi
cd ../..

echo "✅ Setup Complete! Run 'make dev' to start."

