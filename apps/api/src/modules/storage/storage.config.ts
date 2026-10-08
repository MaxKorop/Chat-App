export const STORAGE_CONFIG = Symbol('STORAGE_CONFIG');

export type StorageConfig = {
  bucket: string;
  region: string;
  /** where the api talks to S3 (SeaweedFS locally; unset on AWS, where the SDK finds S3 itself) */
  endpoint: string | undefined;
  /** the address the BROWSER can reach, used to sign URLs; differs from `endpoint` inside containers */
  publicEndpoint: string | undefined;
  /** unset in production: the SDK then uses the EC2 instance role */
  credentials: { accessKeyId: string; secretAccessKey: string } | undefined;
  forcePathStyle: boolean;
  createBucket: boolean;
  /** the AWS SDK waits forever by default; an unresponsive S3 must not hang uploads */
  requestTimeoutMs: number;
};

type StorageEnv = {
  NODE_ENV: 'development' | 'test' | 'production';
  S3_BUCKET: string;
  S3_REGION: string;
  S3_ENDPOINT?: string | undefined;
  S3_PUBLIC_ENDPOINT?: string | undefined;
  S3_ACCESS_KEY_ID?: string | undefined;
  S3_SECRET_ACCESS_KEY?: string | undefined;
};

export function storageConfigFromEnv(env: StorageEnv): StorageConfig {
  return {
    bucket: env.S3_BUCKET,
    region: env.S3_REGION,
    endpoint: env.S3_ENDPOINT,
    publicEndpoint: env.S3_PUBLIC_ENDPOINT ?? env.S3_ENDPOINT,
    credentials:
      env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY
        ? { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY }
        : undefined,
    forcePathStyle: env.S3_ENDPOINT !== undefined, // a custom endpoint has no DNS name per bucket
    createBucket: env.NODE_ENV !== 'production', // in production the bucket is created once, by hand
    requestTimeoutMs: 30_000,
  };
}
