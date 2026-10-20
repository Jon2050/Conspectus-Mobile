# AP1: Schreibsicherheit und gemeinsamer Commitpfad

Stand: 20. Oktober 2026. Ausgangspunkt: `f4a0fc92bbd4a9b5b95401670ade06a7a7efa6dc`.
Umsetzung auf `codex/ap1-write-safety`; kein Push oder Deployment.

## Auftrag und Umsetzung

Arbeitspaket 1 aus [dem Projektaudit](2026-10-20-project-audit.md) umfasst D1–D6 und A1.
Die notwendige Sitzungsidentität aus A2 ist enthalten; die weitere Aufteilung von AppShell und UI
bleibt AP2/AP3. Schema, Auth-Scopes und Deploymentkonfiguration wurden nicht geändert.

Der vor der Umsetzung festgelegte Ablauf war:

1. Bestätigte Schreibfehler mit Regressionen und echter sql.js-Datenbank absichern.
2. Erforderliche SQLite-PRAGMAs nach Export wiederherstellen und Fehler dabei geschlossen behandeln.
3. Konto, Drive, Item, Basis-eTag und Runtime-Generation als Schreibkontext zusammenhalten.
4. Beide Eingabearten auf eine gemeinsame Commit-/Retry-/Recoverylogik umstellen.
5. Upload, Refresh, Reset und Kontextwechsel an diesen Kontext anbinden.
6. Relevante lokale Gates ausführen, selbst reviewen und ergänzend agy-review einsetzen.

Die ersten beiden neuen Regressionen schlugen vor der Korrektur erwartungsgemäß fehl:
Fremdschlüssel waren nach Export deaktiviert, und der manuelle Exportfehler verlor die Information
über den bereits erfolgten lokalen Commit. Die weiteren Integrationsfälle sichern die
Kontext-, Retry-, Reconciliation- und Konkurrenzgrenzen der gemeinsamen Implementierung ab.

## Verantwortlichkeiten

- `transferCommitController.ts` besitzt die gemeinsame Persistenzzustandsmaschine und eine
  Fehlerklassifikation für Erstversuch und Retry. Der manuelle Adapter erzeugt einen unveränderlichen
  Einzelbefehl; der Receipt-Adapter liefert seine validierten Befehle und seinen Validierer.
- `transferSaveExportService.ts` schreibt und exportiert beide Varianten über denselben Batchpfad.
  Die frühere Einzel-API entfällt. Ein Exportfehler nach Commit verlangt
  autoritative Wiederherstellung.
- `databaseSession.ts` besitzt Schreibfreigabe und Runtime-Herkunft. Ein laufender Schreibversuch
  schließt Refresh aus; AppShell merkt angeforderte Refreshs bis zur Freigabe vor. Ein gestarteter
  Refresh sperrt neue Transaktionen, bis ein passender Snapshot geöffnet ist.
- `databaseUploadHandoffService.ts` benutzt die unveränderliche Zielbindung und ursprüngliche eTag.
  Nach asynchronen Cache-/Tokenoperationen wird der Kontext erneut geprüft. Cachefehler nach
  Remote-Erfolg und erfolgreiche HTTP-Antworten mit ungültigem Antwortinhalt erlauben nur Recovery.
- `browserDbRuntime.ts` stellt die Fremdschlüsselprüfung nach Export wieder her und prüft sie.
  Scheitert dies, wird die Verbindung geschlossen und ihre Generation ungültig.

Die Mehrtabregel benötigt keinen exklusiven Browserlock: Jede Runtime behält ihre eigene Basis-eTag.
Neuere gemeinsame Cachemetadaten erzeugen vor PUT einen Konflikt; bei gleichzeitigem Serverzugriff
entscheidet `If-Match`. Ein unbekanntes Remote-Ergebnis erlaubt ausschließlich Retry derselben Bytes
gegen dieselbe eTag. Ein nachfolgender Konflikt führt zu Refresh ohne SQL-Replay; die Meldung fordert
zur Prüfung der Buchungen auf, bevor sie erneut eingegeben werden.

## Abschlussnachweise

| Befund | Umsetzung und Nachweis                                                                                                                                                                                                                                                                                                        |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1     | Original-eTag bleibt im Pending-Kontext; Integrationstest verändert den Cache zwischen Erstversuch und Retry und weist nach, dass kein PUT mit neuer eTag erfolgt.                                                                                                                                                            |
| D2     | Konto-/Drive-/Itemidentität bleibt unveränderlich; Datei-, Drive-, Konto-, Sign-out- und Resetfälle sowie Kontextwechsel während Cache-/Tokenwartezeit verhindern einen weiteren PUT.                                                                                                                                         |
| D3     | Wiederholte Schreiben/Exportzyklen mit echter SQLite weisen aktive Fremdschlüssel, atomare Ablehnung ungültiger Konten/Kategorien und leeren `foreign_key_check` nach. Export- und PRAGMA-Fehlerpfade sind separat geprüft.                                                                                                   |
| D4     | Nach manuellem Commit/Exportfehler wird der autoritative Snapshot wieder geöffnet; ein weiterer Submit speichert genau einmal. Scheitert Recovery, bleiben beide Produzenten gesperrt.                                                                                                                                        |
| D5     | Cachefehler nach Remote-Erfolg führen sowohl beim Erstversuch als auch beim Retry ausschließlich zur Reconciliation. Weitere PUTs und SQL-Anwendung sind gesperrt.                                                                                                                                                            |
| D6     | Tests prüfen zwei unabhängige Runtimes mit gemeinsamem Cache, serverseitiges If-Match bei veraltetem Cache, Refresh während Bearbeitung, fehlgeschlagenes Öffnen, Runtime-Generationswechsel und gegenseitigen Ausschluss von Schreiben/Refresh. Ein Browserfall verwendet zwei echte Tabs, sql.js und gemeinsames IndexedDB. |
| A1     | Manueller Transfer und Receipt-Batch benutzen dieselbe Commitzustandsmaschine und denselben Batchservice. Ein gemeinsamer Integrationstest speichert beide Varianten nacheinander und prüft den vollständigen Remote-Snapshot.                                                                                                |

Wesentliche Testdateien:

- `src/features/app-shell/writeSafety.integration.test.ts`
- `src/features/app-shell/transferSaveExportService.test.ts`
- `src/features/app-shell/routes/addTransferSaveController.test.ts`
- `src/features/app-shell/receiptTransferCommitController.test.ts`
- `src/db/browserDbRuntime.test.ts`
- `src/graph/graphClient.test.ts`
- `tests/e2e/write-safety.spec.ts`

Die zwei direkt betroffenen Receipt-Browsertests wurden stabilisiert: Der Mehrtransferfall erhält
eine feste Uhr passend zum Juli-Beleg; der Einzeltransferfall prüft nach Auswahl das dauerhafte
Speicherergebnis, statt gegen das kurzlebige Auswahlfeld und mehrere Zwischenphasen zu laufen.
Weitere Q1-Aufgaben, insbesondere WebKit und physische Geräte, sind damit nicht abgeschlossen.

## Prüfung und Review

Temporäre Protokolle liegen unter dem ignorierten `output/ap1/`.

| Prüfung                                                | Ergebnis                                                                       |
| ------------------------------------------------------ | ------------------------------------------------------------------------------ |
| `npm run format`                                       | Erfolgreich                                                                    |
| ESLint mit `--max-warnings=0 --ignore-pattern output/` | Erfolgreich; vorhandene und neue ignorierte Diagnoseartefakte sind ausgenommen |
| `npm run typecheck`                                    | Erfolgreich, keine Fehler oder Warnungen                                       |
| `npm run check:dead-code`                              | Erfolgreich                                                                    |
| `npm run test`                                         | 662 App-/Integrationstests und 127 Skripttests erfolgreich                     |
| `npm run build`                                        | Erfolgreich, Production-Channel mit synthetischer Test-Client-ID               |
| `npm run check:bundle-size`                            | JavaScript und CSS innerhalb der unveränderten Budgets                         |
| Vollständiges `npm run test:e2e`                       | 165 erfolgreich, 1 regulärer Skip; Chromium und Pixel 5                        |

Der unveränderte Befehl `npm run lint` erfasst auch ignorierte JavaScript-Proben unter `output/`.
Er scheiterte an vorhandenen Auditproben und temporären Playwright-Dateien. Die äquivalente direkte
ESLint-Prüfung mit zusätzlichem Ausschluss dieses Diagnoseverzeichnisses prüft den gesamten
Quell-/Test-/Skriptbestand. Weder diese fremden Dateien noch die ESLint-Konfiguration wurden geändert.

Die frühere Einzel-Speicher-API und ihre unbenutzten Lokalisierungen wurden entfernt, um den
gemeinsamen Pfad auch im ausgelieferten Bundle abzubilden und die Budgets einzuhalten.

Die abschließenden betroffenen Browserfälle (manuelle Journeys, Receipt und echte Zwei-Tab-Prüfung)
bestanden mit 30 Tests. Nach der letzten Vereinfachung bestanden außerdem 82 fokussierte
Unit-/Integrationstests. Der endgültige Build und seine unveränderten Bundlebudgets sind grün.

### Ergänzender agy-CodeReview

- Modus: lokaler, rein lesender CodeReview in einer unabhängigen temporären Git-Kopie ohne Remote.
- Basis und Head: `f4a0fc92bbd4a9b5b95401670ade06a7a7efa6dc` einschließlich der
  uncommitteten AP1-Änderungen und relevanten neuen Dateien. Das ursprüngliche Audit war Kontext;
  private Laufzeitdaten, `.env`, Zugangsdaten und fremde Änderungen waren ausgeschlossen.
- Reviewer: `gemini-3.8-flash-high`, `--mode plan`, `--effort high`; ein vollständiger Durchlauf.
- Review-ID: `a2e41f5b-cbfd-4a50-8ed2-501779fd0387`.
- Befunde: **keine handlungsrelevanten Befunde**, Urteil **APPROVED**.
- Nachprüfung: Alle 328 erfassten Dateihashes und der Git-Status der Kopie blieben unverändert.
  Der Reviewer hat keine Tests oder Builds ausgeführt; seine Bewertung beruht auf statischer
  Quellprüfung und den bereitgestellten Prüfnachweisen.
- Bewertung durch den umsetzenden Agenten: Das Ergebnis stimmt mit dem eigenen Review überein.
  Es gab keine Befunde zu übernehmen, teilweise anzunehmen oder zurückzuweisen und keinen
  Anlass für weitere Codeänderungen oder eine zweite Reviewrunde.

Die Übertragung des Quellcodes an den externen Gemini-Reviewdienst wurde vom Nutzer ausdrücklich
freigegeben. Der Review und alle erforderlichen lokalen Prüfungen sind abgeschlossen.

Das eigene Review betrachtet besonders die verteilte Operation mit lokalem Commit und anschließendem
Remote-Upload. Die nötigen Unterschiede zwischen lokalem Fehler, unbekanntem Remote-Ergebnis,
bestätigtem Remote-Commit und definitivem Konflikt bleiben explizit. Die größte Komplexität liegt
im gemeinsamen Commit-Controller; sie wird jetzt einmal gehalten und von beiden Produzenten benutzt.
Der Umbau führt kein allgemeines Workflow-Framework ein.

Nicht durchgeführt: echte Microsoft-Anmeldung, private OneDrive-Schreibvorgänge, Live-OpenRouter,
physische iOS-/Android-Gerätetests und Deployment. Die synthetischen Tests belegen die hier geänderten
Persistenz- und Konkurrenzgrenzen, keine allgemeine Releasefreigabe oder semantische KI-Qualität.

## Abschließendes Reviewurteil

Keine offenen handlungsrelevanten Befunde für AP1. Die beschriebenen Realservice- und
Geräteprüfungen bleiben Bestandteil späterer Qualifizierung und Freigabe.

APPROVED
