<script setup lang="ts">
const title = 'Epic Dashboard';
</script>

<template>
  <main>
    <h1>{{ title }}</h1>
    <p>Nothing here yet. See SPEC.md for the delivery plan.</p>
  </main>
</template>

<style>
/* Dark is the default theme; light is opt-in via data-theme="light". */
:root {
  color-scheme: dark;
  --bg: #0f1115;
  --surface: #171a21;
  --border: #2a2f3a;
  --text: #e6e8ec;
  --text-muted: #9aa3b2;
  --accent: #6ea8fe;
  --success: #3fb950;
  font-family: system-ui, sans-serif;
}
:root[data-theme='light'] {
  color-scheme: light;
  --bg: #ffffff;
  --surface: #f6f7f9;
  --border: #d9dde3;
  --text: #1b1f24;
  --text-muted: #5b6472;
  --accent: #2563eb;
  --success: #1a7f37;
}
body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
}
main {
  max-width: 72rem;
  margin: 0 auto;
  padding: 1rem;
}
</style>
