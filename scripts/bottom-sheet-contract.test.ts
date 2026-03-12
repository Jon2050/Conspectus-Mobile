// Guards the BottomSheet modal contract so it keeps using showModal() and native backdrop styling.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const scriptsDirectoryPath = path.dirname(fileURLToPath(import.meta.url));
const bottomSheetPath = path.resolve(
  scriptsDirectoryPath,
  '../src/features/app-shell/components/BottomSheet.svelte',
);

describe('BottomSheet modal contract', () => {
  it('uses the native dialog modal API and native backdrop styling', () => {
    const source = fs.readFileSync(bottomSheetPath, 'utf8');

    expect(source).toContain('dialogElement.showModal()');
    expect(source).toContain('.bottom-sheet__dialog::backdrop');
  });
});
