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
