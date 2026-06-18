# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: memory.spec.ts >> Memory Leak Test: Rapidly switching between services
- Location: tests\memory.spec.ts:5:1

# Error details

```
ReferenceError: __dirname is not defined
```

# Test source

```ts
  1  | import { _electron as electron, test, expect } from '@playwright/test';
  2  | import * as fs from 'fs';
  3  | import * as path from 'path';
  4  | 
  5  | test('Memory Leak Test: Rapidly switching between services', async () => {
  6  |   console.log('Launching Electron app for memory testing...');
  7  |   const electronApp = await electron.launch({ args: ['.'] });
  8  | 
  9  |   const window = await electronApp.firstWindow();
  10 |   
  11 |   // Wait for the app to load
  12 |   await window.waitForSelector('text=Gradd', { timeout: 10000 });
  13 | 
  14 |   const getMemoryUsage = async () => {
  15 |     return await electronApp.evaluate(() => {
  16 |       return process.memoryUsage();
  17 |     });
  18 |   };
  19 | 
  20 |   const memoryReadings: any[] = [];
  21 |   
  22 |   // Record initial memory
  23 |   memoryReadings.push({ iteration: 0, memory: await getMemoryUsage() });
  24 | 
  25 |   // Services that are enabled by default
  26 |   const servicesToSwitch = ['Messenger', 'WhatsApp', 'Telegram', 'Slack'];
  27 | 
  28 |   for (let i = 1; i <= 5; i++) {
  29 |     console.log(`Iteration ${i}...`);
  30 |     for (const serviceName of servicesToSwitch) {
  31 |       // Click the service icon in the sidebar (which has title=ServiceName)
  32 |       const serviceButton = window.locator(`button[title="${serviceName}"]`);
  33 |       if (await serviceButton.count() > 0) {
  34 |         await serviceButton.click();
  35 |         // Wait for the WebContentsView to be attached and load slightly
  36 |         await window.waitForTimeout(2000);
  37 |       }
  38 |     }
  39 |     
  40 |     const mem = await getMemoryUsage();
  41 |     memoryReadings.push({ iteration: i, memory: mem });
  42 |     console.log(`Memory after iteration ${i}:`, Math.round(mem.heapUsed / 1024 / 1024), 'MB heap used');
  43 |   }
  44 | 
  45 |   await electronApp.evaluate(({ app }) => app.quit());
  46 | 
  47 |   // Save the report
> 48 |   const reportPath = path.join(__dirname, '..', 'memory-report.json');
     |                                ^ ReferenceError: __dirname is not defined
  49 |   fs.writeFileSync(reportPath, JSON.stringify(memoryReadings, null, 2));
  50 |   console.log(`Memory report saved to ${reportPath}`);
  51 | 
  52 |   // Basic assertion to ensure it ran
  53 |   expect(memoryReadings.length).toBeGreaterThan(1);
  54 | });
  55 | 
```