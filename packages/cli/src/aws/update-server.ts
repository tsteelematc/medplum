import { getServerVersions } from './utils';
import { configFileName, readConfig, writeConfig } from '../utils';
import { MedplumInfraConfig } from '@medplum/core';
import * as semver from 'semver';
import { spawnSync } from 'child_process';
import { createMedplumClient } from '../util/client';

/**
 * The AWS "update-server" command updates the Medplum server in a Medplum CloudFormation stack.
 * @param tag The Medplum stack tag.
 * @param options Client options
 */
export async function updateServerCommand(tag: string, options: any): Promise<void> {
  const client = await createMedplumClient(options);
  const config = readConfig(tag) as MedplumInfraConfig;
  if (!config) {
    console.log('Config not found');
    return;
  }
  const separatorIndex = config.serverImage.lastIndexOf(':');
  const initialVersion = config.serverImage.slice(separatorIndex + 1);
  let updateVersion = await nextUpdateVersion(initialVersion);
  while (updateVersion) {
    console.log(`Performing update to v${updateVersion}`);
    config.serverImage = `${config.serverImage.slice(0, separatorIndex)}:${updateVersion}`;
    deployServerUpdate(tag, config);
    // Run data migrations
    await client.post('/admin/super/migrate', '');

    updateVersion = await nextUpdateVersion(updateVersion);
  }
}

async function nextUpdateVersion(currentVersion: string): Promise<string | undefined> {
  return (await getServerVersions(currentVersion))
    .filter((v) => semver.gte(v, semver.inc(currentVersion, 'minor') as string))
    .pop();
}

function deployServerUpdate(tag: string, config: MedplumInfraConfig): void {
  const configFile = configFileName(tag);
  writeConfig(config, tag);

  const cmd = `npx cdk deploy -c config=${configFile}${config.region !== 'us-east-1' ? ' --all' : ''}`;
  console.log('> ' + cmd);
  const deploy = spawnSync(cmd);

  if (deploy.status !== 0) {
    throw new Error(`Deploy of ${config.serverImage} failed (exit code ${deploy.status}): ${deploy.stderr}`);
  }
  console.log(deploy.stdout);
}
