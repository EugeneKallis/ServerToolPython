from setuptools import setup, find_packages

setup(
    name="servertoolpython",
    version="0.1.0",
    packages=find_packages(),
    install_requires=[
        "fastapi",
        "uvicorn",
        "pytest",
        "httpx",
        "jinja2",
        "sqlmodel",
    ],
)