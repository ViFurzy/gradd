import { _electron as electron, test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

test('Memory Leak Test: Rapidly switching between services', async () => {
  console.log('Launching Electron app for memory testing...');
  const electronApp = await electron.launch({ args: ['.'] });

  const window = await electronApp.firstWindow();
  
  // Wait for the app to load
  await window.waitForSelector('text=Gradd', { timeout: 10000 });

  const getMemoryUsage = async () => {
    return await electronApp.evaluate(() => {
      return process.memoryUsage();
    });
  };

  const memoryReadings: any[] = [];
  
  // Record initial memory
  memoryReadings.push({ iteration: 0, memory: await getMemoryUsage() });

  // Services that are enabled by default
  const servicesToSwitch = ['Messenger', 'WhatsApp', 'Telegram', 'Slack'];

  for (let i = 1; i <= 5; i++) {
    console.log(`Iteration ${i}...`);
    for (const serviceName of servicesToSwitch) {
      // Click the service icon in the sidebar (which has title=ServiceName)
      const serviceButton = window.locator(`button[title="${serviceName}"]`);
      if (await serviceButton.count() > 0) {
        await serviceButton.click();
        // Wait for the WebContentsView to be attached and load slightly
        await window.waitForTimeout(2000);
      }
    }
    
    const mem = await getMemoryUsage();
    memoryReadings.push({ iteration: i, memory: mem });
    console.log(`Memory after iteration ${i}:`, Math.round(mem.heapUsed / 1024 / 1024), 'MB heap used');
  }

  await electronApp.evaluate(({ app }) => app.quit());
  try { await electronApp.close(); } catch(e) {}

  // Save the report
  const reportPath = path.join(process.cwd(), 'memory-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(memoryReadings, null, 2));
  console.log(`Memory report saved to ${reportPath}`);

  // Basic assertion to ensure it ran
  expect(memoryReadings.length).toBeGreaterThan(1);
});
