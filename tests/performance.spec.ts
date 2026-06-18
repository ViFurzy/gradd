import { _electron as electron, test, expect } from '@playwright/test';

test('Performance Test: App Startup Time', async () => {
  const startTime = Date.now();
  console.log('Launching app to measure startup time...');
  
  const electronApp = await electron.launch({ args: ['.'] });
  const window = await electronApp.firstWindow();
  
  // Wait for the main UI to render
  await window.waitForSelector('text=Gradd', { timeout: 15000 });
  
  const startupTime = Date.now() - startTime;
  console.log(`App startup time: ${startupTime}ms`);
  
  // Ensure startup time is reasonable (e.g., under 10 seconds)
  expect(startupTime).toBeLessThan(10000);

  await electronApp.evaluate(({ app }) => app.quit());
  try { await electronApp.close(); } catch(e) {}
});
