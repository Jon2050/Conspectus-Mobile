<div class="skeleton-card" aria-hidden="true">
  <div class="skeleton-box skeleton-title"></div>
  <div class="skeleton-box skeleton-text"></div>
  <div class="skeleton-box skeleton-text short"></div>
</div>

<style>
  .skeleton-card {
    padding: 1.25rem;
    background: var(--surface-strong);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-sm);
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .skeleton-title {
    height: 1.2rem;
    width: 60%;
    margin-bottom: 0.25rem;
  }

  .skeleton-text {
    height: 0.8rem;
    width: 100%;
  }

  .skeleton-text.short {
    width: 40%;
  }
</style>
