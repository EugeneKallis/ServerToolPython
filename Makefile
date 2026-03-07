PYTHON?=.venv/bin/python

PORT?=8080

.PHONY: run
run:
	$(PYTHON) -m uvicorn app.main:app --reload --port $(PORT)

.PHONY: test
test:
	$(PYTHON) -m pytest

.PHONY: lint
lint:
	$(PYTHON) -m flake8 app

.PHONY: build
build:
	docker build --platform linux/amd64 -t 192.168.1.201:31500/server-tool-python:latest .

.PHONY: push
push:
	docker push 192.168.1.201:31500/server-tool-python:latest

.PHONY: deploy
deploy:
	helm upgrade --install server-tool-python ./charts/server-tool-python
