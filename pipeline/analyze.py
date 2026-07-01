"""Capa de NLP: sentimiento (VADER) + entidades (gazetteer).

Diseño enchufable ("pluggable"): si más adelante querés reemplazar VADER por un
modelo transformer, o el gazetteer por spaCy/transformers para NER real, sólo
tenés que cambiar analyze_sentiment() y build_entity_matchers()/find_entities().
El resto del pipeline no se entera.
"""

import re

from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer

_analyzer = SentimentIntensityAnalyzer()


def sentiment_label(compound: float) -> str:
    """Umbrales estándar de VADER para etiquetar el compound [-1, 1]."""
    if compound >= 0.05:
        return "positive"
    if compound <= -0.05:
        return "negative"
    return "neutral"


def analyze_sentiment(text: str) -> dict:
    scores = _analyzer.polarity_scores(text)
    scores["label"] = sentiment_label(scores["compound"])
    return scores


def build_entity_matchers(conflict: dict) -> list[tuple]:
    """Compila un regex por entidad a partir de su nombre + alias.

    Usamos \\b (límite de palabra) para no matchear dentro de otras palabras.
    """
    matchers = []
    for ent in conflict.get("entities", []):
        terms = [ent["name"], *ent.get("aliases", [])]
        pattern = re.compile(
            r"\b(" + "|".join(re.escape(t) for t in terms) + r")\b",
            re.IGNORECASE,
        )
        matchers.append((ent["name"], ent.get("type", "MISC"), pattern))
    return matchers


def find_entities(text: str, matchers: list[tuple]) -> list[dict]:
    """Devuelve las entidades del gazetteer presentes en el texto (una vez c/u)."""
    found = []
    for name, etype, pattern in matchers:
        if pattern.search(text):
            found.append({"name": name, "type": etype})
    return found


def analyze_article(article: dict, matchers: list[tuple]) -> dict:
    """Enriquece un artículo con 'sentiment' y 'entities'. Muta y devuelve."""
    text = f"{article['title']}. {article['summary']}"
    article["sentiment"] = analyze_sentiment(text)
    article["entities"] = find_entities(text, matchers)
    return article
