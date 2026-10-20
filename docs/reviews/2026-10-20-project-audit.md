# Projektanalyse und Stabilisierungsplan — Conspectus Mobile

**Stand: 20.10.2026 · Version 0.9.05 · lokaler Branch `main`**

**Untersuchter Commit:** `f4a0fc92bbd4a9b5b95401670ade06a7a7efa6dc`

## 1. Bewertung

Die Anwendung hat eine brauchbare technische Grundlage, ist aber **noch nicht ausreichend stabil für den nächsten Feature-Ausbau**. Vor allem die Schreibpfade müssen vereinheitlicht und abgesichert werden. Mehrere nachgewiesene Fehler können unter bestimmten Fehler- oder Wechselbedingungen alte Daten erneut hochladen, eine andere Datenbank überschreiben oder eine lokal bereits gebuchte Überweisung nochmals buchen. Diese Probleme haben Vorrang vor kosmetischen Verbesserungen.

Die geschilderten Smartphone-Probleme haben teilweise konkrete Ursachen im aktuellen Code:

- Der sichtbare Griff der Transferansicht besitzt **keine Wischfunktion**.
- Das Dialogelement liegt in der geprüften WebKit-Emulation **oben statt unten**.
- Beim ersten Öffnen fokussiert es den unteren Schließen-Button und scrollt das Formular dorthin.
- Der Start zeigt bei verzögerter Anmeldung vorübergehend eine falsche Aufforderung zur Datenbankauswahl.
- Jeder Vordergrundwechsel startet eine erneute Datenbankprüfung. Während einer KI-Analyse kann das Neuladen der Kontooptionen die Analyse abbrechen.

Den gemeldeten **horizontalen Überlauf der Textfelder** konnte ich in der verfügbaren Emulation nicht reproduzieren. Das ist ausdrücklich keine Entkräftung der Beobachtung auf dem echten iPhone. Tastatur, Safari-Browserleisten, Betriebssystemversion, Safe Areas und installierte PWA lassen sich auf Windows nicht vollständig abbilden.

Ein kompletter Neubau oder Frameworkwechsel ist nicht angezeigt. Sinnvoll ist eine begrenzte Stabilisierung mit einem gemeinsamen Schreibablauf, einem klaren Datenbankzustand und einem überarbeiteten Dialog-Lebenszyklus.

## 2. Umfang, Methode und Aussagegrenzen

Untersucht wurden README, Agenten- und Beitragsregeln, aktive Architektur- und Backlog-Dokumentation, Geräte-QA, Modulverträge, Testkonfiguration und zentrale Implementierungen in `auth`, `graph`, `db`, `cache`, `openrouter`, `shared` und `features`. Besonders tief geprüft wurden Start/Synchronisierung, manuelle Transfererstellung, Dialog/Layout sowie Bildaufnahme, Modellaufrufe, Validierung und automatisches Speichern.

Die Untersuchung kombiniert:

1. statische Prüfung der tatsächlichen Kontroll- und Datenflüsse;
2. bestehende Unit-, Integrations-, Skript- und Browserprüfungen;
3. gezielte Fehlerproben mit echten Anwendungsmodulen und injizierten Testabhängigkeiten;
4. SQLite-Prüfungen mit echter sql.js-Laufzeit und einer RAM-Kopie von `tests/fixtures/test.db`;
5. interaktive Prüfung des Produktionsbuilds in WebKit mit iPhone-Emulation;
6. ergänzenden Abgleich ausgewählter Bibliotheksverträge mit Primärquellen.

**Nicht durchgeführt:** physisches iPhone/Android, echte Kamera/HEIC-Aufnahme, echte Anmeldung und OneDrive-Schreibzugriffe, echte KI-Verarbeitung privater Belege, Prüfung des aktuell auf dem Nutzergerät installierten Builds, Live-GitHub-/Deployment-Review oder mobile Leistungsmessung unter realem Mobilfunk.

Für bestätigte KI-Browserreproduktionen wurden Providerantworten abgefangen. Es wurden keine echten API-Schlüssel oder privaten Belege verwendet. Reale Netzverfügbarkeit und konkrete heutige Modellqualität sind damit nicht nachgewiesen.

Anwendungscode, Konfiguration, Lockfile, CI und Backlog wurden nicht geändert. Es entstanden dieser Bericht und lokale Diagnoseartefakte. Es erfolgten kein Commit, Push, Deployment oder GitHub-Schreibzugriff.

**Belegklassen:**

- **Reproduziert:** tatsächlich ausgeführter Browser- oder Modul-/SQLite-Versuch.
- **Statisch belegt:** eindeutiger Codepfad; der vollständige reale End-to-End-Fall wurde nicht ausgeführt.
- **Risiko/Produktentscheidung:** begründete Empfehlung, kein als reproduziert ausgegebener Fehler.
- **Offen:** erfordert ein echtes Gerät oder echte Providerdaten.

**Prioritäten:** P1 vor weiterem Feature-Ausbau beheben; P2 im Stabilisierungszyklus bearbeiten; P3 anschließende Verbesserung. P1 bedeutet hier nicht, dass jeder normale Speichervorgang betroffen ist.

## 3. Priorisierte Übersicht

| ID  | Priorität | Befund                                                                            | Beleg                                 |
| --- | --------- | --------------------------------------------------------------------------------- | ------------------------------------- |
| D1  | P1        | Manueller Retry verbindet alte Bytes mit neuer eTag                               | Modulreproduktion                     |
| D2  | P1        | Manueller Retry kann auf eine andere gebundene Datei zielen                       | Modulreproduktion + AppShell-Code     |
| D3  | P1        | SQLite-Export deaktiviert Fremdschlüsselprüfung                                   | Echte SQLite-Reproduktion             |
| D4  | P1        | Manueller Exportfehler nach Commit erlaubt erneute lokale Buchung                 | Modulreproduktion                     |
| D5  | P1        | Remote-Erfolg mit Cachefehler wird beim manuellen Retry falsch behandelt          | Modulreproduktion                     |
| D6  | P1        | Schreibberechtigung und Snapshot-Version haben keinen gemeinsamen Besitzer        | Statisch belegte Integrationslücke    |
| K1  | P1        | Neuer KI-Prompt widerspricht Geschäftsnamen-Validierung                           | Parserreproduktion                    |
| K2  | P1        | Vordergrundprüfung bricht laufende Beleganalyse ab                                | WebKit-Reproduktion                   |
| U1  | P2        | Dekorativer Griff ohne Wischfunktion                                              | Code                                  |
| U2  | P2        | Dialog sitzt oben, Fokus springt ans Formularende                                 | WebKit-Geometrie + Screenshot         |
| U3  | P2        | Dialogschließen und Animation besitzen widersprüchliche Abläufe                   | Code; Sichtwirkung geräteabhängig     |
| U4  | P2        | Feldüberlauf, Tastatur und Safe Areas müssen auf echtem iOS geklärt werden        | Offener Gerätebefund                  |
| U5  | P2        | KI-Einstieg verdrängt die manuelle Eingabe auf kleinen Bildschirmen               | Layout-/UX-Empfehlung                 |
| U6  | P3        | Unveränderte Datenbankprüfungen erzeugen wiederholt Erfolgstoasts                 | Code                                  |
| U7  | P3        | Scrollabhängiger Footer verändert die verfügbare Inhaltshöhe                      | Code; Vereinfachungsempfehlung        |
| U8  | P3        | Externe Schrift erzeugt zusätzliche Lade- und Layoutabhängigkeit                  | Code                                  |
| S1  | P2        | Kaltstart zeigt falschen leeren Zustand                                           | WebKit mit echter SQLite-Laufzeit     |
| S2  | P2        | Metadaten-/Download-/Katalogabrufe haben keine eigene Zeitgrenze                  | Code                                  |
| S3  | P2        | Cachefehler blockiert sogar „Von OneDrive aktualisieren“                          | Modulreproduktion                     |
| S4  | P2        | Schema-Prüfung akzeptiert unbrauchbare Datenbanken                                | Echte SQLite-Reproduktion             |
| S5  | P2/P3     | Unnötige Runtime-Neuladung, Bytekopien und großes initiales Bundle                | Code/Build; mobile Kosten unvermessen |
| S6  | P2        | Fehlerdarstellung verteilt sich auf technische Texte, Banner, Routen und Toasts   | Code/UX                               |
| Q1  | P2        | Browsergate nicht grün; iOS ist kein regulärer CI-Browser                         | Testläufe + Konfiguration             |
| Q2  | P2        | Dependency-Audit schlägt mit High-Advisories fehl                                 | Aktueller npm-Audit                   |
| Q3  | P2        | Integrations-, Geräte- und semantische KI-Testlücken trotz grüner Einzeltests     | Testanalyse                           |
| K3  | P2        | Automatisches Buchen ohne semantischen Qualitätsnachweis                          | Konzept-/Testlücke                    |
| K4  | P2        | Fehler erfordern Neuaufnahme; Kategorienprobleme werden spät erkannt              | Code + bewusster Produktvertrag       |
| A1  | P2        | Gemeinsamer Schreibvorgang für manuelle Eingabe und KI fehlt                      | Code + bereits sichtbare Fehlerfolgen |
| A2  | P2/P3     | Datenbanksitzung, UI und fachliche Validierung haben überlappende Zuständigkeiten | Code                                  |
| A3  | P2        | Umbau braucht eine verbindliche Reihenfolge mit Regressionen vor Refactoring      | Vorgehensempfehlung                   |

Zusätzlich offen: horizontaler Feldüberlauf, echte iOS-Tastatur-/Safe-Area-Probleme, HEIC und Langbon-Lesbarkeit. Diese Punkte gehören in die Geräteabnahme, bevor die Stabilisierung als abgeschlossen gilt.

## 4. Datenintegrität und Speichern

### D1 — Alte Exportbytes erhalten beim manuellen Retry eine neue eTag

**P1 · reproduziert.**

Der manuelle Controller behält die exportierten Bytes, aber nicht deren ursprüngliche Dateiversion. `retry()` übergibt kein `expectedETag`. Der Upload-Service liest deshalb beim Wiederholen die aktuelle eTag aus dem Cache.

Quellen:

- [`addTransferSaveController.ts`](../../src/features/app-shell/routes/addTransferSaveController.ts), Zeilen 348–383.
- [`transferSaveExportService.ts`](../../src/features/app-shell/transferSaveExportService.ts), `PendingTransferUpload`, Zeilen 46–49.
- [`databaseUploadHandoffService.ts`](../../src/features/app-shell/databaseUploadHandoffService.ts), Zeilen 112–132.

**Ausgeführte Probe:**

1. Exportbytes `[1, 77]` werden gegen `v1` hochgeladen; der Transport schlägt fehl.
2. Der Cache wird auf die neuere autoritative Version `v2` gesetzt, etwa wie nach einer Vordergrundprüfung.
3. `retry()` lädt dieselben alten Bytes gegen `v2` hoch.
4. Der Controller meldet `saved`.

`If-Match` verhindert diesen Fehler nicht: Die vom Client gelieferte Version ist nun aktuell, die Bytes stammen aber aus der alten Grundlage. Änderungen aus `v2` können dadurch verloren gehen.

**Empfehlung:** Jede exportierte Änderung unveränderlich an die ursprüngliche eTag binden. Beim Retry niemals eine neue eTag aus dem Cache übernehmen. Bei Versionswechsel alte Bytes verwerfen und einen expliziten Konfliktablauf benutzen. Der Receipt-Retry besitzt bereits einen solchen Schutz und ist ein geeigneter Ausgangspunkt.

**Abnahme:** Nach einem fehlgeschlagenen Upload und zwischenzeitlicher Remote-/Cacheänderung erfolgt kein PUT mit den alten Bytes und der neuen eTag.

### D2 — Ein manueller Retry kann eine andere Datenbank überschreiben

**P1 · Modulreproduktion; realer OneDrive-Dateiwechsel nicht ausgeführt.**

Der manuelle Pending-Upload besitzt weder Microsoft-Kontoidentität noch Dateiidentität. Der Upload-Service ermittelt seine Zielbindung bei jedem Aufruf neu. Der Binding-Subscriber in `AppShell` invalidiert den Receipt-Controller, aber nicht den manuellen Save-Controller.

Quellen:

- [`AppShell.svelte`](../../src/features/app-shell/AppShell.svelte), Zeilen 409–429.
- [`databaseUploadHandoffService.ts`](../../src/features/app-shell/databaseUploadHandoffService.ts), Zeile 98.
- [`addTransferSaveController.ts`](../../src/features/app-shell/routes/addTransferSaveController.ts), Pending-Zustand und `retry()`.
- [`SettingsRoute.svelte`](../../src/features/app-shell/routes/SettingsRoute.svelte), Datenbankwechsel ab Zeile 385.

**Probe:** Nach einem fehlgeschlagenen Upload nach `qa-file` wurde die Bindung auf `different-file-B` und deren Cache-eTag auf `file-B-v9` geändert. Der Retry sendete die Bytes der ersten Datei an `different-file-B` und meldete Erfolg.

**Empfehlung:** Pending-Operationen tragen einen unveränderlichen Kontext aus Konto, Drive, Item und Basisversion. Bei Wechsel wird die Operation kontrolliert beendet oder explizit an ihren ursprünglichen Kontext gebunden. Ein Retry darf niemals still auf die gerade ausgewählte Datei umgeleitet werden.

Das betrifft auch die Architekturentscheidung für Kontowechsel, Reset und Abmeldung: Ein gültiger OAuth-Token allein ist keine Berechtigung, beliebige noch im Speicher liegende Bytes in die aktuell gebundene Datei zu schreiben.

**Abnahme:** Datei A → Uploadfehler → Auswahl Datei B → Retry: kein Upload der A-Bytes nach B.

### D3 — `export()` setzt `PRAGMA foreign_keys` zurück

**P1 · mit echter sql.js-Laufzeit reproduziert.**

`createBrowserDbRuntime.open()` aktiviert Fremdschlüssel. `exportBytes()` ruft jedoch direkt `database.export()` auf. sql.js schließt und öffnet intern die Datenbank beim Export; verbindungsbezogene PRAGMAs gehen dabei verloren.

Quelle: [`browserDbRuntime.ts`](../../src/db/browserDbRuntime.ts), Zeilen 11–32, 120 und 169–180.

**Gemessen:**

```text
PRAGMA foreign_keys vor Export:  1
PRAGMA foreign_keys nach Export: 0
```

Anschließend akzeptierte der echte `TransferWriteService` einen Transfer mit einem nicht vorhandenen Quellkonto. `PRAGMA foreign_key_check` meldete danach eine verletzte Referenz in `transfer`. Die Probe arbeitete ausschließlich auf einer RAM-Kopie der Testdatei.

Normale UI-Auswahlprüfungen reduzieren die Wahrscheinlichkeit, ersetzen aber die Datenbankgarantie nicht. Besonders veraltete Kategorien/Optionen oder spätere Erweiterungen dürfen keine inkonsistenten Zeilen erzeugen.

**Empfehlung:** Die Runtime muss ihre erforderlichen PRAGMAs nach jedem Export wiederherstellen und prüfen. Auch den Export-Fehlerpfad beachten. Alternativ auf einer separaten Exportinstanz arbeiten, wenn das Speicherprofil dies rechtfertigt.

**Abnahme:** Mehrere Schreiben-Export-Schreiben-Zyklen mit echter SQLite; ungültige Konten und Kategorien müssen auch nach dem ersten Export atomar scheitern.

Der Bibliotheksmechanismus ist außerdem im [sql.js-Projekt dokumentiert](https://github.com/sql-js/sql.js/issues/159); entscheidend ist hier die aktuelle lokale Reproduktion.

### D4 — Manueller Exportfehler hinterlässt eine ungemeldete Buchung

**P1 · reproduziert.**

Im manuellen Pfad wird zunächst lokal committed und danach exportiert. Ein Exportfehler fällt außerhalb der Upload-Fehlerbehandlung. Der Controller behandelt ihn als `local_failed` und ermöglicht einen neuen Submit, obwohl die erste Buchung bereits in der Runtime existiert.

Quellen:

- [`transferSaveExportService.ts`](../../src/features/app-shell/transferSaveExportService.ts), Zeilen 123–144.
- [`addTransferSaveController.ts`](../../src/features/app-shell/routes/addTransferSaveController.ts), Zeilen 325–343.

**Probe:** Erster Submit schreibt einmal und scheitert beim Export. Zweiter Submit schreibt nochmals. Der nächste erfolgreiche Export enthält zwei lokale Schreibvorgänge; eine autoritative Wiederherstellung wurde nicht aufgerufen.

Der Receipt-Pfad hat dafür bereits `TransferBatchExportRecoveryRequiredError` und einen Wiederherstellungsablauf. Die dokumentierte allgemeine Schutzgarantie gilt somit momentan nicht gleichmäßig für beide Eingabearten.

**Empfehlung:** Manuelle Transfers als Batch mit genau einem Element durch denselben Commit-/Exportpfad führen. Nach einem Commit mit fehlgeschlagenem Export alle weiteren Schreiboperationen sperren und den autoritativen Zustand wiederherstellen.

**Abnahme:** Commit → erzwungener Exportfehler → erneuter Benutzer-Speicherversuch: keine ungemeldete erste Buchung in einem späteren Export.

### D5 — Cachefehler nach Remote-Erfolg wird im manuellen Retry wiederholbar

**P1 · reproduziert.**

Der erstmalige manuelle Upload erkennt `remote_commit_cache_failed` und startet Reconciliation. Der Catch-Block von `retry()` unterscheidet dagegen nur Konflikt und sonstigen Fehler. Somit wird ein bereits erfolgreich in OneDrive gespeicherter Transfer erneut als `upload_failed` mit `canRetry: true` angeboten.

Quelle: [`addTransferSaveController.ts`](../../src/features/app-shell/routes/addTransferSaveController.ts), Vergleich Zeilen 200–205 mit 363–385.

**Probe:** Erster Upload scheitert am Transport; Retry wird remote akzeptiert; danach scheitert der Cache. Ergebnis: `upload_failed`, `canRetry=true`, null Wiederherstellungsaufrufe.

Das beweist zunächst einen falschen Zustandsübergang und ein unnötig erlaubtes weiteres PUT. Es beweist nicht, dass jeder folgende Retry automatisch eine doppelte SQL-Buchung erzeugt. Ein weiterer Konflikt- und Neu-Speichern-Ablauf kann aber zu falscher Benutzerentscheidung und Doppelbuchung führen.

**Empfehlung:** Remote-Erfolg ist terminal für das Schreiben. Nur noch Reconciliation erlauben; keine Wiederholung des PUT und keine erneute SQL-Anwendung. Dieselbe Fehlertaxonomie bei Erstversuch und Retry benutzen.

### D6 — Runtime-Version, Schreibfreigabe und Synchronisierung sind nicht geschlossen gekoppelt

**P1 · statisch belegte Integrationslücke.**

Auch unabhängig vom manuellen Retry wird die Basis-eTag beim erstmaligen Upload aus dem Cache bezogen. Die offene Runtime selbst trägt keine verbindliche Herkunftsversion. Zwei Tabs derselben Origin teilen sich IndexedDB, haben aber getrennte SQL-Runtimes. Eine Cacheänderung in Tab A kann deshalb Tab B eine neuere eTag liefern, obwohl B noch mit alten Bytes arbeitet. Ein vollständiger Zwei-Tab-Schreibtest wurde hier nicht durchgeführt.

Zusätzlich:

- `addTransferDatabaseIsReady` verlangt eine früher geöffnete Runtime und einen Zustand ungleich `idle`, nicht zwingend einen aktuell verifizierten Zustand.
- Der manuelle Submit prüft Onlinezustand und geladene Optionen, aber keine aktuelle Snapshot-Version oder Auth-/Binding-Generation.
- Ein Vordergrundrefresh kann bereits laufen, während manuelles Speichern grundsätzlich noch freigegeben ist.
- Scheitert das Öffnen eines neuen Snapshots, erhält `open()` die bisherige Runtime. Der entsprechende Catch in `AppShell` setzt einen Fehler, schließt diese alte Runtime aber nicht ausdrücklich.

Quellen: [`AppShell.svelte`](../../src/features/app-shell/AppShell.svelte), Zeilen 212–225, 289–301 und 350–371; [`AddRoute.svelte`](../../src/features/app-shell/routes/AddRoute.svelte), Zeile 202; [`browserDbRuntime.ts`](../../src/db/browserDbRuntime.ts), Austausch der Runtime erst nach erfolgreichem Öffnen.

**Empfehlung:** Eine Datenbanksitzung besitzt `{accountId, driveId, itemId, baseETag, generation, runtime}`. Jede Schreiboperation erhält genau diese Sitzung. Vor Commit und Upload wird deren Gültigkeit geprüft. Refresh, Reset, Bindingwechsel und Schreiben werden durch denselben Besitzer koordiniert. Für mehrere Tabs zuerst eine klare Regel festlegen: ein schreibender Tab oder explizite tabübergreifende Koordination.

**Abnahme:** Zwei Tabs, Vordergrundrefresh während Formularbearbeitung, fehlgeschlagenes Runtime-Öffnen und Bindingwechsel jeweils mit echten SQLite-Bytes und kontrollierten Graph-Antworten prüfen.

## 5. Smartphone-UI

### U1 — Der Griff ist ausschließlich Dekoration

**P2 · sicherer Codebefund.**

[`BottomSheet.svelte`](../../src/features/app-shell/components/BottomSheet.svelte) rendert in Zeile 97 ein leeres Griff-`div`. Es existieren keine Touch-/Pointer-Handler für Ziehen, keine Weg-/Geschwindigkeitsschwelle und keine Transformation während einer Geste. Schließen erfolgt über Dialog-Cancel, einen Klick außerhalb oder den unteren Formularbutton.

**Empfehlung:** Einen klar abgegrenzten Griff-/Headerbereich zum Herunterziehen implementieren. Scrollen im Formular darf nicht als Schließen interpretiert werden. Die vorhandene Sperre während laufender Buchungen muss auch für die Geste gelten. Zusätzlich eine sichtbare Schließmöglichkeit im Header anbieten, damit zum Abbrechen kein Scrollen ans Formularende nötig ist.

**Abnahme:** Nach unten ziehen am Griff schließt; vertikales Formularscrollen bleibt erhalten; kleine versehentliche Bewegungen schließen nicht; während Upload keine Umgehung der Sperre.

### U2 — Falsche Position und automatischer Sprung ans Formularende

**P2 · in WebKit reproduziert.**

Das Dialog-CSS setzt `bottom: 0`, lässt den vom Browser wirksamen oberen Inset aber stehen. Mit `margin: 0 auto` und begrenzter Höhe wird es im geprüften Browser am oberen Rand positioniert.

| Probe                        | Sichtbarer Viewport | Dialog oben | Dialog unten | Lücke unten |
| ---------------------------- | ------------------- | ----------- | ------------ | ----------- |
| iPhone-Profil, erster Aufruf | 390 × 664 CSS-Pixel | 0           | 597,59       | 66,41       |
| Schmaler Viewport            | 320 × 720 CSS-Pixel | 0           | 648          | 72          |

Berechneter CSS-Zustand: `top: 0px`, `bottom: 0px`. Die Zahlen beziehen sich auf den emulierten Viewport, nicht auf ein physisches iPhone-Display.

Beim ersten Öffnen waren Formularoptionen noch im Laden. `showModal()` fokussierte den aktiven Schließen-Button. Der scrollbare Bereich stand anschließend bei **`scrollTop=470`**, während sein gesamter Inhalt 975 Pixel und seine sichtbare Höhe 505 Pixel betrugen. Datum und Beschreibung lagen außerhalb des anfangs sichtbaren Ausschnitts. Beim erneuten Öffnen mit bereits geladenen Optionen bekam dagegen der Foto-Button den Fokus und der Inhalt begann oben.

**Quelle:** [`BottomSheet.svelte`](../../src/features/app-shell/components/BottomSheet.svelte), Zeilen 72–96 und 111–129; Optionen-/Disabled-Zustände in [`AddRoute.svelte`](../../src/features/app-shell/routes/AddRoute.svelte).

**Empfehlung:**

- Die Insets ausdrücklich definieren, z. B. oben `auto` und unten `0`.
- Den Anfangsfokus bewusst auf einen stabilen Header-/Schließenbereich setzen, der nicht erst nach dem Laden entsteht.
- Einen definierten Anfangsscrollzustand nach Modalöffnung herstellen, ohne spätere Benutzerscrolls zurückzusetzen.
- Header, scrollbaren Inhalt und Aktionen als klare Flexbereiche auslegen; insbesondere `min-height: 0` für den Scrollbereich prüfen.
- Die Aktion zum Schließen unabhängig von Formularlänge erreichbar halten.

Screenshot: [Erster Aufruf der Transferansicht](../../output/playwright/review-2026-10-20/iphone-add-initial.png).

### U3 — Native Dialogzustände und Svelte-Ausblendanimation passen nicht zusammen

**P2 · Codebefund; genaue Flackerwirkung auf iOS offen.**

`requestClose()` schließt das native Dialogelement sofort. Erst das Close-Event setzt den Svelte-Zustand, der wiederum die Ausblendtransition auslöst. Gleichzeitig setzt das CSS für das Dialogelement dauerhaft `display: flex`, ohne einen eigenen Schutz für `:not([open])`. Beim nativen Schließen fallen Top-Layer- und Backdrop-Eigenschaften bereits weg, während Svelte das Element für die Ausblendanimation noch halten kann.

Die direkte Schließen-Schaltfläche, Backdrop, Escape/Cancel und Routenwechsel besitzen zudem unterschiedliche Eintrittspunkte. Das erhöht die Gefahr von sichtbarem Springen und uneinheitlichem Verhalten.

**Empfehlung:** Einen eindeutigen Ablauf `opening → open → closing → closed` festlegen. Entweder die Ausblendung beenden, bevor das native Modal geschlossen wird, oder zunächst auf eine einfache, verlässliche Animation reduzieren. Geschlossene native Dialoge müssen tatsächlich unsichtbar sein. Das Verhalten nicht durch weitere globale `z-index`-Werte reparieren.

Quelle: [`BottomSheet.svelte`](../../src/features/app-shell/components/BottomSheet.svelte), Zeilen 23–80 und 91–92.

### U4 — Feldbreiten, Tastatur und Safe Areas: teilweise noch offen

**Offener Gerätebefund.**

In der geprüften WebKit-Emulation:

- Transferfelder bei 390 Pixel Viewport: 350 Pixel breit, rechter Rand 370.
- Transferfelder bei 320 Pixel Viewport: 280 Pixel breit, rechter Rand 300.
- OpenRouter-Felder bei 320 Pixel Viewport: rund 211 Pixel breit; kein horizontaler Überlauf.
- Auch lange synthetische Modellbezeichnungen erzeugten in dieser Umgebung keinen horizontalen Überlauf.

Die Transfer-Datumsfelder besitzen bereits `min-width: 0` und `max-width: 100%`; die globalen `.app-input`-Regeln haben diese Begrenzungen nicht allgemein. Das ist ein Härtungsansatz, aber noch kein Beweis für die Ursache des konkreten iPhone-Fehlers.

**Gezielte nächste Geräteprüfung:**

1. Build-Version und Buildzeit des installierten iPhone-Builds mit dem untersuchten Stand abgleichen.
2. Safari-Tab und installierte PWA separat prüfen, jeweils Hoch-/Querformat.
3. Datum, Betrag, Textfelder und native Selects mit geöffneter Tastatur testen.
4. Sichtbaren Viewport, Dialogrechteck und horizontalen Überlauf beim Fokuswechsel messen.
5. Kleine Breite sowie größere iOS-Textdarstellung und lange Konto-/Kategorienamen verwenden.

`100dvh` allein bildet nicht alle Tastaturfälle ab. Die [VisualViewport-Dokumentation](https://developer.mozilla.org/en-US/docs/Web/API/VisualViewport) unterscheidet sichtbaren und Layout-Viewport. Eine eventuelle Viewport-Anpassung sollte erst anhand des echten Fehlers ergänzt werden. Die Anwendung nutzt bislang keine `visualViewport`-Logik.

Auch der obere Safe-Area-Abstand verdient Prüfung: Der App-Shell-Padding berücksichtigt oben lediglich normale Abstände, während Safe-Area-Behandlung überwiegend unten stattfindet.

### U5 — Manuellen Einstieg kompakter gestalten

Der ausführliche KI-Block steht vor jeder manuellen Buchung. Auf kleinen Bildschirmen nimmt er viel Höhe ein. Ein kompakter Einstieg „Manuell / Kassenbon“ würde die häufige Eingabe verkürzen, ohne die Verarbeitung fachlich zu ändern.

### U6 — Unveränderte Datenbankprüfungen ohne Erfolgstoast

Unveränderte Datenbankprüfungen erzeugen jedes Mal einen 3,2-Sekunden-Erfolgstoast. Ein stiller Zeitstempel reicht für diesen Normalfall.

### U7 — Stabile Footer-Geometrie

Der Footer wird anhand der Scrollposition ein-/ausgeblendet und verändert damit wieder die verfügbare Inhaltshöhe. Die vorhandene Hysterese reduziert Rückkopplung, macht das Verhalten aber komplex. Ein stabiler Platz oder eine normale Position im Scrollinhalt wäre einfacher.

### U8 — Schrift ohne zusätzliche externe Ladeabhängigkeit

Die Google-Schrift wird extern per CSS-Import geladen. Dadurch entsteht eine zusätzliche Abhängigkeit für Layout und Schriftwechsel. Lokales WOFF2 oder eine Systemschrift würde dieses Verhalten berechenbarer machen.

## 6. Start, Datenbankladen und Fehlerbehandlung

### S1 — Die 160-ms-Ladeanzeige endet unabhängig von der Authentifizierung

**P2 · mit echter SQLite-Runtime reproduziert.**

`AppShell` schaltet den Platzhalter nach 160 ms ab. Die MSAL-Initialisierung und der anschließende Datenbankcheck sind davon unabhängig. Dadurch können Datenrouten vor der tatsächlichen Startentscheidung erscheinen.

Quellen: [`AppShell.svelte`](../../src/features/app-shell/AppShell.svelte), Zeilen 567–599; [`AccountsRoute.svelte`](../../src/features/app-shell/routes/AccountsRoute.svelte), Initial-Load; [`accountsRouteController.ts`](../../src/features/app-shell/routes/accountsRouteController.ts), Behandlung einer noch ungeöffneten Runtime als leer.

**Probe mit synthetisch verzögerter Anmeldung (2.000 ms), Metadaten (1.200 ms) und echter Test-SQLite:**

| Zeitpunkt nach Navigation | Beobachtung                                                                         |
| ------------------------- | ----------------------------------------------------------------------------------- |
| ca. 354 ms                | „Es wurden noch keine passenden Konten gefunden. Bitte verknüpfe … eine Datenbank.“ |
| ca. 2.162 ms              | Datenroute während der Synchronisierung nicht gerendert                             |
| ca. 3.565 ms              | Die vorhandenen Testkonten werden korrekt angezeigt                                 |

Diese Zeiten sind **keine Messung realer Microsoft-Latenz**. Sie belegen die falsche Zustandsfolge unter kontrollierter Verzögerung.

**Empfehlung:** Das Ende des Startzustands an ein fachliches Ergebnis binden. „Noch nicht initialisiert“, „nicht angemeldet“, „keine Datei gebunden“, „prüft“, „bereit“ und „fehlgeschlagen“ dürfen nicht durch denselben leeren Kontenzustand dargestellt werden.

### S2 — Begrenzte Wiederholungszahl bedeutet noch keine begrenzte Wartezeit

**P2 · statisch belegt.**

Der Startup-Service wiederholt vorübergehende Fehler maximal dreimal mit 250/500 ms Wartezeit. Die einzelnen Graph-Fetches und der Downloadstream besitzen jedoch weder einen eigenen Timeout noch ein durchgereichtes Abbruchsignal. Solange ein Request nicht endet, hilft die begrenzte Wiederholungszahl nicht.

Beim OpenRouter-Katalog fehlt ebenfalls eine eigene Zeitgrenze. Nur die Chat-Completions sind jeweils auf 60 Sekunden begrenzt. Zwei Chat-Aufrufe plus zwei potenziell lange Kataloganfragen ergeben deshalb keine verlässlich begrenzte Gesamtdauer.

Quellen: [`graphClient.ts`](../../src/graph/graphClient.ts), `executeRequest()` und `downloadFile()`; [`startupFreshnessService.ts`](../../src/features/app-shell/startupFreshnessService.ts), Retry-Logik; [`modelCatalogClient.ts`](../../src/openrouter/modelCatalogClient.ts), `load()`.

**Empfehlung:**

- Abbruchsignal vom Workflow bis zu Fetch und Streamreader führen.
- Separate Grenzen für Metadaten, Download und Modellkatalog definieren.
- Bei neuem Kontext laufende alte Anfragen tatsächlich abbrechen, nicht nur ihr Ergebnis ignorieren.
- Bei 429 `Retry-After` berücksichtigen; aktuell geht 429 als allgemeiner Netzwerkfehler in die kurze Retryfolge.
- Dem Benutzer eine eindeutige aktuelle Phase und eine passende Wiederholungsaktion zeigen.

Ein konkreter Zeitwert sollte mit realen Datenbanken und Mobilfunkmessungen abgestimmt werden. Nicht pauschal jede langsame größere Datei nach derselben kurzen Frist abbrechen.

### S3 — Cachefehler verhindert selbst erzwungenen Download

**P2 · reproduziert.**

`startupFreshnessService.resolve()` liest den Cache auch im Modus `force_download`, bevor es den Downloadpfad betritt. Wirft IndexedDB einen Fehler, landet der Ablauf unter `online_metadata_failed` — obwohl der Metadatenabruf erfolgreich war.

**Probe:** Erfolgreiche Metadatenantwort, absichtlich fehlschlagendes `readSnapshot`, Modus `force_download`: Ergebnis `metadata_fetch_failed`, **null Downloadaufrufe**.

Quelle: [`startupFreshnessService.ts`](../../src/features/app-shell/startupFreshnessService.ts), ab Zeile 327.

Auch ein frischer Download wird erst nach erfolgreicher Cachepersistenz als bereit zurückgegeben. Damit wird der Cache faktisch zu einer zwingenden Betriebsbedingung und nicht nur zur Beschleunigung.

**Empfehlung:** Cache-Lese-, Cache-Schreib-, Netzwerk- und Datenbankfehler separat behandeln. Einen defekten einzelnen Cacheeintrag gezielt verwerfen und frisch laden. Bei komplett nicht verfügbarem Cache eine klare Recovery anbieten; optional eine ausdrücklich nur lesende Online-Sitzung aus frisch validierten Bytes erwägen. Schreibfreigabe und eTag-Sicherheit dabei nicht abschwächen.

Der aktuelle große Reset löscht auch Bindungen und KI-Einstellungen. Er ist für einen einzelnen defekten Snapshot zu grob.

### S4 — „Schema-kompatibel“ wird zu schwach geprüft

**P2 · mit echter SQLite reproduziert.**

Die Snapshotvalidierung prüft Integrität und die Existenz der Tabellen `account`, `category` und `transfer`. Sie prüft nicht, ob deren benötigte Spalten tatsächlich existieren.

**Probe:** Eine neue SQLite mit ausschließlich `account(x)`, `category(x)` und `transfer(x)` wurde erfolgreich validiert. Erst eine spätere echte Abfrage würde scheitern.

Quelle: [`cachedDatabaseSnapshotService.ts`](../../src/features/app-shell/cachedDatabaseSnapshotService.ts), Zeilen 46–80.

**Empfehlung:** Benötigte Tabellen, Spalten und zentrale Referenzdaten direkt beim Import prüfen, beispielsweise über `PRAGMA table_info` und vorbereitete fachliche Minimalabfragen. Kein Schema migrieren. Ein vorhandener Desktop-Snapshot bleibt der Kompatibilitätsvertrag. Fremdschlüsselverletzungen separat prüfen; `integrity_check` ersetzt `foreign_key_check` nicht.

**Abnahme:** Falsche SQLite, unvollständiges Schema, beschädigte Datei, fehlende Primärkonten und ungültige Referenzen ergeben früh eine passende verständliche Fehlermeldung.

### S5 — Der gesunde Ladepfad macht mehr Arbeit als notwendig

**P2/P3 · aus Code nachvollziehbar, mobile Kosten nicht vermessen.**

Aktueller Ablauf:

```text
MSAL initialisieren / Redirect verarbeiten
  → Konto und Dateibindung ermitteln
  → Graph-Metadaten abfragen
  → vollständigen Cache-Snapshot lesen
    → bei passender eTag: sql.js-Runtime erneut öffnen
    → sonst: Download-URL separat abfragen
             → gesamte Datei laden
             → temporäre SQLite öffnen und integrity_check ausführen
             → Cache schreiben
             → aktive SQLite nochmals öffnen
  → Route/Optionen nachladen
  → Erfolgstoast anzeigen
```

Bei Rückkehr in den Vordergrund erfolgt dieselbe Prüfung erneut, auch ohne Dateiänderung. Der Cache spart dann den Dateidownload, aber nicht das Auslesen/Kopieren der Bytes und Wiederöffnen der Runtime.

Weitere Kosten:

- SQLite-Abfragen, Integritätscheck und Export laufen synchron auf dem UI-Thread.
- Downloadchunks, zusammengesetzte Bytes, Cachekopien, Runtime und Exportkopien können gleichzeitig Speicher beanspruchen.
- Das initiale JS-Hauptbundle enthält rund **687 KiB minifiziert / 204 KiB gzip**.
- Die WASM-Datei ist zusätzlich **659.730 Bytes** groß.
- Die derzeitigen JS-/CSS-Budgets werden eingehalten, haben aber nur geringe Reserve.

**Empfohlene Reihenfolge:**

1. Messpunkte für Auth, Metadaten, Cache, Download, WASM, Open/Validate und erste sichtbare Daten ergänzen.
2. Beim unveränderten bereits geöffneten Snapshot die bestehende Runtime behalten.
3. Gleichzeitige Refresh-Anfragen zusammenführen und aktive Workflows berücksichtigen.
4. Cachemetadaten getrennt von den großen Bytes lesen können.
5. Metadaten und Download-URL möglichst aus einer konsistenten Graph-Antwort beziehen; bei Änderungen während des Downloads Versionskonsistenz prüfen.
6. KI-/Settings-Oberflächen nach Bedarf laden.
7. Erst bei gemessenen UI-Blockaden die Datenbankarbeit in einen Worker verschieben.

Eine Offline-Datenansicht ist dafür nicht notwendig und würde den derzeitigen Produktvertrag verändern.

### S6 — Fehlerdarstellung vereinfachen

Momentan mischen sich technische englische Meldungen, übersetzte Statusmeldungen, globale Banner, Routenzustände, Toasts und Formularfehler. Beispielsweise werden mehrere Startup-Fehler direkt über `decision.failure.message` angezeigt.

Empfehlung: pro fehlgeschlagenem Vorgang eine primäre Meldung mit genau einer sinnvollen nächsten Aktion. Technische Details dürfen lokal zusätzlich verfügbar sein. Sinnvolle Klassen sind Anmeldung, Verbindung/Timeout, Datei fehlt, Cache nicht verfügbar, Datei ungeeignet, Schreibkonflikt und bereits remote gespeichert.

## 7. KI-gestützte Transfererstellung

### Was bereits gut gelöst ist

- Bild und Extraktion werden flüchtig gehalten; Canvas-Reencoding entfernt ursprüngliche Bildmetadaten.
- Kontodaten, Salden und vollständige Datenbank werden nicht als Modellkontext gesendet.
- Beide Modellrollen sind separat konfigurierbar und werden vor Benutzung über den Katalog geprüft.
- Stufe 2 verwendet Structured Output und verlangt Providerparameter-Unterstützung.
- Lokale Prüfungen verlangen exakte Centbeträge, vollständige einmalige Positionszuordnung und konsistente Summen.
- Die Batchbuchung ist eine gemeinsame SQLite-Transaktion.
- Der neue Receipt-Commitpfad unterscheidet mehr Fehlerzustände als der ältere manuelle Pfad, insbesondere Exportfehler und Remote-Erfolg/Cachefehler.

Diese Absicherungen sollten erhalten bleiben. Structured Output schützt die Form, nicht die sachliche Richtigkeit der Zuordnung; auch die [OpenRouter-Dokumentation](https://openrouter.ai/docs/guides/features/structured-outputs) beschreibt Schemaeinhaltung als den Kern dieser Funktion.

### K1 — Der zuletzt veränderte Prompt macht korrekte Modellantworten ungültig

**P1 · reproduziert.**

Der Ableitungsprompt fordert:

```text
"REWE Maik Seiler" → "Rewe"
"Bauhaus GmbH" → "Bauhaus"
```

Der Parser fordert zugleich `buyplace === extraction.storeName`.

Quellen:

- [`transferDerivationPrompt.ts`](../../src/features/receipt/prompts/transferDerivationPrompt.ts), Zeilen 18–20.
- [`receiptAnalysisContracts.ts`](../../src/features/receipt/receiptAnalysisContracts.ts), Zeilen 600–606.

**Probe:** Gültige Extraktion mit `storeName="REWE Maik Seiler"`, ansonsten korrekte Ableitung mit `buyplace="Rewe"`: Ablehnung mit `INVALID_STRING`.

Schon eine vom Prompt gewünschte Änderung der Groß-/Kleinschreibung kann die exakte Gleichheit verletzen.

**Empfehlung:** Einen eindeutigen Vertrag wählen. Der kleinste sichere Fix ist, den unveränderten extrahierten Geschäftsnamen zu übernehmen. Soll die Normalisierung fachlich erhalten bleiben, Rohname und normalisierter Anzeigename getrennt modellieren und die Zulässigkeit ausdrücklich definieren. Eine bloße Abschwächung auf „beliebiger nichtleerer Name“ wäre zu ungenau.

**Abnahme:** Die Beispiele aus dem tatsächlich ausgelieferten Prompt müssen durch den tatsächlich ausgelieferten Validator laufen. Reine Tests auf das Vorhandensein bestimmter Promptwörter genügen nicht.

### K2 — Eine harmlose Vordergrundprüfung beendet die Analyse

**P1 · WebKit-Reproduktion mit gemockten Providerantworten.**

Ablauf:

1. Beleganalyse läuft, Stufe „Foto auslesen“ ist aktiv.
2. Ein `visibilitychange` mit sichtbarem Dokument startet `performSync()`.
3. Nach erfolgreichem Refresh lädt `AddRoute` die Kontooptionen neu.
4. Der Optionscontroller publiziert zuerst `operation: loading`.
5. `receiptPreparationController.refreshOptions()` interpretiert jeden Nicht-`ready`-Zustand als endgültigen Fehler.
6. Die gesamte Analyse wird verworfen.

**Beobachtete Meldung:** „Konten und Kategorien sind nicht mehr aktuell verfügbar. Starte mit einem neuen Foto.“

Die Probe zeigte zwei Metadatenabfragen, zwei Runtime-Öffnungen und null Uploads. Die Datenbank war beim zweiten Check unverändert. Das Browserereignis wurde synthetisch ausgelöst; die konkrete Reihenfolge nativer iOS-Kameraereignisse bleibt auf Hardware zu prüfen. Ein Appwechsel oder eine Displayunterbrechung während der Analyse reicht als realistischer Anlass.

Quellen: [`AppShell.svelte`](../../src/features/app-shell/AppShell.svelte), Zeilen 463–473; [`AddRoute.svelte`](../../src/features/app-shell/routes/AddRoute.svelte), Zeilen 377–380 und 442–452; [`receiptTransferPreparationController.ts`](../../src/features/receipt/receiptTransferPreparationController.ts), Zeilen 255–261.

**Empfehlung:** Vorübergehendes Neuladen nicht mit ungültigem Kontext gleichsetzen. Unveränderte Datenbankversion nicht neu öffnen. Einen notwendigen Refresh mit aktiver Aufnahme/Analyse koordinieren und vor dem Commit ausdrücklich revalidieren. Echte Konto-/Dateiwechsel müssen weiterhin abbrechen.

Screenshot: [Analyseabbruch nach Vordergrundprüfung](../../output/playwright/review-2026-10-20/receipt-resume-error.png).

### K3 — Automatische Speicherung hat noch keinen semantischen Qualitätsnachweis

**P2 · Produkt-/Validierungslücke, keine Abweichung vom bewusst gewählten Auto-Save-Konzept.**

Die aktuelle Entscheidung lautet automatische Speicherung ohne Review-/Editieransicht. Der Code folgt dieser Entscheidung. Die vorhandenen Prüfungen beweisen aber nicht:

- dass OCR den richtigen Betrag und das richtige Datum aus dem Foto gelesen hat;
- dass eine plausibel wirkende, rechnerisch konsistente Extraktion tatsächlich dem Beleg entspricht;
- dass Süßigkeiten, Getränke, Restaurant und Haushaltswaren richtig klassifiziert wurden;
- dass derselbe Beleg nicht bereits in einem früheren Lauf gebucht wurde.

Der aktuelle Prompt erlaubt bei uneindeutigen Artikeln ausdrücklich eine plausible Zuordnung. Ein rechnerisch korrektes Ergebnis kann deshalb fachlich falsch sein und wird dann automatisch gespeichert.

**Empfehlung:** Vor produktiver Freigabe einen kleinen, repräsentativen und anonymisierten Goldstandard-Korpus erstellen. Originalfoto, erwartete Extraktion, erwartete Gruppen und erwartete Centbeträge müssen getrennt prüfbar sein. Erfolgsquote, sachliche Fehlbuchungen, sichere Ablehnungen und Latenzen pro Modellpaar erfassen.

Eine optionale Bestätigung oder Vorschau wäre eine **neue Produktentscheidung**, nicht Teil eines stillschweigenden Bugfixes. Wenn Auto-Save beibehalten wird, sind mindestens eine gut sichtbare Ergebniszusammenfassung und ein praktikabler Korrekturweg wichtig. Die Mobile-App hat derzeit keine vollständige Buchungsbearbeitung; ein falscher KI-Transfer kann nicht einfach im selben Ablauf korrigiert werden.

**Doppelte Belege:** Die Einmal-Claims schützen einen einzelnen Lauf, nicht erneutes Fotografieren desselben Bons. Eine lokale Duplikatwarnung über Datum, Händler, Gesamtbetrag und passende bestehende Transfers ist denkbar, benötigt aber eine Regel für legitime gleiche Einkäufe und den Verzicht auf Schemaänderungen.

**Unklarer Uploadausgang:** Wird ein Upload remote angenommen, die Antwort geht aber verloren, ist das Ergebnis zunächst unbekannt. Der Receipt-Retry behält zwar seine alte eTag; bei anschließendem Konflikt endet der Byte-Retry jedoch mit einem neuen Aufnahmebedarf. Ein erneutes Fotografieren kann dann denselben Beleg nochmals buchen. Vor einer erneuten Buchung braucht es einen Reconciliation-Schritt beziehungsweise eine klare Anzeige „Ergebnis unbekannt — Daten prüfen“. Identische Remote-Bytes können ein Nachweis sein; bei zwischenzeitlichen Fremdänderungen darf keine Sicherheit erfunden werden.

### K4 — Konzeptionelle Grenzen und unnötig teure Fehlerwege

**P2 · teilweise bewusster aktueller Vertrag.**

**Kategorien:** Das Modell erhält keine lokale Kategorienliste. Kategorienamen aus Regeln müssen später exakt und eindeutig in der DB vorhanden sein. Die Standardregeln setzen konkrete Namen voraus, etwa `Haushalt, Verbrauchsgüter, Reinigung`. Andere Datenbanken können deshalb erst nach beiden Modellaufrufen scheitern.

Ansatz: Lokal früh die Kontentopologie prüfen und erforderliche Einrichtung erklären. Ein Mapping von Regelgruppen auf echte Kategorie-IDs wäre belastbarer, verändert jedoch den bisherigen Vertrag „Regeln bleiben opaker Prompttext“. Diese Änderung zuerst fachlich entscheiden.

**Nicht abgedeckte Waren:** Die Standardregeln definieren Lebensmittel, Süßwaren, Haushaltswaren und Gastronomie, aber keine allgemeine Restgruppe etwa für Kleidung, Elektronik oder Apotheke. Ohne Regel kann die geforderte plausible Zuordnung sachlich falsche Ergebnisse fördern. Eine ausdrücklich definierte Ablehnung oder Restgruppe ist besser als eine implizite Vermutung.

**Rabatte/Pfand:** Negative Einzelpositionen sind zulässig, jeder resultierende Transfer muss positiv sein. Reine Rückgaben, ein negativer Gruppenbetrag oder ein Beleg mit Gesamtsumme null werden abgelehnt. Das ist ein klar zu dokumentierender Funktionsumfang. Der Konflikt zwischen „Pfand zur fachlich passenden Gruppe“ und „Pfand zu normalen Lebensmitteln“ sollte mit konkreten Beispielen aufgelöst werden.

**Fehler-Neuaufnahme:** Der vollständige Abbruch bei Fehlern ist ein bewusst festgelegter Datenschutz-/Lebenszyklusvertrag. Er verursacht aber viel Reibung bei kurzzeitigen Providerfehlern oder fehlender Kategorie nach bereits erfolgreicher OCR. Eine spätere Verbesserung könnte eine eng begrenzte Wiederholung aus ausschließlich flüchtigen, bereits validierten Daten erlauben; dies wäre eine Vertragsänderung und darf nicht versehentlich durch Persistieren privater Bilddaten gelöst werden.

**Kostenlose Modelle:** Freie Modelle sind kein Verfügbarkeitsversprechen. OpenRouter dokumentiert eigene [Request- und Kapazitätsgrenzen](https://openrouter.ai/docs/api_reference/limits). Zwei Modellaufrufe pro Beleg und Neuversuche benötigen ein verständliches Rate-Limit-Verhalten. Keine starren Quotenwerte in die App übernehmen.

**Bilder:** Das 20-MiB-Eingabelimit und 4-MiB-Ausgabelimit begrenzen nicht den Speicher eines vollständig decodierten hochauflösenden Fotos. Ein 48-Megapixel-Raster kann allein ungefähr 192 MB bei vier Bytes pro Pixel benötigen. Die längste Kante von 2560 Pixeln kann außerdem lange, schmale Bons stark verkleinern. Realistische iPhone-Fotos, gedrehte Aufnahmen, HEIC, Reflexionen und lange Bons fehlen als nachgewiesene Akzeptanzbasis.

## 8. Architektur: gezielt vereinfachen

### Tragfähige Teile beibehalten

Die Modulrichtung ist sinnvoll. Parameterisierte SQL-Anweisungen, Transaktionen, klare Graph-/OpenRouter-Grenzen, accountbezogene Konfiguration und lokale Validierung sind gute Grundlagen. Ein Backend ist zur Behebung der hier gefundenen Fehler nicht erforderlich. Ebenso wenig sind neue Datenbankschemata oder eine vollständige Umstellung auf eine andere UI-Technik notwendig.

### A1 — Gemeinsamer Schreibvorgang für manuelle Eingabe und KI

Die beiden Controller behandeln fast dieselbe verteilte Operation, aber unterschiedlich vollständig:

- manueller Save-Controller: etwa 441 Zeilen;
- Receipt-Commit-Controller: etwa 551 Zeilen;
- darüber zusätzliche Zustände und Recoveryentscheidungen in AppShell und Formular.

Die Unterschiede D1, D4 und D5 sind konkrete Folgen dieser Duplikation.

**Ziel:** Ein gemeinsamer Commit-Controller nimmt einen oder mehrere validierte Transferbefehle entgegen. Er besitzt Kontext, Basisversion, SQL-Commit, Export, Upload, Retry und Reconciliation. Manueller Entwurf und KI-Ableitung bleiben getrennte Produzenten.

Kein allgemeines Workflow-Framework bauen. Die vorhandene Batchlogik auf eine kleine gemeinsame fachliche Operation reduzieren.

### A2 — Eine Datenbanksitzung statt vieler teilweise überlappender Flags

`AppShell` hat etwa 942 Zeilen, `AddRoute` etwa 1392 und `SettingsRoute` etwa 918. Entscheidend ist nicht die Zeilenzahl allein, sondern dass Lebenszyklus, Statusableitung, Benutzerinteraktion, Netzwerk-/Persistenzorchestrierung und Sichtbarkeit eng verzahnt sind.

Empfohlenes Zielbild:

```text
AppShell
  ├─ Navigation und globale Meldungen
  ├─ DatabaseSessionController
  │    ├─ Auth-/Binding-Identität
  │    ├─ Snapshot-Version und Runtime
  │    ├─ Refresh und Wiederherstellung
  │    └─ eindeutige Lese-/Schreibfreigabe
  └─ TransferCommitController
       ├─ manueller Befehl
       └─ KI-Batch

AddRoute
  ├─ ManualTransferForm
  ├─ ReceiptCapturePanel
  └─ gemeinsamer Commit-Status
```

Die fachlichen Validierer sollten mittelfristig aus `app-shell/routes/` in einen kleinen gemeinsamen Transferbereich wandern. Der Receipt-Command-Builder importiert heute Formular-/Routenregeln. Die Regeln sind richtig wiederverwendet, liegen aber beim falschen Besitzer.

### A3 — Erst Fehler absichern, dann Struktur ändern

Empfohlene Reihenfolge:

1. Für die bestätigten Datenfehler gezielte Integrationsfälle festhalten.
2. Kleinste Sicherheitskorrekturen durchführen.
3. Gemeinsamen Commitpfad extrahieren und beide Produzenten anschließen.
4. Datenbanksitzung und Lifecyclekoordination vereinfachen.
5. UI in kleinere Komponenten teilen, sobald die Verantwortlichkeiten feststehen.

So vermeidet man einen großen Umbau ohne klare Akzeptanzkriterien.

## 9. Tests, Build und Abhängigkeiten

### Tatsächlich ausgeführte Prüfungen

| Prüfung                             | Ergebnis                                                                          |
| ----------------------------------- | --------------------------------------------------------------------------------- |
| `npm run format`                    | Erfolgreich auf dem ursprünglichen Projektstand                                   |
| `npm run lint`                      | Erfolgreich                                                                       |
| `npm run typecheck`                 | Erfolgreich; Svelte: 0 Fehler, 0 Warnungen                                        |
| `npm run check:dead-code`           | Erfolgreich                                                                       |
| `npm run test`                      | 83 App-Testdateien / 643 Tests plus 15 Skript-Testdateien / 127 Tests erfolgreich |
| Produktionsbuild über E2E-Webserver | Erfolgreich; Warnung über großes JS-Hauptbundle                                   |
| `npm run check:bundle-size`         | Erfolgreich, geringe verbleibende Reserve                                         |
| E2E mit iPhone-WebKit zusätzlich    | 246 Fälle: 239 bestanden, 5 fehlgeschlagen, 2 absichtlich übersprungen            |
| Gezielte E2E-Wiederholung, 1 Worker | 9 Fälle: 5 bestanden, 4 fehlgeschlagen                                            |
| `npm run audit:dependencies`        | Fehlgeschlagen: 26 Abhängigkeitseinträge, davon 18 high und 8 moderate            |
| `npm audit --omit=dev --json`       | 3 Einträge: 1 high, 2 moderate                                                    |
| Diagnoseproben                      | D1–D5, K1, S3/S4 sowie echte FK-Verletzung nach Export reproduziert               |
| WebKit-Interaktionen                | Dialoggeometrie, Fokus, Breiten, Startfolge und K2 geprüft                        |

Der erste Vitest-Versuch innerhalb der Windows-Sandbox scheiterte bereits bei Cache-Renames mit `EPERM`; es wurden dort keine Tests ausgeführt. Der anschließende Lauf außerhalb dieser Einschränkung war vollständig grün. Das ist eine Umgebungsgrenze, kein Appfehler.

Beim ersten E2E-Aufruf wurde `--workers=2` von PowerShell/npm nicht an Playwright weitergereicht; tatsächlich liefen **12 Worker**. Für die Fehlerabgrenzung wurde anschließend direkt die lokale Playwright-CLI mit **einem Worker** verwendet. Die Ergebnisse werden deshalb nicht als Zwei-Worker-Messung ausgegeben.

### Q1 — Bedeutung der Browserfehler

**Drei reproduzierbare Fehler gehören zu einem datumsabhängigen Test:**

`receipt-capture.spec.ts:302` erstellt Belege für Juli 2026. Nach dem Speichern wird nur dann genau einen Monat zurückgeschaltet, wenn die Anzeige „August 2026“ enthält. Im Oktober bleibt die Ansicht im Oktober und findet die erwarteten Julibuchungen nicht. Das scheitert in Chromium, Pixel 5 und iPhone-WebKit.

Die Probe belegt einen veralteten Test, nicht fehlende gespeicherte Transfers. Empfehlung: Testuhr kontrollieren oder den Zielmonat unabhängig vom heutigen Datum einstellen.

**Ein Chromium-Fehler war beim isolierten Lauf nicht reproduzierbar:**

Der Test zum einzelnen KI-Transfer prüft einen kurzlebigen Konto-Select, während die Verarbeitung bereits zur nächsten Stufe wechseln kann. Im ersten Lauf war das Element zum Prüfzeitpunkt verschwunden; im Einzelworker-Lauf bestand der Fall. Die feste 250-ms-Verzögerung des Provider-Mocks bietet keine stabile Synchronisationsgarantie. Explizit steuerbare Antworten und dauerhafte Ergebnisassertionen sind geeigneter.

**Ein WebKit-Fehler bleibt offen:**

Der Service-Worker-/Offline-Reload-Test scheiterte auch isoliert mit `WebKit encountered an internal error`. Daraus lässt sich kein sicherer Safari-Produktbug ableiten. Die reguläre Suite verwendete den lokal installierten Projektbrowser WebKit-Build 2248; die zusätzliche interaktive CLI-Prüfung nutzte WebKit 26.6 / Build 2368. Dieser Versionsunterschied ist bei der Nachprüfung zu beachten.

**CI-Lücke:** Das optionale iPhone-Projekt wird nur über `PLAYWRIGHT_INCLUDE_IOS_WEBKIT=1` aktiviert. Die reguläre Quality-Matrix enthält Chromium und Pixel 5, auf Main nur Chromium-Smoke. Für eine primär iOS-relevante Anwendung sollte zumindest ein fokussierter WebKit-Gate dazugehören.

Quellen: [`playwright.config.ts`](../../playwright.config.ts), [Quality-Workflow](../../.github/workflows/quality.yml), [`receipt-capture.spec.ts`](../../tests/e2e/receipt-capture.spec.ts), Zeilen 348–355.

### Q2 — Audit ist trotz zuletzt aktualisierter Abhängigkeiten nicht mehr grün

Der aktuelle Audit meldet 26 Einträge, darunter 18 High-Einträge. Mehrere sind transitive Ketten aus Entwicklungs-/Buildwerkzeugen, beispielsweise Lighthouse/Puppeteer. Diese Anzahl ist **nicht** die Anzahl unabhängig ausnutzbarer Schwachstellen in der ausgelieferten PWA.

Der reduzierte Produktionsabhängigkeitsgraph enthält `devalue`, `esbuild` und `svelte-i18n`. `devalue@5.8.1` kommt über Svelte; die Einordnung als Produktionsabhängigkeit beweist ebenfalls noch nicht, dass der konkret betroffene Pfad im Browserbundle erreichbar ist.

**Empfehlung:** Updates und tatsächliche Erreichbarkeit getrennt prüfen, Lockfile gezielt aktualisieren und Gates erneut ausführen. Kein blindes `npm audit fix --force`: npm schlägt für einzelne Ketten sogar Breaking Changes/Downgrades vor. Der Exception-Ledger enthält derzeit keine aktive Ausnahme.

### Q3 — Wichtige Lücken trotz 770 grüner Tests

- Die meisten KI-Browserfälle verwenden ein winziges synthetisches Bild und fertige JSON-Antworten. Sie prüfen den Workflow, nicht OCR-/Klassifikationsqualität.
- Native Kamera, Tastatur, HEIC und installierte iOS-PWA werden dadurch nicht geprüft.
- Der bestehende Bottom-Sheet-Test schützt nicht die erwartete Wischgeste oder die tatsächliche Verankerung unten.
- Viele Save-Controller-Tests mocken bereits den Save-Service. Dadurch bleibt das Zusammenspiel von SQL-Commit, Export, eTag und Cache ungetestet.
- Tests sollten die hier nachgewiesenen Schnittstellenfehler mit echten SQLite-Bytes abdecken, statt nur weitere isolierte Zustandsassertionen hinzuzufügen.

## 10. Empfohlener Stabilisierungsplan

Alle Befunde aus den Abschnitten 3–9 gehören zum Plan. **Q1–Q3 sind ausdrückliche Qualitätsaufgaben; A1–A3 sind ausdrückliche Architektur- beziehungsweise Vorgehensaufgaben.** Sie gelten nicht schon deshalb als erledigt, weil ein verwandter Bug behoben wurde. Die bisher unnummerierten UX-, Fehlerdarstellungs- und Testempfehlungen tragen jetzt eigene Kennungen.

Die fünf Pakete beschreiben zusammengehörige Änderungen, keine starre zeitliche Abfolge: AP5 beginnt mit Test- und Dependency-Bereinigung vor beziehungsweise begleitend zu den Umbauten und endet mit der Freigabe. Die P1-Korrekturen K1/K2 müssen ebenfalls nicht auf den späteren Beleg-Qualitätsnachweis warten. A3 gilt für jedes Paket: Reproduktion/Regression festhalten, kleinste Korrektur vornehmen, anschließend gezielt vereinfachen und erneut prüfen.

### Vollständige Zuordnung der Befunde

„Federführend“ bestimmt das Paket, das den Punkt abschließt. Unterstützende Pakete liefern Teile der Umsetzung oder den abschließenden Nachweis; dadurch entsteht keine unklare Doppelzuständigkeit.

| Befund | Federführend | Unterstützung | Verbindliches Ergebnis / Abschlussnachweis                                                                                   |
| ------ | ------------ | ------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| D1     | AP1          | AP5           | Retry bleibt an die ursprüngliche eTag gebunden; neuere Remoteänderungen bleiben erhalten.                                   |
| D2     | AP1          | AP3/AP5       | Konto-/Dateiwechsel kann alte Pending-Bytes nicht auf ein anderes Ziel umlenken.                                             |
| D3     | AP1          | AP5           | Fremdschlüsselprüfung bleibt über mehrere reale SQLite-Exportzyklen aktiv.                                                   |
| D4     | AP1          | AP5           | Exportfehler nach Commit lässt keine spätere ungemeldete oder doppelte Buchung zu.                                           |
| D5     | AP1          | AP5           | Nach Remote-Erfolg sind Erstversuch und Retry ausschließlich in Reconciliation, ohne neues PUT.                              |
| D6     | AP1          | AP3/AP5       | Schreibfreigabe ist an Runtime-Version, Identität und Generation gebunden; Konkurrenzfälle sind geprüft.                     |
| U1     | AP2          | AP5           | Definierte Griffgeste mit Scrollabgrenzung und unveränderter Speichersperre funktioniert.                                    |
| U2     | AP2          | AP5           | Bottom-Verankerung und Anfangsfokus sind unabhängig vom Ladezeitpunkt stabil.                                                |
| U3     | AP2          | AP5           | Alle Schließwege benutzen einen konsistenten Dialog-/Animationslebenszyklus.                                                 |
| U4     | AP2          | AP5           | Echtes iOS liefert dokumentierte Ergebnisse zu Feldüberlauf, Tastatur, Rotation und Safe Areas; offene Repros bleiben offen. |
| U5     | AP2          | AP4/AP5       | Manueller Einstieg ist kompakt; Belegaufnahme und notwendige Hinweise bleiben erreichbar.                                    |
| U6     | AP3          | AP2/AP5       | Unveränderte Hintergrundprüfungen bleiben still; Fehler und tatsächliche Speicherergebnisse bleiben sichtbar.                |
| U7     | AP2          | AP5           | Footer und Scrollbereich erzeugen keine geometrische Rückkopplung oder verdeckten Aktionen.                                  |
| U8     | AP2          | AP3/AP5       | Schriftstrategie ohne externen CSS-Import ist umgesetzt und bei blockierten externen Font-Endpunkten geprüft.                |
| S1     | AP3          | AP5           | Verzögerte Auth-/Dateninitialisierung zeigt keine falsche Bindungsaufforderung.                                              |
| S2     | AP3          | AP4/AP5       | Graph und Modellkatalog besitzen wirksame Zeitgrenzen/Abbrüche; Retry-Verhalten ist kontrolliert.                            |
| S3     | AP3          | AP5           | Cacheprobleme erhalten eine gezielte Recovery und werden nicht als Metadatenfehler ausgegeben.                               |
| S4     | AP3          | AP5           | Unbrauchbare Schemas und Referenzen werden vor Nutzungs-/Schreibfreigabe abgelehnt.                                          |
| S5     | AP3          | AP2/AP5       | Messungen und Vorher-/Nachher-Nachweise decken Runtime-Wiederverwendung, Kopien, Bundle und UI-Blockaden ab.                 |
| S6     | AP3          | AP1/AP2/AP4   | Fehlerklassen besitzen konsistente verständliche Meldungen und passende nächste Aktionen.                                    |
| K1     | AP4          | AP5           | Ausgelieferte Promptbeispiele bestehen die ausgelieferte Parserprüfung.                                                      |
| K2     | AP4          | AP3/AP5       | Harmlose Vordergrundprüfungen zerstören keine Analyse; echte Kontextwechsel brechen sicher ab.                               |
| K3     | AP4          | AP1/AP5       | Semantische Qualität, Auto-Save/Korrektur, Duplikatverdacht und unbekannter Uploadausgang sind entschieden und geprüft.      |
| K4     | AP4          | AP3/AP5       | Kategorien, Restgruppen, Pfand/Retouren, Neuversuche, Providerlimits und Bildgrenzen besitzen explizite Regeln/Nachweise.    |
| Q1     | AP5          | AP1–AP4       | Datums-/Timingfehler sind behoben, WebKit ist geeignet eingebunden, Offline-Reload ist geklärt.                              |
| Q2     | AP5          | AP1–AP4       | Dependency-Audit erfüllt den Gate; verbleibende zulässige Ausnahmen sind konkret dokumentiert und befristet.                 |
| Q3     | AP5          | AP1–AP4       | Schnittstellenregressionen, echte SQLite, Belegkorpus und physische Geräte ergänzen die bisherigen Mocks.                    |
| A1     | AP1          | AP4/AP5       | Ein gemeinsamer Commit-Controller bedient manuelle Transfers und KI-Batches ohne doppelte Recoverylogik.                     |
| A2     | AP3          | AP1/AP2/AP4   | Datenbanksitzung hat einen Besitzer; UI-Komponenten und gemeinsame fachliche Transferregeln sind passend getrennt.           |
| A3     | AP5          | AP1–AP4       | Jedes Paket liefert Regression, gezielte Änderung, passende Architekturprüfung und erneuten Nachweis.                        |

Bei S5 sind Worker-Auslagerung und weitergehende Optimierungen ausdrücklich messungsabhängig. Eine belegte Entscheidung, sie mangels relevanter Kosten vorerst nicht umzusetzen, ist ein mögliches Ergebnis. Bei offenen Gerätebefunden oder Produktentscheidungen genügt dagegen keine bloße Zuordnung: Ein fehlender Nachweis oder eine ausstehende Entscheidung muss als offen bestehen bleiben.

### Arbeitspaket 1 — Schreibsicherheit und gemeinsamer Commitpfad

**Umfang:** D1–D6 und A1; Sitzungsidentität aus A2 gemeinsam mit AP3. A3/Q3 bestimmen die Vorgehensweise und Nachweise.

**Bereiche:** `db/browserDbRuntime`, TransferWrite-/SaveExport-Service, Upload-Handoff, beide Save-/Commit-Controller und ihre Anbindung an AppShell.

- Herkunft und Ziel jedes Snapshots unveränderlich festhalten.
- Manuelle Buchung und KI-Batch über dieselbe Commitlogik führen; doppelte Retry-/Recoveryentscheidungen entfernen.
- Fremdschlüssel nach Export wiederherstellen.
- Remote-Erfolg, unbekanntes Remote-Ergebnis und rein lokalen Fehler trennen.
- Kontextwechsel, Mehrtab-Verhalten und Schreib-/Refreshkonkurrenz mit AP3 eindeutig regeln.
- Vor den Umbauten die bestätigten Fehler durch Tests mit echten SQLite-Bytes und kontrolliertem Graph-/Cacheverhalten absichern.

**Fertig, wenn:** D1–D6 ihre Abschlussnachweise besitzen und A1 strukturell umgesetzt ist: Beide Eingabearten benutzen denselben Commitpfad, ohne getrennte Fehlerlogik für dieselbe Persistenzoperation. Eine Reihe isolierter Bugfixes bei unverändert doppelten Speichermaschinen schließt A1 nicht ab.

### Arbeitspaket 2 — Smartphone-Dialog und stabile Darstellung

**Umfang:** U1–U5, U7/U8; UI-Anteil von A2. U6 wird federführend in AP3 behandelt.

**Bereiche:** `BottomSheet`, `AddRoute`, `SettingsRoute`, AppShell-Footer und `app.css`.

- Bottom-Verankerung, stabiler Fokus und Scrollbereich.
- Schließen im Header und echte Griffgeste.
- Einheitlicher Dialog-/Animationsablauf.
- Kompakter manueller Einstieg und klar getrenntes Belegpanel.
- Feldbreiten, Tastatur, Textdarstellung und Safe Areas auf echtem iOS prüfen.
- Footer-Geometrie vereinfachen; externe Font-Abhängigkeit durch lokale Schrift oder Systemschrift ersetzen.
- Nach Festlegung der fachlichen Zuständigkeiten die große Eingabeansicht in manuelles Formular, Belegpanel und gemeinsamen Commitstatus aufteilen. Settings entsprechend seinen vorhandenen Aufgaben gliedern; keine neue Geschäftslogik in UI-Komponenten verschieben.

**Fertig, wenn:** Die Geräte-/Geometrienachweise für U1–U8 vorliegen, alle Aktionen erreichbar sind und die UI-Aufteilung aus A2 keine zweite fachliche Zustandsmaschine erzeugt. U4 darf ohne echte Geräteevidenz nicht als erledigt gelten.

### Arbeitspaket 3 — Datenbanksitzung, Start und Fehlerbehandlung

**Umfang:** S1–S6, U6 und federführend A2; Abstimmung mit D6/K2.

**Bereiche:** AppShell, Startup-/Freshness-/Cache-/Runtime-Orchestrierung, Graph-Client, Modellkatalog-Client, gemeinsame Transferregeln und Statusdarstellung.

- Einen Besitzer für Konto-/Dateiidentität, Basisversion, Runtime, Refresh und Lese-/Schreibfreigabe etablieren.
- Fachlicher Bootstrapzustand statt 160-ms-Abschaltung; redundante und widersprüchliche Bereitschaftsflags entfernen.
- Timeouts, tatsächliche Abbrüche, kontrollierte Retryfolge und zusammengeführte Refreshs.
- Unveränderte offene Runtime weiterverwenden und unveränderte Hintergrundprüfungen ohne Erfolgstoast abschließen.
- Cache-Recovery und Schema-/Referenzprüfung verbessern.
- Gemeinsame Fehlerklassen mit konsistenten Meldungen und jeweils passender nächster Aktion an die UI liefern.
- Fachliche Transferregeln aus den Routen in einen passenden gemeinsamen Featurebereich verlagern; manuelles Formular und Receipt-Command-Builder konsumieren dieselben Regeln.
- Startphasen, Bytekopien, Bundle und UI-Blockaden an repräsentativen Datenbankgrößen messen. Cachemetadaten getrennt lesen, konsistente Metadaten/Download-URL und bedarfsweises Laden der KI-/Settings-Oberflächen prüfen und gezielt umsetzen. Worker-Auslagerung nur bei belegtem Bedarf.

**Fertig, wenn:** S1–S6 abgearbeitet oder bei messungsabhängigen Teilen nachvollziehbar entschieden sind. A2 verlangt zusätzlich überprüfbare Zuständigkeitsgrenzen: Ein Besitzer steuert die Datenbanksitzung; UI und Infrastruktur importieren nicht gegenseitig ihre Arbeitsabläufe; gemeinsame Validierung gehört nicht mehr einer einzelnen Route. Die UI-Teilaufgaben aus AP2 müssen dafür ebenfalls abgeschlossen sein.

### Arbeitspaket 4 — KI fachlich und auf Geräten qualifizieren

**Umfang:** K1–K4; gemeinsame Commitlogik aus A1, Sitzungs-/Lifecyclekoordination aus A2/S2 und Belegtests aus Q3.

**Bereiche:** Receipt-Prompts/-Parser, Aufnahme/Analyse/Vorbereitung, Konfiguration, Commitanbindung und Belegtestdaten.

- K1/K2 als P1-Korrekturen früh umsetzen und durch Regressionen absichern.
- Einrichtung, Kontentopologie und Kategorien vor unnötigen Remoteaufrufen prüfen, soweit der aktuelle Vertrag dies ermöglicht.
- Restgruppen, uneindeutige Artikel, Pfand/Rabatte, Retouren und Null-/Negativsummen ausdrücklich regeln.
- Auto-Save, Ergebniszusammenfassung, Korrekturweg und Duplikatverdacht fachlich entscheiden; unbekannte Uploadausgänge mit AP1 klären.
- Entscheiden, ob flüchtige validierte Ergebnisse bei Fehlern erneut genutzt werden dürfen; keine stille Änderung der bisherigen Neuaufnahme-/Datenschutzregel.
- Rate-Limit-/Modellverfügbarkeitsfehler verständlich behandeln; HEIC, Orientierung, große Fotos, Speicherbedarf und lange Bons prüfen.
- Anonymisierten Belegkorpus mit erwarteten Extraktionen, Gruppen und Centbeträgen auswerten.

**Fertig, wenn:** Jede konzeptionelle Frage aus K3/K4 eine dokumentierte Entscheidung und passende Prüfung besitzt. Repräsentative Belege müssen korrekt verarbeitet oder nachvollziehbar abgelehnt werden; sichere Struktur allein ist kein semantischer Qualitätsnachweis. Fehlende echte Provider-/Geräteprüfungen bleiben offen.

### Arbeitspaket 5 — Qualitätsbasis, Umbaukontrolle und Freigabe

**Umfang:** Q1–Q3 sowie die verbindliche Vorgehensweise A3. Beginnt vor/begleitend zu AP1–AP4; die Freigabe folgt nach deren Nachweisen.

**Bereiche:** Unit-/Integrations-/E2E-Tests, Playwright-Konfiguration, Quality-Workflow, Dependencies/Lockfile, Exception-Ledger, Architektur- und Geräte-QA-Dokumentation.

- **Q1:** Datumsabhängige Tests deterministisch machen, kurzlebige UI-Assertions mit steuerbaren Providerantworten ersetzen, geeigneten WebKit-Gate einführen und den Offline-Reload-Fehler mit kompatiblen Browser-/Runnerständen sowie echter Geräteprüfung abgrenzen.
- **Q2:** Advisories und tatsächlich erreichbare Pfade prüfen; Dependencies gezielt aktualisieren. Keine blinden Breaking Changes/Downgrades. Verbleibende Ausnahmen nur nach dem vorhandenen Repositoryvertrag mit konkreter Begründung und Frist behandeln.
- **Q3:** Die Nachweise aus AP1–AP4 zu einer zusammenhängenden Abdeckung verbinden: echte SQLite über Export-/Retry-/Kontextwechselgrenzen, Dialoggeometrie/Gesten, reproduzierbarer Bootstrap, realistischer Belegkorpus sowie physische Kamera-/Tastatur-/PWA-Fälle.
- **A3:** Pro Paket zuerst Regression und Akzeptanzziel festhalten, dann Sicherheitskorrektur und gezieltes Refactoring durchführen. Architekturprüfung kontrolliert Eigentümerschaft und entfernte Duplikation, nicht nur grüne Tests oder kleinere Dateien. Jeden dadurch ungültig gewordenen Check erneut ausführen.
- `docs/Manual-Device-QA.md` um KI-Aufnahme, Abbruch, Wiederkehr, Fehler und Korrektur ergänzen; geänderte Architekturverträge in der kanonischen Architekturdokumentation nachziehen.
- Auf dem exakten Releasekandidaten Safari/PWA und Android/PWA physisch prüfen; verbleibende Punkte aus der Zuordnungstabelle ausdrücklich bilanzieren.

**Fertig, wenn:** Der relevante automatisierte Gate einschließlich Audit erfüllt ist, der WebKit-Befund geklärt ist, alle erforderlichen Gerätefälle bestanden sind und für jeden Befund ein nachvollziehbarer Abschluss vorliegt. Eine Ausnahme oder verschobene P3-Optimierung muss als solche mit Begründung dokumentiert sein; sie darf nicht als behoben ausgegeben werden. Offene Datenintegritätsfehler, fehlende erforderliche Geräteprüfungen und ungeklärte Produktentscheidungen werden nicht durch einen insgesamt grünen Testzähler aufgewogen.

## 11. Konkrete Abnahmematrix

| Fall                                                                    | Erwartetes Ergebnis                                                                                            |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Kaltstart mit langsamer Auth                                            | Ein stabiler Ladezustand, keine falsche Bindungsaufforderung                                                   |
| Wiederkehr bei unveränderter eTag                                       | Keine neue SQL-Runtime, kein Formularreset                                                                     |
| Wiederkehr während OCR/LLM                                              | Analyse bleibt erhalten oder wird nur bei echtem Kontextwechsel erklärt beendet                                |
| Kamera abbrechen                                                        | Zurück zur unveränderten nutzbaren Ansicht                                                                     |
| Dateiwechsel nach fehlgeschlagenem Upload                               | Alte Bytes können nicht in neue Datei gelangen                                                                 |
| Cache-/Remoteänderung vor Retry                                         | Kein altes Bytepaket mit neuer eTag                                                                            |
| Exportfehler nach SQL-Commit                                            | Runtime gesperrt/wiederhergestellt, keine Doppelbuchung                                                        |
| Remote-Erfolg + Cachefehler beim Erstversuch und Retry                  | Keine weiteren Uploads; ausschließlich Reconciliation                                                          |
| Servererfolg, Antwort verloren                                          | Ergebnis wird erst geklärt; keine blinde Neuaufnahme-/Neubuchungsempfehlung                                    |
| Schreiben nach zweitem Export                                           | Fremdschlüssel weiterhin aktiv                                                                                 |
| Zwei Tabs derselben Datei                                               | Keine stille Überschreibung durch geteilte Cache-eTag                                                          |
| IndexedDB nicht verfügbar                                               | Passende Fehlermeldung und gezielte Recovery                                                                   |
| SQLite mit falschem Schema                                              | Frühe Ablehnung vor Anzeige/Schreibfreigabe                                                                    |
| Griffgeste bei leerem/ausgefülltem Formular                             | Definiertes Schließen; Eingaben gemäß Entwurfsvertrag erhalten                                                 |
| iOS-Tastatur und Rotation                                               | Keine abgeschnittenen Felder oder unerreichbaren Aktionen                                                      |
| Langer Bon/HEIC/gedrehtes Foto                                          | Definierte Unterstützung oder verständliche Ablehnung                                                          |
| Geschäftsnamen mit Rechtsform/Filiale                                   | Prompt und Parser stimmen überein                                                                              |
| Rabatt/Pfand/Retouren/falsche Kategorie                                 | Fachlich definierte Ergebnisse, keine stillen Fehlgruppen                                                      |
| Derselbe Bon erneut                                                     | Bewusst definierte Duplikatbehandlung                                                                          |
| Neuer SW bei ausstehender Änderung                                      | Kein unbemerkter Verlust des Pending-Kontexts                                                                  |
| Unveränderte Hintergrundprüfung (U6)                                    | Keine wiederholte Erfolgsmeldung; tatsächliche Änderungen/Fehler bleiben erkennbar                             |
| Footer/Schrift bei kleiner Höhe und blockierten Font-Endpunkten (U7/U8) | Stabile Geometrie und lesbare nutzbare Oberfläche ohne externen Schriftabruf                                   |
| Startup-/Bundleoptimierung (S5)                                         | Dokumentierte Messwerte und begründete Umsetzung oder Zurückstellung jeder messungsabhängigen Maßnahme         |
| Fehlerklassen über alle Arbeitsabläufe (S6)                             | Konsistente Meldung mit passender Recovery; Cache-, Netzwerk- und Remote-Commitfehler bleiben unterscheidbar   |
| Browsergate an unterschiedlichen Kalendertagen (Q1)                     | Keine Datumsabhängigkeit; keine Assertions auf unkontrolliert kurzlebige Zwischenzustände                      |
| WebKit-/Offline-Reload und reguläre CI (Q1)                             | Ursache geklärt, geeigneter automatisierter Gate aktiv und erforderliche Gerätebelege vorhanden                |
| Dependency-Audit (Q2)                                                   | Gate erfüllt; eventuelle zulässige Ausnahmen konkret begründet und befristet                                   |
| Ergänzte Integrations-/Beleg-/Geräteabdeckung (Q3)                      | Kritische Schnittstellen mit echter SQLite, semantischem Goldstandard und physischer Hardware nachgewiesen     |
| Gemeinsamer manueller/KI-Commitpfad (A1)                                | Ein Besitzer für SQL/Export/Upload/Retry/Reconciliation, keine doppelte Recoverylogik                          |
| Zuständigkeitsprüfung (A2)                                              | Datenbanksitzung zentral, UI aufgeteilt, gemeinsame Transferregeln unabhängig von einer Route                  |
| Abnahme eines Umbaupakets (A3)                                          | Regression vor Änderung, begrenzter Umbau, Architekturprüfung und relevante Checks mit dokumentiertem Ergebnis |

## 12. Lokale Nachweise und Reproduktion

Die Diagnoseartefakte liegen im ignorierten Verzeichnis `output/playwright/review-2026-10-20/`. Sie gehören nicht automatisch zu einem späteren Commit. Der Bericht enthält die wesentlichen Ergebnisse unabhängig von diesen temporären Dateien.

- [Modul-/SQLite-Reproduktionsskript](../../output/playwright/review-2026-10-20/code-probes.mjs)
- [Maschinenlesbare Ergebnisse](../../output/playwright/review-2026-10-20/code-probes.json)
- [Startup-Zeitfolge](../../output/playwright/review-2026-10-20/startup-timeline.json)
- [Receipt-Vordergrund-Reproduktion](../../output/playwright/review-2026-10-20/setup-receipt.js)
- [Receipt-Vordergrund-Ergebnis](../../output/playwright/review-2026-10-20/receipt-resume.json)
- [Gemessene Settings-Feldbreiten](../../output/playwright/review-2026-10-20/settings-layout.json)
- [Production-Dependency-Audit](../../output/playwright/review-2026-10-20/audit-production.json)
- [Unit-/Skripttest-Protokoll](../../output-review-tests.log)
- [Vollständiges E2E-Protokoll](../../output-review-e2e.log)
- [Isolierte E2E-Wiederholung](../../output-review-e2e-rerun.log)

Wesentliche Befehle:

```powershell
npm run format
npm run lint
npm run typecheck
npm run check:dead-code
npm run test

$env:PLAYWRIGHT_INCLUDE_IOS_WEBKIT = '1'
npm run test:e2e

# Gezielte Wiederholung direkt über Node, damit PowerShell/npm keine Flags verschluckt:
$env:PLAYWRIGHT_WEB_SERVER_BUILD = '0'
node node_modules/@playwright/test/cli.js test --workers=1 --grep 'runs both OpenRouter|waits for a deliberate|exposes manifest' --reporter=list --output=output/playwright/review-2026-10-20/e2e-rerun

npm run check:bundle-size
npm run audit:dependencies
npm audit --omit=dev --json
node output/playwright/review-2026-10-20/code-probes.mjs
```

Die Wiederholungsbefehle setzen installierte Projektabhängigkeiten und passende Playwright-Browser voraus. Die Browserproben starten eine lokale Testinstanz mit synthetischer Anmeldung und Graph-Antworten; sie sind keine Anleitung zum Testen an einer privaten OneDrive-Datenbank.

**Abschließende Dokumentprüfung:** Repositoryweiter Prettier-Check und `git diff --check` erfolgreich; alle 46 lokalen Linkziele dieses Berichts vorhanden. Die gestarteten Testserver und die isolierte Browserinstanz wurden beendet. Als neue nicht ignorierte Datei verbleibt ausschließlich dieser Bericht.

**Entscheidungsempfehlung:** Neue Features zurückstellen, zuerst die Datenintegrität und den Smartphone-Lebenszyklus stabilisieren. Danach das KI-Feature mit realistischen Testbelegen qualifizieren und erst auf Basis grüner automatisierter sowie physischer Geräteprüfungen freigeben.
