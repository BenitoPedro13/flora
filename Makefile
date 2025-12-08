.PHONY: help install dev test lint clean

# Default target
help:
	@echo "Available commands:"
	@echo "  make install  - Install dependencies for both Frontend and Backend"
	@echo "  make dev      - Start both servers locally (requires 'concurrently')"
	@echo "  make test     - Run tests for both projects"
	@echo "  make lint     - Lint both projects"

# Install dependencies
install:
	@echo "Installing Backend dependencies..."
	cd apps/backend && poetry install
	@echo "Installing Frontend dependencies..."
	cd apps/frontend && pnpm install

# Development
dev:
	@echo "Starting servers... (Press Ctrl+C to stop)"
	@# We use npx concurrently to avoid global install requirement, or pnpm dlx
	concurrently "cd apps/backend && /Users/benitoxavier/Library/Python/3.9/bin/poetry run uvicorn main:app --reload --port 8000" "cd apps/frontend && pnpm dev"

# Testing
test:
	@echo "Running Backend Tests..."
	cd apps/backend && poetry run pytest
	@echo "Running Frontend Tests..."
	cd apps/frontend && pnpm test

# Linting
lint:
	@echo "Linting Backend..."
	cd apps/backend && poetry run ruff check .
	@echo "Linting Frontend..."
	cd apps/frontend && pnpm lint

clean:
	find . -type d -name "__pycache__" -exec rm -rf {} +
	find . -type d -name ".pytest_cache" -exec rm -rf {} +
	rm -rf apps/frontend/.next

