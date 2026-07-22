# Future feature ideas

This document collects uncommitted product ideas for maintainers and product owners. It supports
prioritization but does not define approved requirements, release scope, or architecture. Each idea
should record its value, status, dependencies, and relevant privacy, security, and cost
considerations.

## Image capture with remote llm detection for faster expense entry

User takes a picture of a receipt, and the app uses a remote llm to extract the relevant information and prefill the Add Expense form.

- Would require the user to add an OpenRouter API Key, but at best, we use only free llms so that the feature would not cost anything. API Key and the used LLM model must be defined in the settings to be able to change the llm in case the first one is not longer free.
- Time for response of the llm could be critical to the user experience though.
- Editable System prompt? Or part of it. Than it would be possible to split the Transfer into multiple transfers. e.g. If the user bought groceries, clothes and snacks/sweets, the llm could split them into multiple transfers. But that would make the transfer creation much more complex because the llm should only prefill the new transfer form.

## Transfer filters

Filters transfers by income/expanse, account, text in the transfer view
