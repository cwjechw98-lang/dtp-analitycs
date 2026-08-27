"""Semantic Contract v1 — нормализационный слой между raw и продуктом.

Phase 1A: детерминированные, рецензируемые, версионированные mapping-таблицы
(JSON) + contract.py (точка чтения). НЕ встроен в build_all.py.
"""
from .contract import SEMANTIC_CONTRACT_VERSION  # noqa: F401
