// Fork: favorites are also removed by songId, because the client may send a
// resolved catalog path that differs from the stored one (duplicate files
// share a songId). See the favorite removal route in server/index.js.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Database = require('better-sqlite3');

test('unfavoriting by songId removes an entry stored under another path', () => {
  const source = fs.readFileSync('server/database.js', 'utf8');
  const match = source.match(/removeFavoriteByPathStmt: db\.prepare\(`([\s\S]*?)`\)/);
  assert.ok(match, 'favorite removal statement exists');
  const db = new Database(':memory:');
  try {
    db.exec('CREATE TABLE playlists (user_id TEXT, type TEXT, items TEXT, modified_at INTEGER)');
    db.prepare('INSERT INTO playlists VALUES (?, ?, ?, ?)').run('user', 'favorites', JSON.stringify([
      { path: 'old/a.mid', songId: 'abc' }, { path: 'b.mid', songId: 'def' },
    ]), 0);
    const remove = db.prepare(match[1]);
    assert.equal(remove.run({ userId: 'user', path: 'new/a.mid', songId: 'abc', now: 1 }).changes, 1);
    assert.deepEqual(JSON.parse(db.prepare('SELECT items FROM playlists').get().items), [{ path: 'b.mid', songId: 'def' }]);
    // Nothing matches by path or songId: no update, so the route answers 404.
    assert.equal(remove.run({ userId: 'user', path: 'c.mid', songId: 'zzz', now: 2 }).changes, 0);
  } finally {
    db.close();
  }
});
