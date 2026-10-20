# AP2: Smartphone-Dialog und stabile Darstellung

Stand: 20. Oktober 2026. Basis: `ea02aaeddeb68f6dba6a233cce0914899c249c08`.
Umsetzung auf `codex/ap2-mobile-dialog`; lokaler Commit, kein Push oder Deployment.

## Auftrag und Abnahmegrenze

Arbeitspaket 2 aus [dem Projektaudit](2026-10-20-project-audit.md): U1–U5, U7/U8 und
der UI-Anteil von A2. U6 und die Datenbanksitzung bleiben bei AP3. Die vorhandenen Controller,
Transferregeln, SQL-/Uploadabläufe, Auth-Konfiguration und der Datenbankvertrag bleiben erhalten.

Der Nutzer hat ausdrücklich entschieden: Geräteprüfung später, geprüften Stand mit dokumentierter
Einschränkung lokal committen. **U4 ist ohne echte iPhone-Evidenz offen; AP2 ist damit noch nicht
vollständig auf Geräten abgenommen.** Es besteht keine Releasefreigabe. Die ergänzte
[QA-03-Gerätematrix](../Manual-Device-QA.md#qa-03-month-navigation-and-mobile-layout) beschreibt die
noch auszuführenden Prüfungen in Safari und installierter PWA.

## Vorabplan und Umsetzung

1. `BottomSheet.svelte`: untere Verankerung, Anfangsfokus, Scrollbereich, sichtbares Schließen,
   Griffgeste und einheitliches Schließen unter Beachtung der Speichersperre.
2. `AddRoute.svelte`: manuelle Felder, Belegaufnahme und Speicherfeedback als Darstellungskomponenten
   abtrennen; fachliche Zustandsübergänge und Controller bleiben bei ihren bestehenden Besitzern.
3. `SettingsRoute.svelte`: bestehende Anzeigeaufgaben abtrennen; Feldbreiten und Safe Areas härten.
4. AppShell-Footer in den Scrollinhalt verschieben; Scroll-/Resize-Rückkopplung entfernen und
   externe Font-Abhängigkeit durch Systemschrift ersetzen.
5. Browserregressionen, lokale Gates, eigenes Review und ergänzendes isoliertes agy-Review;
   nötige Korrekturen selbst umsetzen und danach lokal committen.

Der Dialog öffnet nativ modal. Ein dauerhafter Header erhält den Anfangsfokus; der Inhalt beginnt
einmal beim Öffnen oben. Spätere Zustandsupdates setzen Benutzerscrollen nicht zurück. `top: auto`,
`bottom: 0`, ein nicht schrumpfender Header und `min-height: 0` am Scrollbereich halten die Geometrie
explizit. Ein geschlossenes natives Dialogelement ist unsichtbar.

Header, Formularbutton, Escape/Cancel, Backdrop und Griff benutzen dieselbe Schließfreigabe.
Während manueller oder KI-Speicheroperationen und externem `isSubmitting` bleibt sie gesperrt.
Die Griffgeste braucht mindestens 80 CSS-Pixel nach unten und mehr vertikalen als horizontalen Weg.
Pointer-Cancel und Capture-Verlust setzen die Geste zurück. Nur der Griff unterdrückt native
Scroll-/Textauswahlgesten; Formularscrollen bleibt nativ. Die bisherige Ein-/Ausblendtransition
entfällt: Schließen und Entfernen des nativen Modals erfolgen ohne nachlaufende Svelte-Animation
und ohne zusätzliche globale z-Indizes.

`ManualTransferForm.svelte` besitzt Felddarstellung und die vorhandene Betragseingabe.
`ReceiptCapturePanel.svelte` besitzt Kameraeingang, kompakte aufklappbare Verarbeitungshinweise,
Analyseschritte und Kontoauswahl. `TransferCommitStatus.svelte` zeigt Fehler, Validierung,
Speicherfortschritt und Receipt-Recoveryaktionen. Diese Komponenten starten keine Services,
abonnieren keine Controller und erzeugen keine fachliche Zustandsmaschine.
Entwürfe bleiben wie bisher in AppShell; Dateiauswahl, Abbruch und Commit-Handoff bleiben in AddRoute.

Settings trennt Sicherheits-/Recoveryhinweise, OneDrive-Listing und Buildinformationen in
`SettingsSafetySection`, `SettingsDatabaseBrowser` und `SettingsBuildInformation`; das vorhandene
`SettingsOpenRouterSection` bleibt eigenständig. Navigation, Anmeldung, Reset und Refresh bleiben
an den vorhandenen Controllern. Die beiden routenspezifischen CSS-Dateien halten die bisherigen
Klassen gemeinsam für ihre Darstellungskomponenten vor.

`app.css` verwendet Systemschrift, begrenzt Eingabefelder auf ihre Containerbreite und berücksichtigt
obere sowie seitliche Safe Areas. Manuelle Datum-/Textfelder verwenden eine einheitliche Höhe;
der bestehende Browsertest fand nach dem Schriftwechsel drei Pixel Abweichung, die korrigiert wurde.
Der Footer liegt am Ende des normalen Scrollinhalts vor der festen Navigation. Observer,
Scrolllistener, Sichtbarkeitsflags und animierte Höhenänderungen entfallen vollständig.

## Bundleentscheidung

Ein separater Build der unveränderten Basis mit denselben installierten Abhängigkeiten ergab
726.593 Byte JS roh / 219.076 Byte gzip und 31.986 Byte CSS roh / 5.794 Byte gzip.
AP2 reduziert den unkomprimierten JS-Code und das CSS, erhöht durch die neuen Gesten und expliziten
Komponentengrenzen aber JS-gzip um etwa 501 Byte. Die Basis hatte nur 60 Byte Gzip-Spielraum.

Nach Reduktion des erzeugten Komponentencodes wurde das JS-gzip-Limit für diesen gewollten
Funktions-/Strukturzuwachs von 214 auf 215 KiB angehoben. Raw- und CSS-Grenzen bleiben unverändert;
Budgetdatei und kanonische CI-Dokumentation stimmen überein. Diese Entscheidung ist Teil des
Code-Reviews, keine pauschale Ausnahme vom Gate.

## Prüfungen und Review

| Prüfung                                                                  | Ergebnis                                                                         |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| `npm run format`                                                         | Erfolgreich                                                                      |
| Direkter ESLint-Aufruf mit `--max-warnings=0 --ignore-pattern output/**` | Erfolgreich                                                                      |
| `npm run typecheck`                                                      | Erfolgreich, keine Fehler/Warnungen                                              |
| `npm run check:dead-code`                                                | Erfolgreich                                                                      |
| `npm run test`                                                           | 662 App-/Integrationstests und 127 Skripttests erfolgreich                       |
| `npm run build`                                                          | Erfolgreich; finaler Production-Channel-Browserbuild mit synthetischer Client-ID |
| `npm run check:bundle-size`                                              | Erfolgreich: JS 725.765 Byte roh / 219.577 Byte gzip; CSS 30.244 / 5.659 Byte    |
| Vollständiges Playwright-Gate mit WebKit                                 | 266 erfolgreich, 3 reguläre Skips, 1 vorbestehender WebKit-Offline-Reloadfehler  |
| `git diff --check`                                                       | Erfolgreich                                                                      |

Der unveränderte Befehl `npm run lint` erfasst alte, ignorierte Audit-/AP1-Diagnoseartefakte unter
`output/` und scheitert dort. Der direkte ESLint-Aufruf prüft den vollständigen Quell-/Test-/Skriptbestand
mit zusätzlichem Ausschluss dieses generierten Verzeichnisses; weder fremde Artefakte noch die
ESLint-Konfiguration wurden geändert. Der erste Vitest-Aufruf scheiterte vor Testbeginn an einem
Sandbox-Tempdateizugriff; die vollständigen Wiederholungen mit funktionierendem Tempzugriff sind grün.

Der vollständige Browserlauf umfasste 270 Fälle in Chromium, Pixel 5 und iPhone-WebKit. Alle neuen
AP2-Fälle bestanden: je drei Geometrien, Gesten/Abbruch/Entwurf, sämtliche Schließsperren,
Systemschrift/Textvergrößerung/Rotation; zusätzlich echte CDP-Touch-Events in beiden
Chromium-Profilen. Die drei Skips sind der bestehende Service-Worker-Updatefall in Pixel 5 und
WebKit sowie der absichtlich nur über Chromium-CDP ausführbare Touch-Test in WebKit.

Der einzige Fehler war `exposes manifest and registers service worker` in WebKit:
`page.reload: WebKit encountered an internal error` beim Offline-Reload. Derselbe Test scheiterte
anschließend im separat gebauten, unveränderten Ausgangscommit mit genau demselben Fehler.
Dieser bereits unter Q1/AP5 geführte Befund ist keine AP2-Regression und bleibt offen. Der
Gesamtlauf mit optionalem WebKit ist deshalb ausdrücklich **nicht vollständig grün**. Chromium,
Pixel 5 und alle geänderten UI-Fälle sind grün. Die Prüfungen wurden nicht abgeschwächt.

Das eigene Review prüfte besonders Dialogöffnung/-entfernung, Griff-/Scrollabgrenzung, Busy-Sperren,
Entwurfserhalt und die weitergereichten Events der extrahierten Ansichten. Keine offenen
Codebefunde. Die größte geänderte Ablaufkomplexität liegt in der Abgrenzung von nativer Dialog-
und Pointer-Lebensdauer. Ein einzelner Schließpfad und der Verzicht auf nachlaufende Transitionen
halten sie begrenzt. Die Ansichten besitzen keine neuen Controller oder Persistenzentscheidungen;
phaseabhängige Statusdarstellung bleibt ausdrücklich Darstellung.

### Ergänzender agy-CodeReview

- Modus: lokaler, rein lesender CodeReview in einer unabhängigen temporären Git-Kopie ohne Remote.
- Basis/Head: `ea02aaeddeb68f6dba6a233cce0914899c249c08` plus sämtliche uncommitteten
  AP2-Änderungen und relevanten neuen Dateien; keine fremden Änderungen oder privaten Laufzeitdaten.
- Der Nutzer hat die Übermittlung des isolierten AP2-Quellcodes an agy/Gemini ausdrücklich freigegeben.
- Modell: `gemini-3.8-flash-high`, `--mode plan`, `--effort high`.
- Review-ID: `001ed9c3-6e79-4845-9450-d3e628d7390b`.
- Zwei abgeschlossene Durchläufe: vollständiges Quellreview und ergänzende Bewertung der finalen
  Browserergebnisse einschließlich identischer Reproduktion des WebKit-Fehlers am Ausgangscommit.
- Beide Urteile: **APPROVED**, keine handlungsrelevanten Befunde. Keine Findings anzunehmen,
  teilweise anzunehmen oder zurückzuweisen; keine weiteren Implementierungskorrekturen erforderlich.
- Der Reviewer bestätigt die Zuständigkeitsgrenzen, Schließsperren, Wartbarkeit des Dialogablaufs
  und die proportionale Bundleentscheidung. Er bewertet U4 und Q1/AP5 ausdrücklich als weiterhin offen.
- Nach jedem Durchlauf wurden alle 338 erfassten Dateihashes und der Git-Status geprüft:
  keine unerwarteten Änderungen. Zwischen den Durchläufen wurde nur der Lieferbericht mit den
  endgültigen Nachweisen aktualisiert; der Quellcode blieb unverändert. Abschließend ergänzt
  dieser Bericht ausschließlich das erhaltene Reviewurteil.
- Eigene Bewertung: Das externe Ergebnis stimmt mit dem unabhängigen eigenen Review überein.
  Der Reviewer führte keine Tests/Builds aus; seine Prüfung ist statisch und verwendet die
  bereitgestellten Laufzeitnachweise. Sie ersetzt keine Geräte- oder Releaseabnahme.

Temporäre Browserprotokolle und Diagnoseartefakte liegen unter dem ignorierten `output/`.

Nicht durchgeführt: echte Microsoft-Anmeldung, private OneDrive-Schreibvorgänge, Live-OpenRouter,
physische iOS-/Android-Geräte und Deployment. Browserprofile, synthetische Dienste, vergrößerte
CSS-Schrift und Viewportrotation ersetzen keine echte iOS-Tastatur oder Dynamic-Type-Prüfung.

## Abschließendes Reviewurteil

Keine offenen handlungsrelevanten Codebefunde für den ausdrücklich zur lokalen Lieferung
freigegebenen AP2-Umfang. Physische iPhone-Abnahme (U4) und der vorbestehende WebKit-Offline-Reload
(Q1/AP5) bleiben offen. Keine Releasefreigabe.

APPROVED
