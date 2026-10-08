import {
  CreateBucketCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';

import { STORAGE_CONFIG, type StorageConfig } from './storage.config';

const DEFAULT_URL_LIFETIME_SECONDS = 60 * 60;
const DELETE_BATCH = 1000; // the S3 limit per request

@Injectable()
export class StorageService implements OnModuleInit, OnModuleDestroy {
  private readonly client: S3Client;
  // Signing uses the address the browser reaches, which can differ from the one the api uses
  // (for example `http://s3:8333` inside Docker versus `http://localhost:8333` on the host).
  private readonly signer: S3Client;

  constructor(@Inject(STORAGE_CONFIG) private readonly config: StorageConfig) {
    this.client = this.createClient(config.endpoint);
    this.signer = this.createClient(config.publicEndpoint);
  }

  async onModuleInit() {
    if (!this.config.createBucket) return;
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.config.bucket }));
    } catch (error) {
      // Only a missing bucket is created. Anything else (no connection, bad credentials) must surface.
      if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode !== 404)
        throw error;
      await this.client.send(new CreateBucketCommand({ Bucket: this.config.bucket }));
    }
  }

  onModuleDestroy() {
    this.client.destroy();
    this.signer.destroy();
  }

  async upload(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  /** A time-limited link anyone can use. Only hand it to someone who may see the file. */
  getUrl(key: string, options: { expiresIn?: number } = {}): Promise<string> {
    return getSignedUrl(
      this.signer,
      new GetObjectCommand({ Bucket: this.config.bucket, Key: key }),
      {
        expiresIn: options.expiresIn ?? DEFAULT_URL_LIFETIME_SECONDS,
      },
    );
  }

  async deleteMany(keys: string[]): Promise<void> {
    for (let i = 0; i < keys.length; i += DELETE_BATCH) {
      await this.client.send(
        new DeleteObjectsCommand({
          Bucket: this.config.bucket,
          Delete: { Objects: keys.slice(i, i + DELETE_BATCH).map((Key) => ({ Key })), Quiet: true },
        }),
      );
    }
  }

  private createClient(endpoint: string | undefined) {
    return new S3Client({
      region: this.config.region,
      endpoint,
      forcePathStyle: this.config.forcePathStyle,
      credentials: this.config.credentials,
      // Without `throwOnRequestTimeout` the SDK only logs a warning when the timeout passes and keeps waiting.
      requestHandler: {
        connectionTimeout: 5_000,
        requestTimeout: this.config.requestTimeoutMs,
        throwOnRequestTimeout: true,
      },
    });
  }
}
