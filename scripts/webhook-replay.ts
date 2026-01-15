/**
 * Webhook Replay Script (M6)
 *
 * Replays webhook fixtures to test the webhook receiver.
 * Run with: npm run scheduler:webhook:replay
 *
 * Usage:
 *   npm run scheduler:webhook:replay                    # Replay all fixtures
 *   npm run scheduler:webhook:replay -- --file normal   # Replay specific fixture
 *   npm run scheduler:webhook:replay -- --url http://localhost:3000  # Custom URL
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

const FIXTURES_DIR = path.join(__dirname, '../fixtures/icims/webhooks');
const DEFAULT_URL = 'http://localhost:3000/api/webhooks/icims';
const WEBHOOK_SECRET = process.env.ICIMS_WEBHOOK_SECRET || 'test-webhook-secret';

interface ReplayResult {
  file: string;
  status: number;
  response: unknown;
  error?: string;
}

function generateSignature(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

async function replayWebhook(filePath: string, url: string): Promise<ReplayResult> {
  const fileName = path.basename(filePath);

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const signature = generateSignature(content, WEBHOOK_SECRET);

    console.log(`[${new Date().toISOString()}] Replaying ${fileName}...`);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-icims-signature': signature,
      },
      body: content,
    });

    const responseBody = await response.json();

    console.log(`  Status: ${response.status}`);
    console.log(`  Response: ${JSON.stringify(responseBody)}`);

    return {
      file: fileName,
      status: response.status,
      response: responseBody,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`  Error: ${errorMessage}`);
    return {
      file: fileName,
      status: 0,
      response: null,
      error: errorMessage,
    };
  }
}

async function main() {
  const args = process.argv.slice(2);

  // Parse arguments
  let targetFile: string | null = null;
  let url = DEFAULT_URL;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--file' && args[i + 1]) {
      targetFile = args[i + 1];
      i++;
    } else if (args[i] === '--url' && args[i + 1]) {
      url = args[i + 1];
      i++;
    }
  }

  console.log(`[${new Date().toISOString()}] Webhook Replay Script`);
  console.log(`Target URL: ${url}`);
  console.log(`Webhook Secret: ${WEBHOOK_SECRET.slice(0, 4)}...`);
  console.log('');

  // Get fixture files
  let files: string[] = [];

  if (targetFile) {
    const filePath = path.join(FIXTURES_DIR, `${targetFile}.json`);
    if (fs.existsSync(filePath)) {
      files = [filePath];
    } else {
      console.error(`Fixture not found: ${filePath}`);
      process.exit(1);
    }
  } else {
    if (!fs.existsSync(FIXTURES_DIR)) {
      console.error(`Fixtures directory not found: ${FIXTURES_DIR}`);
      process.exit(1);
    }
    files = fs.readdirSync(FIXTURES_DIR)
      .filter((f) => f.endsWith('.json'))
      .map((f) => path.join(FIXTURES_DIR, f));
  }

  if (files.length === 0) {
    console.log('No fixtures found to replay.');
    return;
  }

  console.log(`Found ${files.length} fixture(s) to replay.`);
  console.log('');

  // Replay each fixture
  const results: ReplayResult[] = [];

  for (const file of files) {
    const result = await replayWebhook(file, url);
    results.push(result);
    console.log('');
  }

  // Summary
  console.log('='.repeat(50));
  console.log('REPLAY SUMMARY');
  console.log('='.repeat(50));

  const successful = results.filter((r) => r.status === 200);
  const failed = results.filter((r) => r.status !== 200);

  console.log(`Total: ${results.length}`);
  console.log(`Successful (200): ${successful.length}`);
  console.log(`Failed: ${failed.length}`);

  if (failed.length > 0) {
    console.log('\nFailed requests:');
    for (const r of failed) {
      console.log(`  - ${r.file}: ${r.status} ${r.error || ''}`);
    }
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
