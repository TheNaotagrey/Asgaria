const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'admin.js'), 'utf8');
const start = source.indexOf('async function readUpdatePolicyResponse(');
const end = source.indexOf('async function loadUpdatePolicyPanel(', start);
assert.ok(start >= 0 && end > start);
const readUpdatePolicyResponse = vm.runInNewContext(`${source.slice(start, end)}; readUpdatePolicyResponse`);

function response(status, contentType, data) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: () => contentType },
    json: async () => data
  };
}

test('une ancienne API HTML produit un message utile sans erreur de parsing JSON', async () => {
  await assert.rejects(
    readUpdatePolicyResponse(response(404, 'text/html', null)),
    /version du serveur ne fournit pas encore l’API/
  );
  await assert.rejects(
    readUpdatePolicyResponse(response(403, 'application/json', { error: 'Forbidden' })),
    /Accès administrateur requis/
  );
  const data = { policy: { blocked: false }, definitions: [] };
  assert.equal(await readUpdatePolicyResponse(response(200, 'application/json; charset=utf-8', data)), data);
});
