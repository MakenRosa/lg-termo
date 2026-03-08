#!/usr/bin/env python
import argparse
import json
import math
import unicodedata
from collections import Counter
from pathlib import Path


def normalize_word(value):
    if not isinstance(value, str):
        return ""
    text = unicodedata.normalize("NFD", value)
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn")
    text = "".join(ch for ch in text if ("A" <= ch <= "Z") or ("a" <= ch <= "z"))
    return text.upper()


def load_dictionary(path):
    data = json.loads(path.read_text(encoding="utf-8-sig"))
    if isinstance(data, list):
        return data, None
    if isinstance(data, dict) and isinstance(data.get("words"), list):
        return data["words"], data
    raise ValueError("five-letters.json must be a list of words or an object with a 'words' list")


def load_frequencies(path, word_column, freq_column, delimiter):
    freq_map = {}
    with path.open("r", encoding="utf-8-sig") as handle:
        header = handle.readline().rstrip("\n")
        if not header:
            return freq_map
        columns = header.split(delimiter)
        try:
            word_index = columns.index(word_column)
            freq_index = columns.index(freq_column)
        except ValueError as exc:
            raise ValueError(
                f"Frequency file missing required columns: {word_column} / {freq_column}"
            ) from exc
        for line in handle:
            line = line.rstrip("\n")
            if not line:
                continue
            parts = line.split(delimiter)
            if len(parts) <= max(word_index, freq_index):
                continue
            word_raw = parts[word_index]
            freq_raw = parts[freq_index]
            try:
                freq_value = float(freq_raw)
            except ValueError:
                continue
            normalized = normalize_word(word_raw)
            if len(normalized) != 5:
                continue
            freq_map[normalized] = freq_map.get(normalized, 0.0) + freq_value
    return freq_map


def build_ngram_model(words, n, alpha):
    counts = Counter()
    context_counts = Counter()
    for word in words:
        padded = "^" * (n - 1) + word + "$"
        for i in range(len(padded) - n + 1):
            ngram = padded[i : i + n]
            counts[ngram] += 1
            context_counts[ngram[:-1]] += 1

    alphabet = set("".join(words)) | {"$"}
    return counts, context_counts, len(alphabet), alpha


def score_word(word, counts, context_counts, alphabet_size, n, alpha):
    padded = "^" * (n - 1) + word + "$"
    logp = 0.0
    for i in range(len(padded) - n + 1):
        ngram = padded[i : i + n]
        context = ngram[:-1]
        logp += math.log((counts[ngram] + alpha) / (context_counts[context] + alpha * alphabet_size))
    return logp


def clamp_distribution(probs, min_p, max_p):
    clamped = [min(max(p, min_p), max_p) for p in probs]
    total = sum(clamped)
    for _ in range(1000):
        delta = 1.0 - total
        if abs(delta) < 1e-12:
            break
        if delta > 0:
            eligible = [i for i, p in enumerate(clamped) if p < max_p - 1e-15]
            growable = sum(max_p - clamped[i] for i in eligible)
            if not eligible or growable <= 0:
                break
            for i in eligible:
                clamped[i] += delta * (max_p - clamped[i]) / growable
        else:
            eligible = [i for i, p in enumerate(clamped) if p > min_p + 1e-15]
            reducible = sum(clamped[i] - min_p for i in eligible)
            if not eligible or reducible <= 0:
                break
            for i in eligible:
                clamped[i] += delta * (clamped[i] - min_p) / reducible
        total = sum(clamped)
    return clamped


def main():
    parser = argparse.ArgumentParser(
        description="Add weighted probabilities to five-letters.json based on a character n-gram model."
    )
    parser.add_argument(
        "--input",
        default="termo_tv/data/five-letters.json",
        help="Path to the input five-letters.json",
    )
    parser.add_argument(
        "--output",
        default=None,
        help="Path to write the weighted dictionary (defaults to input path)",
    )
    parser.add_argument("--ngram", type=int, default=3, help="N-gram size to use")
    parser.add_argument(
        "--alpha",
        type=float,
        default=0.5,
        help="Additive smoothing value for the n-gram model",
    )
    parser.add_argument(
        "--temperature",
        type=float,
        default=1.0,
        help="Temperature applied to the log scores before normalization",
    )
    parser.add_argument(
        "--min-ratio",
        type=float,
        default=0.25,
        help="Minimum probability as a ratio of the uniform average",
    )
    parser.add_argument(
        "--max-ratio",
        type=float,
        default=3.0,
        help="Maximum probability as a ratio of the uniform average",
    )
    parser.add_argument(
        "--decimals",
        type=int,
        default=10,
        help="Decimal places to round probabilities (set to 0 to disable rounding)",
    )
    parser.add_argument(
        "--freq-file",
        default=None,
        help="Optional TSV/CSV file with word frequencies to blend into scores",
    )
    parser.add_argument(
        "--freq-word-column",
        default="Word",
        help="Column name containing the words in the frequency file",
    )
    parser.add_argument(
        "--freq-column",
        default="FREQcount",
        help="Column name containing the frequency values in the frequency file",
    )
    parser.add_argument(
        "--freq-delimiter",
        default="\t",
        help="Delimiter used in the frequency file (default: tab)",
    )
    parser.add_argument(
        "--freq-blend",
        type=float,
        default=0.3,
        help="Blend ratio for frequency score vs LM score (0=LM only, 1=freq only)",
    )
    parser.add_argument(
        "--freq-floor",
        type=float,
        default=1.0,
        help="Floor added to frequency values before log scaling",
    )
    args = parser.parse_args()

    input_path = Path(args.input)
    output_path = Path(args.output) if args.output else input_path

    words_raw, existing = load_dictionary(input_path)
    if not words_raw:
        raise ValueError("five-letters.json has no words")

    normalized = [normalize_word(word) for word in words_raw]
    if any(len(word) != 5 for word in normalized):
        raise ValueError("All words must normalize to 5 letters before weighting.")

    counts, context_counts, alphabet_size, alpha = build_ngram_model(normalized, args.ngram, args.alpha)

    lm_scores = [
        score_word(word, counts, context_counts, alphabet_size, args.ngram, alpha)
        for word in normalized
    ]

    freq_map = {}
    freq_matches = 0
    if args.freq_file:
        freq_path = Path(args.freq_file)
        freq_map = load_frequencies(
            freq_path, args.freq_word_column, args.freq_column, args.freq_delimiter
        )

    if freq_map:
        blend = max(0.0, min(1.0, args.freq_blend))
        scores = []
        for word, lm_score in zip(normalized, lm_scores):
            freq_value = freq_map.get(word, 0.0)
            if freq_value > 0:
                freq_matches += 1
            freq_score = math.log(freq_value + args.freq_floor)
            scores.append(blend * freq_score + (1.0 - blend) * lm_score)
    else:
        scores = lm_scores

    scaled = [score / max(args.temperature, 1e-9) for score in scores]
    max_score = max(scaled)
    weights = [math.exp(score - max_score) for score in scaled]
    total = sum(weights)
    probs = [weight / total for weight in weights]

    avg = 1.0 / len(probs)
    min_p = avg * args.min_ratio
    max_p = avg * args.max_ratio
    probs = clamp_distribution(probs, min_p, max_p)

    if args.decimals and args.decimals > 0:
        probs = [round(p, args.decimals) for p in probs]

    weights_map = {word: prob for word, prob in zip(words_raw, probs)}

    output = {
        "words": words_raw,
        "weights": weights_map,
        "meta": {
            "method": "char_ngram_lm",
            "ngram": args.ngram,
            "alpha": args.alpha,
            "temperature": args.temperature,
            "minRatio": args.min_ratio,
            "maxRatio": args.max_ratio,
            "minProbability": min_p,
            "maxProbability": max_p,
            "totalWords": len(words_raw),
        },
    }

    if freq_map:
        output["meta"].update(
            {
                "freqFile": str(Path(args.freq_file).name),
                "freqWordColumn": args.freq_word_column,
                "freqColumn": args.freq_column,
                "freqDelimiter": args.freq_delimiter,
                "freqBlend": max(0.0, min(1.0, args.freq_blend)),
                "freqFloor": args.freq_floor,
                "freqMatches": freq_matches,
            }
        )

    if isinstance(existing, dict):
        for key, value in existing.items():
            if key in output or key == "words" or key == "weights":
                continue
            output[key] = value

    output_path.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8-sig")


if __name__ == "__main__":
    main()
