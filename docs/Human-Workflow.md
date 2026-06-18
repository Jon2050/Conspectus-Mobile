# Human Workflow (Orchestrierung & Aufgaben des Entwicklers)

Dieses Dokument beschreibt ausschließlich die manuellen Schritte, die du als **menschlicher Entwickler** ausführen musst, um das Projekt fortzuführen und die KI-Agenten zu steuern. Die eigentliche Codierung, das Testen, das Branching und die Dokumentationspflege übernehmen die Agenten automatisch.

---

## 🔄 1. Standard-Issue-Loop (Features & Bugfixes)

Wenn du ein neues Feature oder einen Bugfix implementieren willst, folgst du diesem Ablauf:

### 1. Issue auswählen

- Öffne das Backlog unter [GitHub-Issues-MVP-Backlog.md](./GitHub-Issues-MVP-Backlog.md) und wähle das nächste offene Issue (z. B. `M4-08`).

### 2. Agenten beauftragen (Task-Prompt)

- Kopiere den Inhalt aus [Task-Prompt-Template.md](./prompts/Task-Prompt-Template.md).
- Ersetze alle Vorkommen von `M4-08` durch dein ausgewähltes Issue.
- Starte den Entwicklungs-Agenten mit diesem befüllten Prompt.

### 3. Plan & Tool-Freigaben prüfen

- **Planfreigabe:** Der Agent erstellt zuerst einen Implementierungsplan. Lies diesen kurz durch und gib ihn frei.
- **Tool-Aktionen freigeben:** Der Agent führt Schritte wie Branching, Versionierung in `package.json`, Code schreiben, `npm run ...` Tests ausführen und Git-Operationen aus. Du musst diese Aktionen lediglich im Chatfenster bestätigen (Approve).

### 4. PR-Review & Abschluss

- Der Agent erstellt einen Pull Request und führt das PR-Review durch.
- Sobald alle automatischen CI-Checks auf GitHub grün sind, merge den PR (oder lasse ihn vom Agenten mergen) und kontrolliere, ob der Agent das Issue im Backlog auf _Done_ gesetzt und den Abschlussbericht im GitHub-Issue gepostet hat.

---

## 🛡️ 2. Post-Milestone-Loop (Qualitätssicherung am Meilenstein-Ende)

Sobald ein Meilenstein komplett abgeschlossen ist, steuerst du das Review und die Bereinigung:

### 1. Milestone-Review starten

- Kopiere den Inhalt von [Post-Milestone-Review-Prompt-Template.md](./prompts/Post-Milestone-Review-Prompt-Template.md) und passe die Meilenstein-Platzhalter an.
- Starte einen Review-Agenten mit diesem Prompt. Er scannt das gesamte Projekt (Read-Only) und erstellt den Bericht `docs/m{X}_post_review.md`.

### 2. Findings sichten

- Öffne die generierte Review-Datei (z. B. [m2_post_review.md](./m2_post_review.md)) und verschaffe dir einen Überblick über die offenen Baustellen (kategorisiert nach Small, Medium, Large Aufwand).

### 3. Behebung der Findings beauftragen

- Um ein oder mehrere Findings zu beheben, kopiere [Post-Milestone-Fix-Prompt-Template.md](./prompts/Post-Milestone-Fix-Prompt-Template.md) und nenne die entsprechenden Finding-IDs (z. B. `S-01`, `M-02`).
- Starte einen Entwicklungs-Agenten mit diesem Prompt. Er behebt die Fehler und markiert sie im Review-Bericht als `**RESOLVED**`.

### 4. Behebungs-Review starten

- Nutze die Vorlage unter _Fix Findings Review Prompt Template_ (am Ende von [Post-Milestone-Review-Prompt-Template.md](./prompts/Post-Milestone-Review-Prompt-Template.md)), um einen Review-Agenten zu starten, der die Korrekturen auf dem fixing-Branch abschließend prüft.
- Wenn der Reviewer grünes Licht gibt, merge die Korrekturen in `main`.
