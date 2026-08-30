export function isStorageConfigured() {
  return Boolean(
    process.env.AWS_ACCESS_KEY_ID &&
      process.env.AWS_SECRET_ACCESS_KEY &&
      process.env.AWS_ENDPOINT_URL_S3,
  );
}

export async function uploadDiff(key: string, body: string) {
  if (!isStorageConfigured()) return null;

  const { Files } = await import("files-sdk");
  const { neon } = await import("files-sdk/neon");
  const files = new Files({ adapter: neon({ bucket: "diffs" }) });
  await files.upload(key, body, { contentType: "text/plain" });
  return key;
}

export async function readDiff(key: string) {
  if (!isStorageConfigured()) return null;

  const { Files } = await import("files-sdk");
  const { neon } = await import("files-sdk/neon");
  const files = new Files({ adapter: neon({ bucket: "diffs" }) });
  const stored = await files.download(key);
  return stored.text();
}
