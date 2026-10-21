import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { identityMatches, powerShellEnvironment, retryDelay, sanitizeLogText, splitWindowsCommandLine, validatePrivateOriginResponse, validateSupervisorState,validateScheduledSupervisorTask } from '../scripts/private-pc-supervisor.mjs';

test('Windows PowerShell gets its native module path without changing the parent environment', () => {
  const inherited = { SystemRoot: 'C:\\Windows', PSModulePath: 'C:\\Program Files\\PowerShell\\7\\Modules', psMODULEpath: 'another-inherited-path', KEEP: 'unchanged' };
  const environment = powerShellEnvironment({ QFRONTIER_PC_PID: '123' }, inherited);
  assert.equal(Object.keys(environment).some(name => name.toLowerCase() === 'psmodulepath'), false);
  assert.equal(environment.QFRONTIER_PC_PID, '123');
  assert.equal(environment.KEEP, 'unchanged');
  assert.equal(inherited.PSModulePath, 'C:\\Program Files\\PowerShell\\7\\Modules');
});

test('the tunnel readiness guard accepts only the protected anonymous 401 response', async () => {
  const headers = { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
  assert.equal(await validatePrivateOriginResponse(new Response('Se requiere acceso autorizado.', { status: 401, headers })), true);
  await assert.rejects(validatePrivateOriginResponse(new Response('<html>game</html>', { status: 200, headers })));
  await assert.rejects(validatePrivateOriginResponse(new Response('Se requiere acceso autorizado.', { status: 401, headers: { ...headers, 'Cache-Control': 'public, max-age=600' } })));
  await assert.rejects(validatePrivateOriginResponse(new Response('other service', { status: 401, headers })));
  await assert.rejects(validatePrivateOriginResponse(new Response('x'.repeat(257), { status: 401, headers })));
  await assert.rejects(validatePrivateOriginResponse(new Response(null, { status: 302, headers })));
});

test('supervisor parses quoted Windows paths and preserves literal backslashes', () => {
  assert.deepEqual(splitWindowsCommandLine('"C:\\Program Files\\nodejs\\node.exe" "D:\\Qrypta Hackathon\\scripts\\private-pc-supervisor.mjs" serve abc'), ['C:\\Program Files\\nodejs\\node.exe', 'D:\\Qrypta Hackathon\\scripts\\private-pc-supervisor.mjs', 'serve', 'abc']);
  assert.deepEqual(splitWindowsCommandLine('"C:\\tools\\cloudflared.exe" tunnel run --token-file "D:\\private files\\token.txt"'), ['C:\\tools\\cloudflared.exe', 'tunnel', 'run', '--token-file', 'D:\\private files\\token.txt']);
  assert.deepEqual(splitWindowsCommandLine('a "" "quoted \\"word\\""'), ['a', '', 'quoted "word"']);
});

test('supervisor verifies PID, creation time, executable and exact arguments before termination', () => {
  const expected = { pid: 100, createdAt: '2026-10-17T00:00:00.000Z', executable: 'C:\\node\\node.exe', args: ['D:\\game\\scripts\\private-pc-supervisor.mjs', 'serve', 'own-generation'] };
  const observed = { pid: 100, createdAt: expected.createdAt, executable: expected.executable, commandLine: 'C:\\node\\node.exe D:\\game\\scripts\\private-pc-supervisor.mjs serve own-generation' };
  assert.equal(identityMatches(observed, expected), true);
  assert.equal(identityMatches({ ...observed, pid: 101 }, expected), false);
  assert.equal(identityMatches({ ...observed, createdAt: '2026-10-18T00:00:00.000Z' }, expected), false);
  assert.equal(identityMatches({ ...observed, commandLine: observed.commandLine.replace('own-generation', 'another-generation') }, expected), false);
  assert.equal(identityMatches({ ...observed, commandLine: `${observed.commandLine} --unrelated` }, expected), false);
  assert.equal(identityMatches({ ...observed, executable: 'C:\\another\\node.exe' }, expected), false);
  assert.equal(identityMatches({ ...observed, executable: '' }, expected), false);
  assert.equal(identityMatches(null, expected), false);
});

test('supervisor logging redacts tokens, authorization and signed query parameters', () => {
  const token = `eyJ${'A'.repeat(50)}.eyJ${'B'.repeat(50)}.${'C'.repeat(50)}`;
  const text = sanitizeLogText(`\u001b[31mAuthorization: Bearer secret-value cf-access-jwt-assertion=${token} https://private.example/?meta=signed&token=secret&safe=ok`);
  assert.equal(text.includes(token), false);
  assert.equal(text.includes('secret-value'), false);
  assert.equal(text.includes('meta=signed'), false);
  assert.equal(text.includes('token=secret'), false);
  assert.equal(text.includes('safe=ok'), true);
  assert.equal(text.includes('\u001b'), false);
  assert.equal(sanitizeLogText('x'.repeat(20_000)).length, 4096);
});

test('supervisor limits crash recovery to five restarts per ten minutes', () => {
  const at = 1_000_000;
  assert.deepEqual(retryDelay([], at), { allowed: true, delayMs: 1000, attempts: [] });
  assert.equal(retryDelay([at - 100, at - 200, at - 300, at - 400, at - 500], at).allowed, false);
  assert.deepEqual(retryDelay([at - 700_000, at - 100], at), { allowed: true, delayMs: 2000, attempts: [at - 100] });
});

test('supervisor refuses a state file naming another Node process or executable', () => {
  const generation = '12345678-1234-1234-1234-123456789abc';
  const script = fileURLToPath(new URL('../scripts/private-pc-supervisor.mjs', import.meta.url));
  const runtime = fileURLToPath(new URL('../scripts/private-pc-runtime.mjs', import.meta.url));
  const state = { version: 1, generation, supervisor: { pid: 123, createdAt: '2026-10-17T00:00:00.000Z', executable: process.execPath, args: [script, 'serve', generation] }, children: { runtime: { pid: 124, createdAt: '2026-10-17T00:00:00.100Z', executable: process.execPath, args: [runtime, 'run'] } } };
  assert.equal(validateSupervisorState(state), state);
  assert.throws(() => validateSupervisorState({ ...state, supervisor: { ...state.supervisor, args: ['D:\\unrelated\\server.mjs'] } }));
  assert.throws(() => validateSupervisorState({ ...state, children: { runtime: { ...state.children.runtime, executable: 'C:\\unrelated\\server.exe' } } }));
  assert.throws(() => validateSupervisorState({ ...state, children: { other: state.children.runtime } }));
});

test('foreground supervisor identity permits only exact run arguments and keeps legacy serve states valid',()=>{
  const generation='12345678-1234-1234-1234-123456789abc',script=fileURLToPath(new URL('../scripts/private-pc-supervisor.mjs',import.meta.url));
  const supervisor={pid:123,createdAt:'2026-10-18T00:00:00.000Z',executable:process.execPath,args:[script,'run']};
  const state={version:1,generation,launchMode:'foreground',supervisor,children:{}};
  assert.equal(validateSupervisorState(state),state);
  for(const args of[[script,'run',generation],[script,'start'],[script,'serve',generation]])assert.throws(()=>validateSupervisorState({...state,supervisor:{...supervisor,args}}));
  assert.throws(()=>validateSupervisorState({...state,launchMode:'unknown'}));
  assert.throws(()=>validateSupervisorState({...state,launchMode:undefined}));
  const legacy={...state,supervisor:{...supervisor,args:[script,'serve',generation]},launchMode:undefined};assert.equal(validateSupervisorState(legacy),legacy);
  const detached={...legacy,launchMode:'detached'};assert.equal(validateSupervisorState(detached),detached);
});

test('Windows task control permits only the current unelevated user and exact hidden foreground runner',()=>{
  const script=fileURLToPath(new URL('../scripts/private-pc-supervisor.mjs',import.meta.url)),runner=fileURLToPath(new URL('../scripts/private-pc-scheduled-run.ps1',import.meta.url)),root=path.resolve(path.dirname(script),'..');
  const task={name:'QfrontierPrivatePC',taskPath:'\\',actionCount:1,executable:path.join(process.env.SystemRoot??'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe'),arguments:`-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy RemoteSigned -File "${runner}"`,workingDirectory:root,userSid:'S-1-5-21-123',currentUserSid:'S-1-5-21-123',logonType:'Interactive',runLevel:'Limited'};
  assert.equal(validateScheduledSupervisorTask(task),'foreground');assert.equal(validateScheduledSupervisorTask(null),null);
  assert.equal(validateScheduledSupervisorTask({...task,arguments:`-NoProfile -NonInteractive -WindowStyle Hidden -File "${runner}"`}), 'legacy');
  for(const action of['start','run'])assert.equal(validateScheduledSupervisorTask({...task,executable:process.execPath,arguments:`"${script}" ${action}`}),'legacy');
  for(const patch of[{name:'Other'},{taskPath:'\\Other\\'},{actionCount:2},{userSid:'S-1-5-18'},{runLevel:'Highest'},{logonType:'Password'},{workingDirectory:path.dirname(root)},{arguments:task.arguments+' --extra'},{arguments:task.arguments.replace('Hidden','Normal')},{executable:process.execPath},{executable:process.execPath,arguments:`"${script}" stop`},{executable:process.execPath,arguments:`"${script}" start --extra`}])assert.throws(()=>validateScheduledSupervisorTask({...task,...patch}));
});
