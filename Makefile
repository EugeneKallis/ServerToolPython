PYTHON?=.venv/bin/python

PORT?=8080
FRONTEND_PORT?=3000

.PHONY: run
run:
	cd backend && ../$(PYTHON) -m uvicorn app.main:app --reload --port $(PORT)

.PHONY: test
test:
	cd backend && ../$(PYTHON) -m pytest

.PHONY: lint
lint:
	cd backend && ../$(PYTHON) -m flake8 app

.PHONY: build
build:
	cd backend && docker build --platform linux/amd64 -t 192.168.1.201:31500/server-tool-python:latest .

.PHONY: frontend-build
frontend-build:
	cd frontend && docker build -t server-tool-frontend:latest .

.PHONY: frontend-run
frontend-run:
	docker run -p $(FRONTEND_PORT):3000 server-tool-frontend:latest

.PHONY: push
push:
	docker push 192.168.1.201:31500/server-tool-python:latest

.PHONY: deploy
deploy:
	cd backend && helm upgrade --install server-tool-python ./charts/server-tool-python
