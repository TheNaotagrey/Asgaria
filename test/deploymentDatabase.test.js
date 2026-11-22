const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const workflow = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'publishTocPanel.yml'), 'utf8');
const block = workflow.match(/          script: \|\r?\n([\s\S]*?)(?=\r?\n      - name:)/)[1];
const deployScript = block.split(/\r?\n/).map(line => line.replace(/^ {12}/, '')).join('\n')
  .replace('cd /home/wkkgb451/repositories/Asgaria', 'cd "$DEPLOY_DIRECTORY"');
const bash = process.platform === 'win32'
  ? path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Git', 'bin', 'bash.exe') : 'bash';

function git(directory, args, allowFailure = false) {
  const result = spawnSync('git', args, { cwd: directory, encoding: 'utf8' });
  if (!allowFailure) assert.equal(result.status, 0, result.stderr || result.error?.message);
  return result;
}
function commit(directory, message) {
  git(directory, ['-c', 'user.name=Validation', '-c', 'user.email=validation@example.invalid',
    '-c', 'commit.gpgsign=false', 'commit', '-m', message]);
}
function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'asgaria-deploy-db-'));
  const origin = path.join(root, 'origin');
  const server = path.join(root, 'server');
  fs.mkdirSync(origin);
  git(origin, ['init', '-b', 'live']);
  fs.writeFileSync(path.join(origin, '.gitignore'), 'asgaria.db\n');
  fs.writeFileSync(path.join(origin, 'asgaria.db'), 'base initiale du dépôt');
  fs.writeFileSync(path.join(origin, 'app.js'), 'version initiale\n');
  git(origin, ['add', '.gitignore', 'app.js']);
  git(origin, ['add', '-f', '--', 'asgaria.db']);
  commit(origin, 'Initialisation');
  git(root, ['clone', origin, server]);
  const productionBytes = Buffer.from('SQLite\0données propres au serveur\xff', 'utf8');
  fs.writeFileSync(path.join(server, 'asgaria.db'), productionBytes);
  const external = path.join(root, 'production-externe.db');
  fs.writeFileSync(external, productionBytes);
  return {
    origin, server, productionBytes, external,
    removeDatabase() {
      git(origin, ['rm', '--cached', '--', 'asgaria.db']);
      fs.writeFileSync(path.join(origin, 'app.js'), 'nouveau code\n');
      git(origin, ['add', 'app.js']);
      commit(origin, 'Base retirée du dépôt');
    },
    deploy() {
      return spawnSync(bash, ['--noprofile', '--norc', '-s'], {
        cwd: server, encoding: 'utf8', input: deployScript,
        env: { ...process.env, DEPLOY_DIRECTORY: server.replace(/\\/g, '/') }
      });
    },
    assertPreserved() {
      assert.deepEqual(fs.readFileSync(path.join(server, 'asgaria.db')), productionBytes);
      assert.deepEqual(fs.readFileSync(external), productionBytes);
    },
    cleanup() {
      const resolved = fs.realpathSync(root);
      assert.equal(path.dirname(resolved), fs.realpathSync(os.tmpdir()));
      assert.ok(path.basename(resolved).startsWith('asgaria-deploy-db-'));
      fs.rmSync(resolved, { recursive: true, force: true });
    }
  };
}

test('déploiement : le conflit sur la base serveur est résolu sans modifier son contenu, y compris au déploiement suivant', () => {
  const f = setup();
  try {
    f.removeDatabase();
    const blocked = git(f.server, ['pull', '--ff-only', 'origin', 'live'], true);
    assert.notEqual(blocked.status, 0);
    assert.match(blocked.stderr, /asgaria\.db/);
    const deployed = f.deploy();
    assert.equal(deployed.status, 0, deployed.stdout + deployed.stderr);
    f.assertPreserved();
    assert.equal(git(f.server, ['ls-files', '--', 'asgaria.db']).stdout.trim(), '');
    assert.equal(fs.readFileSync(path.join(f.server, 'app.js'), 'utf8').replace(/\r\n/g, '\n'), 'nouveau code\n');

    fs.writeFileSync(path.join(f.origin, 'app.js'), 'code suivant\n');
    git(f.origin, ['add', 'app.js']);
    commit(f.origin, 'Déploiement suivant');
    const again = f.deploy();
    assert.equal(again.status, 0, again.stdout + again.stderr);
    f.assertPreserved();
    assert.equal(fs.readFileSync(path.join(f.server, 'app.js'), 'utf8').replace(/\r\n/g, '\n'), 'code suivant\n');
  } finally { f.cleanup(); }
});

test('déploiement : une version qui contient encore une base suivie est refusée', () => {
  const f = setup();
  try {
    const before = git(f.server, ['rev-parse', 'HEAD']).stdout;
    const deployed = f.deploy();
    assert.notEqual(deployed.status, 0);
    assert.match(deployed.stdout, /Déploiement refusé/);
    f.assertPreserved();
    assert.equal(git(f.server, ['rev-parse', 'HEAD']).stdout, before);
    assert.equal(git(f.server, ['ls-files', '--', 'asgaria.db']).stdout.trim(), 'asgaria.db');
  } finally { f.cleanup(); }
});

test('déploiement : les autres modifications du serveur ne sont jamais écrasées pour forcer la mise à jour', () => {
  const f = setup();
  try {
    f.removeDatabase();
    fs.writeFileSync(path.join(f.server, 'app.js'), 'modification propre au serveur\n');
    const deployed = f.deploy();
    assert.notEqual(deployed.status, 0);
    f.assertPreserved();
    assert.equal(fs.readFileSync(path.join(f.server, 'app.js'), 'utf8').replace(/\r\n/g, '\n'), 'modification propre au serveur\n');
  } finally { f.cleanup(); }
});
