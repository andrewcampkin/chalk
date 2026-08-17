import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

/**
 * Reads and writes one user's backup document.
 *
 * The object key comes from the `sub` claim API Gateway has already validated,
 * never from the request, so a caller cannot reach another user's log however
 * the request is shaped.
 *
 * The document is proxied rather than handed over as a presigned URL. It keeps
 * AWS entirely behind this function, costs one round trip instead of two, and
 * puts the overwrite check somewhere a client cannot skip. The ceiling is
 * Lambda's 6 MB response — thousands of sessions away.
 */

const s3 = new S3Client({});
const BUCKET = process.env.BUCKET;

const json = (statusCode, body, headers = {}) => ({
  statusCode,
  headers: { "content-type": "application/json", ...headers },
  body: JSON.stringify(body),
});

export const handler = async (event) => {
  const sub = event?.requestContext?.authorizer?.jwt?.claims?.sub;
  // Belt and braces: the authorizer should have made this impossible.
  if (!sub) return json(401, { error: "unauthenticated" });

  const key = `users/${sub}/log.json`;
  const method = event.requestContext.http.method;
  const headers = event.headers ?? {};

  try {
    if (method === "GET") return await read(key);
    if (method === "PUT") return await write(key, event, headers);
    return json(405, { error: "method not allowed" });
  } catch (e) {
    console.error(`${method} ${key} failed`, e);
    return json(500, { error: "sync failed" });
  }
};

async function read(key) {
  try {
    const res = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
    return {
      statusCode: 200,
      headers: { "content-type": "application/json", etag: res.ETag },
      body: await res.Body.transformToString(),
    };
  } catch (e) {
    // Nothing backed up yet is an ordinary answer, not a failure.
    if (e?.name === "NoSuchKey") return json(404, { error: "no backup yet" });
    throw e;
  }
}

/**
 * Standard conditional-write semantics, so the app can refuse to clobber a
 * backup another device made:
 *
 *   if-match: "<etag>"  replace exactly that version
 *   if-none-match: *    only if nothing is there yet
 *   neither             overwrite, which the app only sends once the user has
 *                       been shown what they are about to replace
 *
 * Head-then-put rather than an atomic condition: there is a race between the
 * two, and with one writer it does not matter. The bucket is versioned, so the
 * cost of losing that race is a version to roll back to rather than lost data.
 */
async function write(key, event, headers) {
  const ifMatch = headers["if-match"];
  const ifNoneMatch = headers["if-none-match"];

  if (ifMatch || ifNoneMatch) {
    const current = await currentEtag(key);
    if (ifNoneMatch === "*" && current) {
      return json(412, { error: "a backup already exists", etag: current });
    }
    if (ifMatch && ifMatch !== current) {
      return json(412, { error: "the backup moved since you last read it", etag: current });
    }
  }

  const body = event.isBase64Encoded
    ? Buffer.from(event.body ?? "", "base64").toString("utf8")
    : (event.body ?? "");

  // Rejected before it reaches the bucket: a body that is not a Chalk document
  // is a bug or an attack, and either way is not worth storing.
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    return json(400, { error: "body is not JSON" });
  }
  if (parsed?.app !== "chalk" || !Number.isFinite(Number(parsed.version))) {
    return json(400, { error: "body is not a Chalk backup" });
  }

  const res = await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: "application/json",
    }),
  );
  return json(200, { ok: true }, { etag: res.ETag });
}

async function currentEtag(key) {
  try {
    const res = await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    return res.ETag;
  } catch (e) {
    if (e?.name === "NotFound" || e?.$metadata?.httpStatusCode === 404) return null;
    throw e;
  }
}
