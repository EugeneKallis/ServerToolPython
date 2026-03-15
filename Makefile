PYTHON?=backend/venv/bin/python

PORT?=8080
FRONTEND_PORT?=3000

.PHONY: run
run:
	cd backend && ../$(PYTHON) -m uvicorn app.main:app --reload --port $(PORT)

.PHONY: compose-dev
compose-dev:
	docker compose up --build

.PHONY: seed
seed:
	docker compose exec backend python app/seed.py

.PHONY: test
test:
	cd backend && ../$(PYTHON) -m pytest

.PHONY: lint
lint:
	cd backend && ../$(PYTHON) -m flake8 app

# Optionally load variables from a local .env file
-include .env
export

DOCKER_USER?=eugenekallis
VERSION?=latest

.PHONY: build-backend
build-backend:
	cd backend && docker build --platform linux/amd64 -t $(DOCKER_USER)/servertoolpython-backend:$(VERSION) .

.PHONY: push-backend
push-backend:
	docker push $(DOCKER_USER)/servertoolpython-backend:$(VERSION)

.PHONY: build-frontend
build-frontend:
	cd frontend && docker build --platform linux/amd64 -t $(DOCKER_USER)/servertoolpython-frontend:$(VERSION) .

.PHONY: push-frontend
push-frontend:
	docker push $(DOCKER_USER)/servertoolpython-frontend:$(VERSION)

.PHONY: build-agent
build-agent:
	cd agent && docker build --platform linux/amd64 -t $(DOCKER_USER)/servertoolpython-agent:$(VERSION) .

.PHONY: push-agent
push-agent:
	docker push $(DOCKER_USER)/servertoolpython-agent:$(VERSION)

.PHONY: build-all
build-all: build-backend build-frontend build-agent

.PHONY: push-all
push-all: push-backend push-frontend push-agent

.PHONY: helm-deploy
helm-deploy:
	helm upgrade --install servertool ./charts/servertool

.PHONY: helm-uninstall
helm-uninstall:
	helm uninstall servertool

.PHONY: helm-template
helm-template:
	helm template servertool ./charts/servertool

.PHONY: helm-lint
helm-lint:
	helm lint ./charts/servertool

.PHONY: migration
migration:
	cd backend && ../$(PYTHON) -m alembic revision --autogenerate -m "$(MESSAGE)"

.PHONY: migrate
migrate:
	cd backend && ../$(PYTHON) -m alembic upgrade head
