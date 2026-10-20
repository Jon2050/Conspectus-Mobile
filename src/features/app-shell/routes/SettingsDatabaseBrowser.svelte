<!-- OneDrive listing presentation; navigation and selection stay in the route controller. -->
<script lang="ts">
  import { _ } from 'svelte-i18n';
  import type { GraphDriveItem } from '@graph';
  import type { SettingsFileBindingState } from './settingsFileBindingController';
  import SkeletonCard from '../components/SkeletonCard.svelte';
  const folderItems = (items: readonly GraphDriveItem[]): readonly GraphDriveItem[] =>
    items.filter((item) => item.kind === 'folder');

  const selectableFileItems = (items: readonly GraphDriveItem[]): readonly GraphDriveItem[] =>
    items.filter((item) => item.kind === 'file');
  let {
    bindingState,
    handleOpenFolderClick,
    handleSelectFileClick,
  }: {
    bindingState: SettingsFileBindingState;
    handleOpenFolderClick: (item: GraphDriveItem) => void;
    handleSelectFileClick: (item: GraphDriveItem) => void;
  } = $props();
</script>

<section
  class="settings-screen__browser"
  data-testid="db-file-browser"
  aria-busy={bindingState.operation === 'loading'}
>
  <header class="settings-screen__browser-header">
    <h4>{$_('settings.browser.currentFolder')}</h4>
    <p>{bindingState.currentFolder?.path ?? '/'}</p>
  </header>

  {#if bindingState.operation === 'loading'}
    <p class="settings-screen__browser-loading" aria-live="polite">
      {$_('settings.browser.loading')}
    </p>
    <div class="settings-screen__browser-skeletons" data-testid="db-file-browser-loading">
      <SkeletonCard />
      <SkeletonCard />
    </div>
  {:else if bindingState.error === null && bindingState.items.length === 0 && bindingState.hasLoaded}
    <p class="settings-screen__browser-empty">{$_('settings.browser.empty')}</p>
  {:else}
    {#if folderItems(bindingState.items).length > 0}
      <div class="settings-screen__browser-group">
        <h4>{$_('settings.browser.foldersHeading')}</h4>
        <ul class="settings-screen__browser-list">
          {#each folderItems(bindingState.items) as item (item.itemId)}
            <li>
              <button
                class="settings-screen__browser-item settings-screen__browser-item--folder"
                type="button"
                data-testid={`open-folder-${item.itemId}`}
                onclick={() => handleOpenFolderClick(item)}
                disabled={bindingState.operation !== 'idle'}
              >
                <span>{item.name}</span>
                <span>{$_('settings.browser.openFolder')}</span>
              </button>
            </li>
          {/each}
        </ul>
      </div>
    {/if}

    {#if selectableFileItems(bindingState.items).length > 0}
      <div class="settings-screen__browser-group">
        <h4>{$_('settings.browser.filesHeading')}</h4>
        <ul class="settings-screen__browser-list">
          {#each selectableFileItems(bindingState.items) as item (item.itemId)}
            <li>
              <button
                class="settings-screen__browser-item settings-screen__browser-item--file"
                type="button"
                data-testid={`select-file-${item.itemId}`}
                onclick={() => handleSelectFileClick(item)}
                disabled={bindingState.operation !== 'idle'}
              >
                <span>{item.name}</span>
                <span>{$_('settings.browser.selectFile')}</span>
              </button>
            </li>
          {/each}
        </ul>
      </div>
    {/if}
  {/if}
</section>
