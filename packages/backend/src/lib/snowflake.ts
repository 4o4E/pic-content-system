const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const EPOCH = 1704067200000n;

function workerIdFromEnv() {
  const parsed = Number(process.env.SNOWFLAKE_WORKER_ID ?? 0);
  if (!Number.isFinite(parsed)) return 0n;
  return BigInt(Math.max(0, Math.min(Math.trunc(parsed), 1023)));
}

const WORKER_ID = workerIdFromEnv();

let lastTimestamp = 0n;
let sequence = 0n;

function toBase62(value: bigint) {
  if (value === 0n) return "0";
  let current = value;
  let text = "";
  while (current > 0n) {
    text = BASE62[Number(current % 62n)] + text;
    current /= 62n;
  }
  return text;
}

function currentMillis() {
  return BigInt(Date.now());
}

function waitNextMillis(timestamp: bigint) {
  let next = currentMillis();
  while (next <= timestamp) next = currentMillis();
  return next;
}

export function nextSnowflakeId() {
  let timestamp = currentMillis();
  if (timestamp < lastTimestamp) timestamp = lastTimestamp;

  if (timestamp === lastTimestamp) {
    sequence = (sequence + 1n) & 4095n;
    if (sequence === 0n) timestamp = waitNextMillis(lastTimestamp);
  } else {
    sequence = 0n;
  }

  lastTimestamp = timestamp;
  const id = ((timestamp - EPOCH) << 22n) | (WORKER_ID << 12n) | sequence;
  return toBase62(id);
}
