#!/usr/bin/env node
import { createHash, randomUUID } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, renameSync, statSync, unlinkSync } from 'node:fs';
import { mkdir, readFile, rename, rmdir, unlink, writeFile } from 'node:fs/promises';
import { spawn, execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const SCRIPT = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SCRIPT), '..');
const PROFILE = path.join(ROOT, 'work', 'private-pc');
const RUNTIME = path.join(ROOT, 'scripts', 'private-pc-runtime.mjs');
const SCHEDULED_RUNNER = path.join(ROOT, 'scripts', 'private-pc-scheduled-run.ps1');
const TASK_NAME = 'QfrontierPrivatePC';
const BIN = path.join(PROFILE, 'bin', 'cloudflared-2026.10.1.exe');
const TOKEN = path.join(PROFILE, 'secrets', 'tunnel-token.txt');
const STATUS = path.join(PROFILE, 'supervisor-state.json');
const STOP = path.join(PROFILE, 'stop-request.json');
const LOCK = path.join(PROFILE, 'supervisor.lock');
const LOGS = path.join(PROFILE, 'logs');
const ps = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const json = async file => JSON.parse(await readFile(file, 'utf8'));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const normalPath = value => path.resolve(value).toLowerCase();
const now = () => new Date().toISOString();
const ROLE_ARGS = {
  runtime: [RUNTIME, 'run'],
  tunnel: ['tunnel', '--no-autoupdate', '--loglevel', 'info', '--metrics', '127.0.0.1:5181', 'run', '--token-file', TOKEN],
};

// Windows PowerShell 5.1 must build its own module search path. A parent pwsh 7
// session can otherwise make its native Security/CimCmdlets fail to autoload.
/** @param {Record<string, string | undefined>} overrides
 * @param {Record<string, string | undefined>} inherited
 * @returns {Record<string, string | undefined>} */
export function powerShellEnvironment(overrides = {}, inherited = process.env) {
  const environment = { ...inherited, ...overrides };
  for (const name of Object.keys(environment)) if (name.toLowerCase() === 'psmodulepath') delete environment[name];
  return environment;
}

export function splitWindowsCommandLine(line) {
  const args = []; let word = ''; let quoted = false; let active = false;
  for (let i = 0; i < line.length;) {
    if (!quoted && /\s/.test(line[i])) { if (active) { args.push(word); word = ''; active = false; } i++; continue; }
    if (line[i] === '\\') {
      let count = 0; while (line[i] === '\\') { count++; i++; }
      if (line[i] === '"') { word += '\\'.repeat(Math.floor(count / 2)); if (count % 2) word += '"'; else quoted = !quoted; i++; }
      else word += '\\'.repeat(count);
      active = true; continue;
    }
    if (line[i] === '"') { quoted = !quoted; active = true; i++; continue; }
    word += line[i++]; active = true;
  }
  if (active) args.push(word);
  return args;
}
export function sanitizeLogText(value) {
  // Strip terminal control sequences before writing bounded plain-text logs.
  return String(value).replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '').replace(/\b(?:eyJ)[A-Za-z0-9_.=-]{20,}/g, '[REDACTED_TOKEN]')
    .replace(/((?:authorization|cf_authorization|cf-access-jwt-assertion|client_secret|access_token|token)\s*[=:]\s*)(?:Bearer\s+)?[^\s,;&]+/gi, '$1[REDACTED]')
    .replace(/([?&](?:meta|kid|token|jwt|code|access_token)=)[^&\s]+/gi, '$1[REDACTED]').slice(0, 4096);
}
export function retryDelay(attempts, at, maxAttempts = 5, windowMs = 600_000) {
  const recent = attempts.filter(time => time > at - windowMs);
  return { allowed: recent.length < maxAttempts, delayMs: [1000, 2000, 5000, 10_000, 30_000][Math.min(recent.length, 4)], attempts: recent };
}
export function identityMatches(observed, expected) {
  if (!observed || !expected || observed.pid !== expected.pid || observed.createdAt !== expected.createdAt || typeof observed.commandLine !== 'string' || !observed.executable || !expected.executable || !Array.isArray(expected.args)) return false;
  if (normalPath(observed.executable) !== normalPath(expected.executable)) return false;
  const actual = splitWindowsCommandLine(observed.commandLine);
  const wanted = [expected.executable, ...expected.args];
  return actual.length === wanted.length && actual.every((arg, index) => index === 0 || (index === 1 && expected.executable.toLowerCase().endsWith('node.exe')) ? normalPath(arg) === normalPath(wanted[index]) : arg === wanted[index]);
}
export function validateScheduledSupervisorTask(task) {
  if (task === null) return null;
  assert(task && task.name === TASK_NAME && task.taskPath === '\\' && task.actionCount === 1, 'An unrelated scheduled task must not be controlled.');
  assert(typeof task.userSid === 'string' && /^S-1-/.test(task.userSid) && task.userSid === task.currentUserSid && task.logonType === 'Interactive' && task.runLevel === 'Limited', 'The scheduled supervisor must run only as the current interactive user without elevation.');
  assert(typeof task.executable === 'string' && typeof task.arguments === 'string' && typeof task.workingDirectory === 'string' && normalPath(task.workingDirectory) === normalPath(ROOT), 'The scheduled supervisor working directory is unexpected.');
  const args = splitWindowsCommandLine(task.arguments);
  if (normalPath(task.executable) === normalPath(ps) && JSON.stringify(args) === JSON.stringify(['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'RemoteSigned', '-File', SCHEDULED_RUNNER])) return 'foreground';
  if (normalPath(task.executable) === normalPath(ps) && JSON.stringify(args) === JSON.stringify(['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-File', SCHEDULED_RUNNER])) return 'legacy';
  if (normalPath(task.executable) === normalPath(process.execPath) && args.length === 2 && normalPath(args[0]) === normalPath(SCRIPT) && ['start', 'run'].includes(args[1])) return 'legacy';
  throw new Error('A different scheduled task already uses QfrontierPrivatePC; it will not be started or stopped.');
}
async function scheduledSupervisorTask() {
  const command = '$ErrorActionPreference="Stop"; $t=Get-ScheduledTask -TaskName "QfrontierPrivatePC" -TaskPath "\\" -ErrorAction SilentlyContinue; if($null -eq $t){Write-Output "null";exit 0}; $sid=if($t.Principal.UserId -like "S-1-*"){[string]$t.Principal.UserId}else{([System.Security.Principal.NTAccount]$t.Principal.UserId).Translate([System.Security.Principal.SecurityIdentifier]).Value}; [pscustomobject]@{name=$t.TaskName;taskPath=$t.TaskPath;actionCount=@($t.Actions).Count;executable=[string]$t.Actions[0].Execute;arguments=[string]$t.Actions[0].Arguments;workingDirectory=[string]$t.Actions[0].WorkingDirectory;userSid=$sid;currentUserSid=[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value;logonType=[string]$t.Principal.LogonType;runLevel=[string]$t.Principal.RunLevel} | ConvertTo-Json -Compress';
  const result = await exec(ps, ['-NoProfile', '-NonInteractive', '-Command', command], {windowsHide:true,timeout:10_000,maxBuffer:16_384,env:powerShellEnvironment()});
  const task = JSON.parse(result.stdout.replace(/^\uFEFF/, '').trim());
  return {task,mode:validateScheduledSupervisorTask(task)};
}
async function controlScheduledSupervisor(action) {
  assert(['start', 'stop'].includes(action), 'Invalid scheduled supervisor action.');
  const selected = await scheduledSupervisorTask();
  assert(selected.mode === 'foreground', 'The foreground scheduled supervisor is not installed.');
  const cmdlet = action === 'start' ? 'Start-ScheduledTask' : 'Stop-ScheduledTask';
  await exec(ps, ['-NoProfile', '-NonInteractive', '-Command', `$ErrorActionPreference="Stop"; ${cmdlet} -TaskName "QfrontierPrivatePC" -TaskPath "\\"`], {windowsHide:true,timeout:15_000,maxBuffer:16_384,env:powerShellEnvironment()});
}
export async function validatePrivateOriginResponse(response) {
  assert(response.status === 401, `Unexpected anonymous local HTTP status ${response.status}; the tunnel must stay stopped.`);
  const cache = response.headers.get('cache-control') ?? '';
  assert(/(?:^|,)\s*private\s*(?:,|$)/i.test(cache) && /(?:^|,)\s*no-store\s*(?:,|$)/i.test(cache), 'The private origin does not prohibit caching.');
  assert(response.headers.get('content-type')?.toLowerCase().startsWith('text/plain') && response.headers.get('x-content-type-options')?.toLowerCase() === 'nosniff', 'The private origin response headers are unexpected.');
  assert(response.body, 'The private origin response has no body.');
  const reader = response.body.getReader(); const chunks = []; let size = 0;
  try {
    for (;;) {
      const item = await reader.read(); if (item.done) break;
      size += item.value.byteLength; assert(size <= 256, 'The anonymous origin returned unexpected content.'); chunks.push(item.value);
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  assert(new TextDecoder().decode(bytes) === 'Se requiere acceso autorizado.', 'The anonymous origin returned unexpected content.');
  return true;
}
// This probe never authenticates or loads game data. A working wrapper PID does
// not prove that its nested workerd process is still accepting HTTP requests.
export async function probePrivateOrigin(fetcher = fetch) {
  let response;
  try {
    response = await fetcher('http://127.0.0.1:5180/', { method: 'GET', redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(3000), headers: { Accept: 'text/plain' } });
  } catch (error) {
    if (error instanceof TypeError || ['TimeoutError', 'AbortError'].includes(error?.name)) return { status: 'unavailable', reason: 'connection-unavailable' };
    throw error;
  }
  if (response.status === 503) { await response.body?.cancel().catch(() => {}); return { status: 'unavailable', reason: 'http-503' }; }
  try { await validatePrivateOriginResponse(response); return { status: 'healthy', anonymousStatus: 401 }; }
  catch { return { status: 'unsafe', reason: 'private-origin-guard-failed', anonymousStatus: response.status }; }
  finally { if (!response.body?.locked) await response.body?.cancel().catch(() => {}); }
}
export function originWatchdogDecision(previousFailures, result) {
  assert(Number.isSafeInteger(previousFailures) && previousFailures >= 0, 'Invalid availability failure counter.');
  if (result?.status === 'healthy') return { failures: 0, action: 'none' };
  if (result?.status === 'unsafe') return { failures: 0, action: 'shutdown' };
  assert(result?.status === 'unavailable', 'Unexpected origin availability result.');
  const failures = previousFailures + 1;
  return failures >= 3 ? { failures: 0, action: 'recover' } : { failures, action: 'none' };
}
async function atomicJson(file, data) {
  const temporary = `${file}.${process.pid}.${randomUUID().slice(0, 8)}.tmp`;
  await writeFile(temporary, `${JSON.stringify(data, null, 2)}\n`, { flag: 'wx' });
  await rename(temporary, file);
}
function log(role, text) {
  mkdirSync(LOGS, { recursive: true });
  const file = path.join(LOGS, `${role}.log`);
  if (existsSync(file) && statSync(file).size > 5 * 1024 * 1024) {
    if (existsSync(`${file}.3`)) unlinkSync(`${file}.3`);
    for (const index of [2, 1]) if (existsSync(`${file}.${index}`)) renameSync(`${file}.${index}`, `${file}.${index + 1}`);
    renameSync(file, `${file}.1`);
  }
  appendFileSync(file, `${now()} ${sanitizeLogText(text).replaceAll('\r', '').replaceAll('\n', ' ')}\n`);
}
function pipeLogs(stream, role) {
  let buffer = '';
  stream.on('data', chunk => {
    buffer += chunk.toString();
    while (buffer.includes('\n')) { const end = buffer.indexOf('\n'); log(role, buffer.slice(0, end)); buffer = buffer.slice(end + 1); }
    if (buffer.length > 8192) { log(role, buffer.slice(0, 4096)); buffer = ''; }
  });
  stream.on('end', () => { if (buffer) log(role, buffer); });
}
async function inspectProcess(pid) {
  assert(Number.isSafeInteger(pid) && pid > 0, 'Invalid process ID.');
  const command = '$ErrorActionPreference="Stop"; $p=Get-CimInstance Win32_Process -Filter ("ProcessId = " + $env:QFRONTIER_PC_PID); if($null -eq $p){Write-Output "null"; exit 0}; [pscustomobject]@{pid=[int]$p.ProcessId;parentPid=[int]$p.ParentProcessId;executable=[string]$p.ExecutablePath;commandLine=[string]$p.CommandLine;createdAt=$p.CreationDate.ToUniversalTime().ToString("o")} | ConvertTo-Json -Compress';
  const result = await exec(ps, ['-NoProfile', '-NonInteractive', '-Command', command], { windowsHide: true, timeout: 10_000, maxBuffer: 32_768, env: powerShellEnvironment({ QFRONTIER_PC_PID: String(pid) }) });
  return JSON.parse(result.stdout.replace(/^\uFEFF/, '').trim());
}
async function capturedIdentity(pid, executable, args) {
  for (let i = 0; i < 10; i++) {
    const observed = await inspectProcess(pid);
    if (observed) { const expected = { pid, createdAt: observed.createdAt, executable, args }; assert(identityMatches(observed, expected), 'Process identity could not be verified.'); return expected; }
    await pause(100);
  }
  throw new Error('Child process ended before its identity could be verified.');
}
async function verified(identity) { return !!identity && identityMatches(await inspectProcess(identity.pid), identity); }
async function terminateTree(identity) {
  if (!identity || !await verified(identity)) return false;
  await exec(path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'taskkill.exe'), ['/PID', String(identity.pid), '/T', '/F'], { windowsHide: true, timeout: 15_000, maxBuffer: 16_384 }).catch(async error => { if (await verified(identity)) throw error; });
  return true;
}
async function tokenPermissions() {
  const command = '$ErrorActionPreference="Stop"; $acl=Get-Acl -LiteralPath $env:QFRONTIER_PC_TOKEN_FILE; $me=[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value; $allowed=@($me,"S-1-5-18","S-1-5-32-544"); $owner=([System.Security.Principal.NTAccount]$acl.Owner).Translate([System.Security.Principal.SecurityIdentifier]).Value; $bad=@($acl.Access | Where-Object { $_.AccessControlType -eq "Allow" -and $_.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value -notin $allowed }); [pscustomobject]@{safe=($owner -in $allowed -and $bad.Count -eq 0);unexpectedRules=$bad.Count} | ConvertTo-Json -Compress';
  const result = await exec(ps, ['-NoProfile', '-NonInteractive', '-Command', command], { windowsHide: true, timeout: 10_000, maxBuffer: 16_384, env: powerShellEnvironment({ QFRONTIER_PC_TOKEN_FILE: TOKEN }) });
  assert(JSON.parse(result.stdout.replace(/^\uFEFF/, '').trim()).safe === true, 'The tunnel token file has unsafe Windows permissions. Restrict it to this user, SYSTEM and Administrators.');
}
async function preflight() {
  assert(process.platform === 'win32', 'This supervisor is configured for Windows.');
  const settings = await json(path.join(PROFILE, 'settings.json'));
  assert(settings.port === 5180, 'The private supervisor expects runtime port 5180.');
  const installation = await json(path.join(PROFILE, 'installation.json'));
  assert(installation.version === '2026.10.1' && installation.officialDigestVerified === true && typeof installation.sha256 === 'string' && /^[a-f0-9]{64}$/i.test(installation.sha256), 'Portable cloudflared installation metadata is missing or unrecognized.');
  assert(typeof installation.path === 'string' && normalPath(installation.path) === normalPath(BIN), 'The portable cloudflared path does not match the private profile.');
  assert(sha256(await readFile(BIN)) === installation.sha256.toLowerCase(), 'Portable cloudflared checksum mismatch.');
  const tokenStat = statSync(TOKEN); assert(tokenStat.isFile() && tokenStat.size > 20 && tokenStat.size < 32_768, 'The protected tunnel token file is missing or invalid.');
  await tokenPermissions();
  const result = await exec(process.execPath, [RUNTIME, 'check'], { cwd: ROOT, windowsHide: true, timeout: 60_000, maxBuffer: 65_536 });
  const runtime = JSON.parse(result.stdout);
  assert(runtime.ok === true && runtime.remoteBindings === false && runtime.loopbackOnly === true && runtime.localOrigin === 'http://127.0.0.1:5180', 'Local runtime preflight failed.');
  return { hostname: runtime.hostname, buildSha256: runtime.buildSha256, compatibilityDate: runtime.effectiveCompatibilityDate, localCompatibilityOverride: runtime.localCompatibilityOverride };
}
export function validateSupervisorState(state) {
  assert(state && state.version === 1 && /^[a-f0-9-]{36}$/.test(state.generation), 'Invalid private supervisor state.');
  const identityShape = (identity, executable, args) => {
    assert(identity && Number.isSafeInteger(identity.pid) && identity.pid > 0 && typeof identity.createdAt === 'string' && typeof identity.executable === 'string', 'Invalid recorded process identity.');
    assert(normalPath(identity.executable) === normalPath(executable) && JSON.stringify(identity.args) === JSON.stringify(args), 'The state references an unrelated process; no process will be stopped.');
  };
  assert(state.launchMode === undefined || state.launchMode === 'detached' || state.launchMode === 'foreground', 'Invalid supervisor launch mode.');
  identityShape(state.supervisor, process.execPath, state.launchMode === 'foreground' ? [SCRIPT, 'run'] : [SCRIPT, 'serve', state.generation]);
  for (const role of Object.keys(state.children ?? {})) {
    assert(role === 'runtime' || role === 'tunnel', 'Unrecognized supervisor child role.');
    identityShape(state.children[role], role === 'runtime' ? process.execPath : BIN, ROLE_ARGS[role]);
  }
  return state;
}
async function readState() { try { return validateSupervisorState(await json(STATUS)); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } }
async function summary() {
  const state = await readState();
  if (!state) return { running: false, state: 'not-started', localOrigin: 'http://127.0.0.1:5180' };
  const supervisor = await verified(state.supervisor);
  const children = {};
  for (const role of ['runtime', 'tunnel']) children[role] = { pid: state.children?.[role]?.pid ?? null, verified: await verified(state.children?.[role]) };
  return { running: supervisor && children.runtime.verified && children.tunnel.verified && state.phase === 'running' && state.originHealth?.healthy !== false, state: supervisor ? state.phase : 'stopped', generation: state.generation, supervisorPid: state.supervisor?.pid, supervisorVerified: supervisor, children, hostname: state.hostname, localOrigin: 'http://127.0.0.1:5180', metrics: 'http://127.0.0.1:5181', updatedAt: state.updatedAt, originHealth: state.originHealth ?? null, lastFailure: state.lastFailure ?? null, logs: LOGS };
}
async function cleanupStaleLock() {
  try {
    const owner = await json(path.join(LOCK, 'owner.json'));
    assert(!await verified(owner.supervisor), 'The private PC supervisor is already running.');
    await unlink(path.join(LOCK, 'owner.json')); await rmdir(LOCK);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    if (existsSync(LOCK)) assert(Date.now() - statSync(LOCK).mtimeMs > 60_000, 'The private supervisor is starting; retry status in a moment.');
    await rmdir(LOCK).catch(failure => { if (failure.code !== 'ENOENT') throw failure; });
  }
}
async function stop() {
  const scheduled = await scheduledSupervisorTask();
  const state = await readState();
  if (!state) { if(scheduled.mode==='foreground')await controlScheduledSupervisor('stop'); console.log(JSON.stringify({ stopped: true, alreadyStopped: true })); return; }
  if (await verified(state.supervisor)) {
    await atomicJson(STOP, { generation: state.generation, requestedAt: now() });
    for (let i = 0; i < 30; i++) { await pause(500); if (!await verified(state.supervisor)) break; }
    if (await verified(state.supervisor)) await terminateTree(state.supervisor);
  }
  for (const role of ['tunnel', 'runtime']) await terminateTree(state.children?.[role]);
  if (scheduled.mode === 'foreground') await controlScheduledSupervisor('stop');
  await cleanupStaleLock();
  console.log(JSON.stringify({ stopped: true, generation: state.generation }));
}
async function start() {
  const current = await summary();
  if (current.supervisorVerified) { console.log(JSON.stringify(current, null, 2)); return; }
  const scheduled = await scheduledSupervisorTask();
  if (scheduled.mode === 'foreground') {
    await controlScheduledSupervisor('start');
    for (let i=0;i<100;i++) { await pause(500); const result=await summary(); if(result.running){console.log(JSON.stringify(result,null,2));return;} }
    throw new Error('The Windows foreground supervisor did not become ready. Inspect its sanitized logs.');
  }
  await preflight();
  const previous = await readState();
  if (previous) for (const role of ['tunnel', 'runtime']) await terminateTree(previous.children?.[role]);
  await cleanupStaleLock();
  const generation = randomUUID();
  const child = spawn(process.execPath, [SCRIPT, 'serve', generation], { cwd: ROOT, stdio: 'ignore', detached: true, windowsHide: true });
  let spawnFailure = null; let daemonExit = null;
  child.on('error', error => { spawnFailure = error.message; });
  child.on('exit', code => { daemonExit = code; });
  child.unref();
  for (let i = 0; i < 90; i++) {
    await pause(500); const state = await readState();
    if (state?.generation === generation && ['running', 'failed'].includes(state.phase)) { console.log(JSON.stringify(await summary(), null, 2)); assert(state.phase === 'running', 'The private PC supervisor failed; inspect its sanitized logs.'); return; }
    assert(spawnFailure === null && daemonExit === null, 'The supervisor ended before startup; inspect its sanitized logs.');
  }
  throw new Error('The supervisor did not report ready within 45 seconds. Inspect status before starting again.');
}
async function serve(generation, launchMode = 'detached') {
  assert(/^[a-f0-9-]{36}$/.test(generation), 'A valid supervisor generation is required.');
  await mkdir(PROFILE, { recursive: true });
  await mkdir(LOCK);
  const args = launchMode === 'foreground' ? [SCRIPT, 'run'] : [SCRIPT, 'serve', generation];
  const identity = await capturedIdentity(process.pid, process.execPath, args);
  await atomicJson(path.join(LOCK, 'owner.json'), { supervisor: identity, generation });
  let stopping = false; let finalCode = 0; const children = new Map(); const retries = { runtime: [], tunnel: [] };
  const intentionallyStopped = new WeakSet(); const pendingRecovery = new Map(); let recovering = false;
  let state = { version: 1, generation, launchMode, phase: 'starting', supervisor: identity, children: {}, updatedAt: now() };
  let saveQueue = Promise.resolve();
  async function save() { state.updatedAt = now(); const snapshot = structuredClone(state); saveQueue = saveQueue.then(() => atomicJson(STATUS, snapshot)); await saveQueue; }
  async function shutdown(reason, code = 0) {
    if (stopping) return; stopping = true; finalCode = code;
    state.phase = code ? 'failed' : 'stopping'; state.lastFailure = code ? reason : null; await save(); log('supervisor', JSON.stringify({ event: 'stopping', reason }));
    for (const role of ['tunnel', 'runtime']) await terminateTree(children.get(role)?.identity);
    state.phase = code ? 'failed' : 'stopped'; await save();
    await unlink(path.join(LOCK, 'owner.json')).catch(() => {}); await rmdir(LOCK).catch(() => {});
  }
  async function launch(role) {
    if (stopping) return;
    const executable = role === 'runtime' ? process.execPath : BIN;
    const child = spawn(executable, ROLE_ARGS[role], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    pipeLogs(child.stdout, role); pipeLogs(child.stderr, role);
    child.on('error', error => { log('supervisor', `${role} spawn failed: ${error.message}`); });
    let exitInfo = null; let registered = false;
    child.on('exit', (code, signal) => {
      exitInfo = { code, signal };
      if (!registered || stopping || intentionallyStopped.has(child) || children.get(role)?.process !== child) return;
      void recover(role, code, signal).catch(error => { log('supervisor', error.message); void shutdown('Supervisor recovery failed', 1); });
    });
    let childIdentity;
    try { childIdentity = await capturedIdentity(child.pid, executable, ROLE_ARGS[role]); }
    catch (error) { child.kill(); throw error; }
    if (stopping) { await terminateTree(childIdentity); return; }
    children.set(role, { process: child, identity: childIdentity }); state.children[role] = childIdentity; await save();
    assert(exitInfo === null, `${role} ended during startup.`);
    registered = true;
    log('supervisor', JSON.stringify({ event: 'child_started', role, pid: child.pid }));
  }
  async function stopChild(role) {
    const current = children.get(role);
    if (!current) return;
    intentionallyStopped.add(current.process); children.delete(role); delete state.children[role];
    await terminateTree(current.identity); await save();
  }
  async function recover(role, code, signal) {
    if (stopping) return;
    pendingRecovery.set(role, { code, signal });
    if (recovering) return;
    recovering = true;
    try {
      while (!stopping && pendingRecovery.size) {
        const selected = pendingRecovery.has('runtime') ? 'runtime' : 'tunnel';
        const cause = pendingRecovery.get(selected); pendingRecovery.delete(selected);
        log('supervisor', JSON.stringify({ event: 'child_recovery', role: selected, ...cause }));
        const policy = retryDelay(retries[selected], Date.now()); retries[selected] = policy.attempts;
        if (!policy.allowed) { await shutdown(`${selected} exceeded five restarts in ten minutes`, 1); return; }
        retries[selected].push(Date.now()); state.phase = 'recovering'; await save();
        // Never expose a restarted origin until it passes the complete private
        // response guard. Only exact recorded process trees may be terminated.
        if (selected === 'runtime') { pendingRecovery.delete('tunnel'); await stopChild('tunnel'); }
        await stopChild(selected);
        await pause(policy.delayMs); if (stopping) return;
        if (selected === 'runtime') {
          await launch('runtime');
          if (!await waitForPrivateOrigin()) return;
          await launch('tunnel');
        } else {
          const origin = await probePrivateOrigin();
          if (origin.status === 'unsafe') { await shutdown('The private origin response guard failed', 1); return; }
          if (origin.status === 'unavailable') { pendingRecovery.set('runtime', { code: null, signal: 'origin-unavailable' }); continue; }
          await launch('tunnel');
        }
        state.originHealth = { healthy: true, checkedAt: now(), consecutiveFailures: 0 };
        state.phase = 'running'; await save();
      }
    } catch (error) { await shutdown(`Private recovery failed: ${error.message}`, 1); }
    finally { recovering = false; }
  }
  async function waitForPrivateOrigin() {
    const deadline = Date.now() + 45_000;
    let lastStatus = 'not-listening';
    while (Date.now() < deadline && !stopping) {
      const runtime = children.get('runtime')?.process;
      assert(runtime && runtime.exitCode === null && runtime.signalCode === null, 'The local runtime ended before its private HTTP response was ready.');
      let response;
      try {
        response = await fetch('http://127.0.0.1:5180/', { method: 'GET', redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(Math.min(2000, Math.max(1, deadline - Date.now()))), headers: { Accept: 'text/plain' } });
      } catch (error) {
        if (!(error instanceof TypeError) && !['TimeoutError', 'AbortError'].includes(error.name)) throw error;
        lastStatus = 'not-listening';
      }
      if (response) {
        lastStatus = String(response.status);
        if (response.status === 503) await response.body?.cancel();
        else {
          try { await validatePrivateOriginResponse(response); }
          finally { if (!response.body?.locked) await response.body?.cancel().catch(() => {}); }
          log('supervisor', JSON.stringify({ event: 'private_origin_ready', anonymousStatus: 401, cachePrivate: true, noStore: true }));
          return true;
        }
      }
      await pause(Math.min(1000, Math.max(1, deadline - Date.now())));
    }
    if (stopping) return false;
    throw new Error(`The private local origin did not become ready within 45 seconds (last state ${lastStatus}); the tunnel stayed stopped.`);
  }
  try {
    Object.assign(state, await preflight()); await save();
    await launch('runtime'); if (stopping) return;
    if (!await waitForPrivateOrigin()) return;
    await launch('tunnel'); if (stopping) return;
    state.originHealth = { healthy: true, checkedAt: now(), consecutiveFailures: 0 };
    state.phase = 'running'; await save();
    let nextOriginProbe = Date.now() + 15_000; let originFailures = 0;
    for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { void shutdown(signal); });
    while (!stopping) {
      try { const request = await json(STOP); if (request.generation === generation) { await shutdown('requested'); break; } } catch (error) { if (error.code !== 'ENOENT') log('supervisor', 'Ignored malformed stop request.'); }
      if (state.phase === 'running' && !recovering && Date.now() >= nextOriginProbe) {
        const result = await probePrivateOrigin(), decision = originWatchdogDecision(originFailures, result);
        originFailures = decision.failures; nextOriginProbe = Date.now() + 15_000;
        state.originHealth = { healthy: result.status === 'healthy', checkedAt: now(), consecutiveFailures: originFailures, result: result.status }; await save();
        if (result.status !== 'healthy') log('supervisor', JSON.stringify({ event: 'private_origin_probe', ...result, action: decision.action, consecutiveFailures: originFailures }));
        if (decision.action === 'shutdown') { await shutdown('The private origin response guard failed', 1); break; }
        if (decision.action === 'recover') await recover('runtime', null, 'origin-watchdog');
      }
      await pause(500);
    }
  } catch (error) { await shutdown(error.message, 1); }
  process.exitCode = finalCode;
}
async function main() {
  const action = process.argv[2] ?? 'status';
  try {
    assert(process.platform === 'win32', 'This supervisor is configured for Windows.');
    if (action === 'serve') { assert(process.argv.length === 4, 'Internal serve needs one generation.'); await serve(process.argv[3]); }
    else if (action === 'run') {
      assert(process.argv.length === 3, 'Foreground run does not accept extra arguments.');
      const current=await summary();
      if(current.supervisorVerified){console.log(JSON.stringify(current,null,2));return;}
      await preflight();
      const previous=await readState();
      if(previous)for(const role of ['tunnel','runtime'])await terminateTree(previous.children?.[role]);
      await cleanupStaleLock();
      await serve(randomUUID(),'foreground');
    }
    else {
      assert(process.argv.length <= 3, 'Unexpected command arguments.');
      if (action === 'status') console.log(JSON.stringify(await summary(), null, 2));
      else if (action === 'start') await start();
      else if (action === 'stop') await stop();
      else if (action === 'restart') { await stop(); await start(); }
      else throw new Error('Use start, stop, status or restart.');
    }
  } catch (error) { console.error(`Private PC supervisor: ${sanitizeLogText(error.message)}`); process.exitCode = 1; }
}
if (process.argv[1] && normalPath(process.argv[1]) === normalPath(SCRIPT)) await main();
