<script setup lang="ts">
import { getHygiene } from '../api';
import LoadState from '../components/LoadState.vue';
import { useResource } from '../composables/useResource';
import { FLAG_LABELS } from '../lib/format';
import { apiIds } from '../store';

const { data, error, loading } = useResource(() => getHygiene(apiIds.value), [() => apiIds.value?.join(',') ?? '']);
</script>

<template>
  <h1>Hygiene</h1>
  <LoadState
    :loading="loading"
    :error="error"
    :has-data="data !== null"
  >
    <template v-if="data">
      <p
        v-if="data.groups.length === 0 && data.unmatchedBuckets.length === 0"
        class="muted"
      >
        Nothing to fix. All labels and buckets look consistent.
      </p>
      <section
        v-for="g in data.groups"
        :key="g.type"
        class="group"
      >
        <h2>{{ g.label }} <span class="count">{{ g.tasks.length }}</span></h2>
        <ul>
          <li
            v-for="t in g.tasks"
            :key="t.id"
          >
            <span class="ref">{{ t.ref }}</span>
            <a
              :href="t.url"
              target="_blank"
              rel="noopener noreferrer"
            >{{ t.title }}</a>
            <span
              v-for="f in t.flags.filter((x) => x.type === g.type)"
              :key="f.type"
              class="muted detail"
              :title="FLAG_LABELS[f.type]"
            >{{ f.detail }}</span>
          </li>
        </ul>
      </section>
      <section
        v-if="data.unmatchedBuckets.length > 0"
        class="group"
      >
        <h2>Unmatched child-project buckets <span class="count">{{ data.unmatchedBuckets.length }}</span></h2>
        <p class="muted">
          These child-project buckets have no match in the parent project's board, so their tasks show as not on the board.
        </p>
        <ul>
          <li
            v-for="b in data.unmatchedBuckets"
            :key="`${b.projectId}:${b.bucketName}`"
          >
            <span class="ref">{{ b.projectTitle }}</span> {{ b.bucketName }}
          </li>
        </ul>
      </section>
    </template>
  </LoadState>
</template>

<style scoped>
.group ul {
  list-style: none;
  margin: 0;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 4px;
}
.group li {
  display: flex;
  flex-wrap: wrap;
  gap: 0.15rem 0.75rem;
  padding: 0.35rem 0.6rem;
  border-bottom: 1px solid var(--border);
  overflow-wrap: anywhere;
}
.group li:last-child {
  border-bottom: 0;
}
.count {
  display: inline-block;
  min-width: 1.5rem;
  padding: 0 0.4rem;
  margin-left: 0.4rem;
  text-align: center;
  background: var(--surface-2);
  border-radius: 999px;
  font-weight: normal;
  font-size: 0.8rem;
}
.ref {
  color: var(--text-muted);
  white-space: nowrap;
}
.detail {
  font-size: 0.85rem;
}
</style>
