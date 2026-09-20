// Daily Automated Database Backup to Cloudflare R2
import 'dotenv/config';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { supabase, getR2, R2_BUCKET } from '../server/lib/clients.js';

async function runBackup() {
  console.log(`[${new Date().toISOString()}] Starting automated database backup to R2...`);
  const r2 = getR2();
  if (!r2) {
    console.error('Error: R2 client is not configured');
    process.exit(1);
  }

  try {
    // 1. Fetch all projects
    const { data: projects, error: pErr } = await supabase
      .from('projects')
      .select('*');
    if (pErr) throw pErr;

    // 2. Fetch all magazines
    const { data: magazines, error: mErr } = await supabase
      .from('magazines')
      .select('*');
    if (mErr) throw mErr;

    const backupPayload = {
      timestamp: new Date().toISOString(),
      metadata: {
        projectsCount: projects?.length || 0,
        magazinesCount: magazines?.length || 0,
      },
      data: {
        projects: projects || [],
        magazines: magazines || [],
      },
    };

    const jsonString = JSON.stringify(backupPayload, null, 2);
    const dateStr = new Date().toISOString().slice(0, 10);
    const key = `backups/db-backup-${dateStr}.json`;

    await r2.send(new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: Buffer.from(jsonString),
      ContentType: 'application/json',
    }));

    console.log(`[${new Date().toISOString()}] Backup completed successfully! Saved to R2 key: ${key}`);
    console.log(`Backed up: ${projects?.length || 0} projects, ${magazines?.length || 0} magazines.`);
  } catch (err) {
    console.error('Backup failed:', err);
    process.exit(1);
  }
}

runBackup();
