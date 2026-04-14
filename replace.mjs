import fs from 'fs';

const filePath = './tests/e2e/app-shell.spec.ts';
let content = fs.readFileSync(filePath, 'utf8');

const replacements = [
  [/'Accounts'/g, "'Konten'"],
  [/'Add'/g, "'Neu'"], // Only in navigation and heading contexts
  [/'Settings'/g, "'Einstellungen'"],
  [/'Loading accounts from the local database\.\.\.'/g, "'Konten werden geladen...'"],
  [/'There are no transfers recorded'/g, "'Es gibt keine Transfers für diesen Monat.'"],
  [
    /'open Settings and bind your OneDrive database'/g,
    "'Es wurden noch keine passenden Konten gefunden'",
  ],
  [/'Checking OneDrive for DB updates\.\.\.'/g, "'Suche nach DB-Updates auf OneDrive...'"],
  [
    /'Syncing with OneDrive in the background\.\.\.'/g,
    "'Synchronisiere mit OneDrive im Hintergrund...'",
  ],
  [/'Downloaded the latest DB from OneDrive\.'/g, "'Neueste DB von OneDrive heruntergeladen.'"],
  [
    /'Offline mode using the last cached DB\.'/g,
    "'Offline-Modus nutzt die zuletzt zwischengespeicherte DB.'",
  ],
  [/'Using the last cached DB for now\.'/g, "'Nutze vorerst die zwischengespeicherte DB.'"],
  [/'Sign in with Microsoft'/g, "'Mit Microsoft anmelden'"],
  [/'Signed out\.'/g, "'Abgemeldet.'"],
  [/'Loading Placeholder'/g, "'Lade...'"],
  [/'Preparing your mobile workspace\.'/g, "'Dein mobiler Arbeitsplatz wird vorbereitet.'"],
  [
    /'Failed to open the cached OneDrive database snapshot\. Re-sync from settings and try again\.'/g,
    "'Konnte zwischengespeicherte DB nicht öffnen. Synchronisiere erneut über die Einstellungen.'",
  ],
  [
    /'Failed to open the local SQLite database snapshot\. Retry sync from settings\.'/g,
    "'Konnte das lokale SQLite-Snapshot nicht öffnen. Wiederhole die Synchronisation in den Einstellungen.'",
  ],
  [
    /'Startup sync failed unexpectedly\. Check the browser console and retry\.'/g,
    "'Start-Synchronisation unerwartet fehlgeschlagen. Bitte prüfe die Browser-Konsole und versuche es erneut.'",
  ],
  [/'Sign in'/g, "'Mit Microsoft anmelden'"], // Settings action button
  [/'Sign out'/g, "'Abmelden'"],
];

replacements.forEach(([regex, replacement]) => {
  content = content.replace(regex, replacement);
});

fs.writeFileSync(filePath, content);
console.log('Replacements completed successfully.');
