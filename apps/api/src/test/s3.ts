import { DeleteObjectsCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';

import { env } from '../config/env';
import { storageConfigFromEnv } from '../modules/storage/storage.config';

/** Deletes everything in the test bucket. Refuses to touch any bucket not named "...-test". */
export async function emptyTestBucket() {
  const config = storageConfigFromEnv(env);
  if (!config.bucket.endsWith('-test'))
    throw new Error(`Refusing to empty "${config.bucket}": not a test bucket`);

  const client = new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: config.forcePathStyle,
    credentials: config.credentials,
  });
  try {
    let token: string | undefined;
    do {
      const page = await client.send(
        new ListObjectsV2Command({ Bucket: config.bucket, ContinuationToken: token }),
      );
      const objects = (page.Contents ?? []).map(({ Key }) => ({ Key }));
      if (objects.length) {
        await client.send(
          new DeleteObjectsCommand({
            Bucket: config.bucket,
            Delete: { Objects: objects, Quiet: true },
          }),
        );
      }
      token = page.NextContinuationToken;
    } while (token);
  } finally {
    client.destroy();
  }
}
