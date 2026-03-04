<script lang="ts">
  const { message = 'A section failed to render. Try selecting another tab.' } = $props<{
    message?: string;
  }>();
</script>

<section
  class="placeholder-state"
  data-testid="error-placeholder"
  role="alert"
  aria-live="assertive"
>
  <h2>Error Placeholder</h2>
  <p>{message}</p>
</section>
