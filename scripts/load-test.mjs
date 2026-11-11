// Run inside Docker on a disposable assessment database. Creates test classes/holds.
import http from 'node:http';
import dns from 'node:dns/promises';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { performance, monitorEventLoopDelay } from 'node:perf_hooks';

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, i, all) => {
  if (value.startsWith('--')) pairs.push([value.slice(2), all[i + 1]]);
  return pairs;
}, []));
if (args.exercise !== 'yes') throw new Error('Pass --exercise yes only for a disposable database.');
const bases = (args.bases || 'http://backend:8080').split(',').map((base) => new URL(base));
const count = Number(args.count || 10000);
const seats = Number(args.seats || 5);
const timeoutMs = Number(args.timeout || 10000);
if (![count, seats, timeoutMs].every((n) => Number.isSafeInteger(n) && n > 0)) throw new Error('Invalid count, seats or timeout');
const addresses = new Map(await Promise.all(bases.map(async (base) => [base.hostname, (await dns.lookup(base.hostname, { family: 4 })).address])));
const agent = new http.Agent({ keepAlive: false, maxSockets: count, maxTotalSockets: count });
let openSockets = 0;
let peakOpenSockets = 0;
let connected = 0;

function send(base, method, path, body, student, deadline = timeoutMs, instrument = false) {
  return new Promise((resolve) => {
    const started = performance.now();
    let settled = false;
    let phase = 'connecting';
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const request = http.request({
      hostname: addresses.get(base.hostname), port: base.port || 80,
      path: base.pathname.replace(/\/$/, '') + path, method, agent,
      headers: { Host: base.host, 'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
        ...(student ? { 'X-Student-Id': student } : {}) },
    });
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ...result, latencyMs: performance.now() - started, phase });
    };
    const timer = setTimeout(() => {
      finish({ error: 'CLIENT_TIMEOUT' });
      request.destroy();
    }, deadline);
    request.on('socket', (socket) => {
      socket.once('connect', () => {
        phase = 'waiting_for_response';
        if (instrument) {
          connected++;
          openSockets++;
          peakOpenSockets = Math.max(peakOpenSockets, openSockets);
          socket.once('close', () => openSockets--);
        }
      });
    });
    request.on('response', (response) => {
      phase = 'reading_response';
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        const raw = Buffer.concat(chunks).toString();
        let data;
        try { data = raw ? JSON.parse(raw) : null; } catch { data = raw.slice(0, 300); }
        finish({ status: response.statusCode, data });
      });
      response.on('error', (error) => finish({ error: error.code || error.message }));
      response.on('aborted', () => finish({ error: 'RESPONSE_ABORTED' }));
    });
    request.on('error', (error) => finish({ error: error.code || error.message }));
    request.end(payload);
  });
}

const setup = await send(bases[0], 'POST', '/classes', { name: 'Load warmup ' + Date.now(), totalSeats: 1 }, undefined, 60000);
if (setup.status !== 201) throw new Error('Warmup class failed: ' + JSON.stringify(setup));
for (let i = 0; i < 20; i++) {
  const result = await send(bases[i % bases.length], 'POST', `/classes/${setup.data.id}/holds`, {}, '20269999999999999', 30000);
  if (![201, 409].includes(result.status)) throw new Error('Warmup failed: ' + JSON.stringify(result));
}
const created = await send(bases[0], 'POST', '/classes', { name: `Load ${count} ${timeoutMs}ms ${Date.now()}`, totalSeats: seats }, undefined, 60000);
if (created.status !== 201) throw new Error('Class setup failed: ' + JSON.stringify(created));
const classId = created.data.id;
const lag = monitorEventLoopDelay({ resolution: 20 });
lag.enable();
console.log(JSON.stringify({ event: 'burst_start', count, seats, timeoutMs, bases: bases.map(String), classId }));
const startedAt = new Date().toISOString();
const start = performance.now();
const cpuStart = process.cpuUsage();
const requests = Array.from({ length: count }, (_, i) => send(bases[i % bases.length], 'POST', `/classes/${classId}/holds`, {}, `202611${String(i).padStart(11, '0')}`, timeoutMs, true));
const dispatchSpanMs = performance.now() - start;
const results = await Promise.all(requests);
const elapsedMs = performance.now() - start;
const cpu = process.cpuUsage(cpuStart);
lag.disable();
const statuses = {};
const errors = {};
const errorPhases = {};
const samples = {};
const latencies = [];
const winners = [];
for (const result of results) {
  if (result.status) {
    statuses[result.status] = (statuses[result.status] || 0) + 1;
    latencies.push(result.latencyMs);
    if (result.status === 201) winners.push(result.data.holdId);
    if (![201, 409].includes(result.status)) samples[result.status] ??= result.data;
  } else {
    errors[result.error] = (errors[result.error] || 0) + 1;
    errorPhases[result.phase] = (errorPhases[result.phase] || 0) + 1;
  }
}
latencies.sort((a, b) => a - b);
const percentile = (p) => latencies.length ? Math.round(latencies[Math.ceil(p * latencies.length) - 1]) : null;
// Let request cancellations drain before checking authoritative stored capacity.
await new Promise((resolve) => setTimeout(resolve, 2000));
let state;
for (let attempt = 0; attempt < 4; attempt++) {
  state = await send(bases[0], 'GET', `/classes/${classId}`, undefined, undefined, 30000);
  if (state.status === 200) break;
}
const summary = {
  startedAt, count, seats, timeoutMs, bases: bases.map(String), classId,
  dispatchSpanMs: Math.round(dispatchSpanMs), elapsedMs: Math.round(elapsedMs),
  httpResponses: latencies.length, statuses, clientErrors: errors, clientErrorPhases: errorPhases,
  httpLatencyMs: { p50: percentile(.5), p95: percentile(.95), p99: percentile(.99), max: latencies.length ? Math.round(latencies.at(-1)) : null },
  within10Seconds: results.filter((r) => r.status && r.latencyMs <= 10000).length,
  connectedSockets: connected, peakConnectedSockets: peakOpenSockets,
  generator: { node: process.version, cpuMs: Math.round((cpu.user + cpu.system) / 1000),
    eventLoopLagP99Ms: Math.round(lag.percentile(99) / 1e6), eventLoopLagMaxMs: Math.round(lag.max / 1e6), rssMiB: Math.round(process.memoryUsage().rss / 1024 / 1024) },
  errorSamples: samples, finalState: state.status === 200 ? state.data : state,
  capacityInvariant: state.status === 200 && state.data.heldSeats + state.data.confirmedSeats <= state.data.totalSeats,
  acknowledgedHolds: winners,
};
summary.responseContractPassed = summary.capacityInvariant &&
  (statuses[201] || 0) === Math.min(count, seats) &&
  (statuses[409] || 0) === Math.max(0, count - seats) &&
  latencies.length === count && Object.keys(errors).length === 0 &&
  results.every((result) => result.latencyMs <= timeoutMs);
const output = args.output || `.local/load-tests/load-${Date.now()}.json`;
await mkdir(dirname(output), { recursive: true });
await writeFile(output, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
agent.destroy();
if (!summary.capacityInvariant || (args.assert === 'yes' && !summary.responseContractPassed)) process.exitCode = 2;
