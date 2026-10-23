import { createApp } from 'vue';
import App from './App.vue';
import { router } from './router';
import { initTheme } from './store';

initTheme();
createApp(App).use(router).mount('#app');
