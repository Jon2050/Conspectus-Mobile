import { mount } from 'svelte';
import { registerSW } from 'virtual:pwa-register';
import { RuntimeEnvError, loadRuntimeEnv } from '@shared';
import './app.css';
import App from './App.svelte';

const appRoot = document.getElementById('app');

if (!appRoot) {
  throw new Error('App mount target "#app" was not found.');
}

const renderStartupError = (message: string): void => {
  appRoot.innerHTML = `
    <section class="startup-error" role="alert" aria-live="assertive">
      <h1>Startup configuration error</h1>
      <p>${message}</p>
    </section>
  `.trim();
};

const resolveStartupErrorMessage = (error: unknown): string => {
  if (error instanceof RuntimeEnvError) {
    return error.message;
  }

  return 'The app failed to start due to an unexpected error. Check the browser console for details.';
};

let app: ReturnType<typeof mount> | undefined;

try {
  loadRuntimeEnv();
  registerSW({ immediate: true });

  app = mount(App, {
    target: appRoot,
  });
} catch (error) {
  console.error('App startup failed.', error);
  renderStartupError(resolveStartupErrorMessage(error));
}

export default app;
