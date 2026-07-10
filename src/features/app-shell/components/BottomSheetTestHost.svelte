<!-- Renders concurrent bottom sheets to verify each dialog receives a distinct accessible name. -->
<script lang="ts">
  import BottomSheet from './BottomSheet.svelte';
</script>

<BottomSheet isOpen={true} title="First sheet" />
<BottomSheet isOpen={true} title="Second sheet" />
