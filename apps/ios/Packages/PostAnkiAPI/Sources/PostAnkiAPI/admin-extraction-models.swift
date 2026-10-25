import Foundation

extension AdminExtractionModel {
    public static let all = [
        AdminExtractionModel(
            id: "openrouter/openai/gpt-6-luna", label: "GPT-6 Luna",
            inputPerMillion: 0.1, outputPerMillion: 0.5,
            note: "Best Russian coverage among cheap models, clean English. New model, behavior may change."
        ),
        AdminExtractionModel(
            id: "openrouter/anthropic/claude-haiku-5.5", label: "Claude Haiku 5.5",
            inputPerMillion: 0.1, outputPerMillion: 0.5,
            note: "Most precise wording, reliable schema. Fewer Russian items."
        ),
        AdminExtractionModel(
            id: "openrouter/google/gemma-4-31b-it", label: "Gemma 4 31B",
            inputPerMillion: 0.09, outputPerMillion: 0.34,
            note: "Cheapest reliable. Russian coverage is thinner, some cards drop."
        ),
        AdminExtractionModel(
            id: "openrouter/openai/gpt-oss-120b", label: "GPT-OSS 120B",
            inputPerMillion: 0.037, outputPerMillion: 0.17,
            note: "Cheapest input. Quality depends on the provider, one English timeout seen."
        ),
        AdminExtractionModel(
            id: "openrouter/mistralai/mistral-small-3.2-24b-instruct", label: "Mistral Small 3.2 24B",
            inputPerMillion: 0.094, outputPerMillion: 0.25,
            note: "European vendor, cheap. One weak English run."
        ),
        AdminExtractionModel(
            id: "openrouter/meta-llama/llama-3.3-70b-instruct", label: "Llama 3.3 70B",
            inputPerMillion: 0.22, outputPerMillion: 0.5,
            note: "Mature, strong English. Price varies by provider."
        ),
        AdminExtractionModel(
            id: "openrouter/openai/gpt-5-mini", label: "GPT-5 Mini",
            inputPerMillion: 0.25, outputPerMillion: 2.0,
            note: "Maximum coverage in both languages, about 8x the cost of Luna per text."
        ),
        AdminExtractionModel(
            id: "openrouter/google/gemini-3.1-flash-lite", label: "Gemini 3.1 Flash Lite",
            inputPerMillion: 0.25, outputPerMillion: 1.5,
            note: "Reliable English. Weak Russian coverage."
        ),
        AdminExtractionModel(
            id: "openrouter/openai/gpt-4o-mini", label: "GPT-4o Mini",
            inputPerMillion: 0.15, outputPerMillion: 0.6,
            note: "Widely used and stable. Weaker on Russian."
        ),
        AdminExtractionModel(
            id: "openrouter/openai/gpt-4.1-nano", label: "GPT-4.1 Nano",
            inputPerMillion: 0.1, outputPerMillion: 0.4,
            note: "Budget option. Unstable on English."
        )
    ]
}
