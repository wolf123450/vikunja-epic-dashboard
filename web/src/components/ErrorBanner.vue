<script setup lang="ts">
defineProps<{ title: string; message: string }>();
</script>

<template>
  <div
    class="banner"
    role="alert"
  >
    <strong>{{ title }}</strong>
    <span>{{ message }}</span>
  </div>
</template>

<style scoped>
.banner {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem 0.75rem;
  padding: 0.6rem 0.8rem;
  margin-bottom: 0.75rem;
  background: var(--danger-bg);
  border: 1px solid var(--danger);
  border-radius: 4px;
  color: var(--text);
  overflow-wrap: anywhere;
}
strong {
  color: var(--danger);
}
</style>
