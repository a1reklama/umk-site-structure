const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const sandbox = { window: {} };
for (const file of ['tree-data.js', 'requirements-data.js']) {
  vm.runInNewContext(readFileSync(path.join(__dirname, '..', file), 'utf8'), sandbox);
}
const tree = sandbox.window.UMK_FULL_TREE;
const requirements = sandbox.window.UMK_REQUIREMENTS;
const flatten = (items) => items.flatMap(n => [n, ...flatten(n.children || [])]);
const nodes = flatten(tree);
const byId = new Map(nodes.map(n => [n.id, n]));

test('all views can index the tree without duplicate ids or conflicting URLs', () => {
  assert.equal(byId.size, nodes.length);
  const urls = nodes.map(n => n.url).filter(Boolean);
  assert.equal(new Set(urls).size, urls.length);
  const walk = (items, ancestors = []) => {
    for (const node of items) {
      assert.equal(node.level, ancestors.length + 1, node.id);
      assert.equal(node.path, [...ancestors.map(n => n.title), node.title].join(' / '), node.id);
      assert.equal(node.section, ancestors.length > 1 ? ancestors[1].title : node.title, node.id);
      walk(node.children || [], [...ancestors, node]);
    }
  };
  walk(tree);
});

test('each requirement is reachable and every attached requirement resolves', () => {
  const refs = new Set(nodes.flatMap(n => n.requirementIds || []));
  for (const id of refs) assert.ok(requirements[id], `Unknown requirement ${id}`);
  for (const id of Object.keys(requirements)) assert.ok(refs.has(id), `Unreachable requirement ${id}`);
  assert.equal(Object.keys(requirements).length, 57);
  for (const item of Object.values(requirements)) {
    const source = new URL(item.sourceUrl);
    assert.equal(source.hostname, 'docs.google.com');
    assert.match(source.hash, /range=A\d+$/);
    assert.ok(item.originalSource);
  }
});

test('filter and fire directions are directly accessible, dirt separators stay flat', () => {
  const top = tree[0].children;
  assert.ok(top.some(n => n.title === 'Фильтры и грязевики'));
  assert.ok(top.some(n => n.title === 'Пожарная продукция'));
  assert.equal(nodes.find(n => n.title === 'Грязевики').children.length, 0);
  assert.equal(nodes.some(n => n.title === 'Геосинтетика'), false);
  assert.ok(nodes.some(n => /Пожарная колонка КПА/.test(n.title)));
});

test('an oil shortcut resolves to steel gates and includes both preset conditions', () => {
  const node = nodes.find(n => n.title === 'Нефтегазовая запорная арматура');
  assert.equal(byId.get(node.redirect.targetId).title, 'Задвижки стальные');
  assert.deepEqual(JSON.parse(JSON.stringify(node.redirect.filters)), [
    { name: 'Материал', value: 'Сталь' },
    { name: 'Рабочая среда', value: 'Нефтяная' },
  ]);
});
