PYTHON?=backend/venv/bin/python

PORT?=8080
FRONTEND_PORT?=3000

.PHONY: run
run:
	cd backend && ../$(PYTHON) -m uvicorn app.main:app --reload --port $(PORT)

.PHONY: compose-dev
dev:
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

.PHONY: build-arr-searcher
build-arr-searcher:
	cd arr_searcher && docker build --platform linux/amd64 -t $(DOCKER_USER)/servertoolpython-arr-searcher:$(VERSION) .

.PHONY: push-arr-searcher
push-arr-searcher:
	docker push $(DOCKER_USER)/servertoolpython-arr-searcher:$(VERSION)

.PHONY: build-all
build-all: build-backend build-frontend build-agent build-arr-searcher

.PHONY: push-all
push-all: push-backend push-frontend push-agent push-arr-searcher

.PHONY: helm-deploy
helm-deploy:
	helm upgrade --install servertool ../kubernetes-cluster/charts/servertool-python

.PHONY: helm-uninstall
helm-uninstall:
	helm uninstall servertool

.PHONY: helm-template
helm-template:
	helm template servertool ../kubernetes-cluster/charts/servertool-python

.PHONY: helm-lint
helm-lint:
	helm lint ../kubernetes-cluster/charts/servertool-python

.PHONY: migration
migration:
	cd backend && ../$(PYTHON) -m alembic revision --autogenerate -m "$(MESSAGE)"

.PHONY: migrate
migrate:
	cd backend && ../$(PYTHON) -m alembic upgrade head
