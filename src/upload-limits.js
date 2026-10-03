// Leave headroom below Vercel's 4.5 MB function request/response limit.
export const MAX_REQUEST_BYTES = 4_000_000;
export function submissionFits(data) {
  return new TextEncoder().encode(JSON.stringify(data)).byteLength <= MAX_REQUEST_BYTES;
}
