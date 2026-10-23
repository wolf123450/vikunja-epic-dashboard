<script setup lang="ts">
import ErrorBanner from './ErrorBanner.vue';

defineProps<{ loading: boolean; error: string | null; hasData: boolean }>();
</script>

<template>
  <ErrorBanner
    v-if="error"
    title="Could not load data"
    :message="error"
  />
  <p
    v-if="loading && !hasData"
    class="loading"
    role="status"
  >
    Loading...
  </p>
  <slot v-if="hasData" />
</template>

<style scoped>
.loading {
  color: var(--text-muted);
}
</style>
