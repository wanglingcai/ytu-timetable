const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const readJson = (file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));

test('学校注册表和烟台大学配置使用统一适配器契约', () => {
  const registry = readJson('app/src/main/assets/schools/registry.json');
  const schools = Array.isArray(registry) ? registry : registry.schools;
  assert.ok(Array.isArray(schools) && schools.length > 0);
  const ytu = schools.find((school) => school.id === 'ytu');
  assert.ok(ytu);
  const config = readJson('app/src/main/assets/schools/ytu/config.json');
  for (const key of ['id', 'name', 'entryUrl', 'resultUrl', 'dataUrl', 'extractorAsset']) assert.equal(typeof config[key], 'string');
  assert.deepEqual(config.allowedHosts, ['cas.ytu.edu.cn', 'ehall.ytu.edu.cn', 'jwxs.ytu.edu.cn']);
  for (const key of ['entryUrl', 'resultUrl', 'dataUrl']) assert.equal(new URL(config[key]).protocol, 'https:');
  assert.equal(fs.existsSync(path.join(root, 'app/src/main/assets', config.extractorAsset)), true);
});

test('烟台大学脱敏接口 fixture 的标准课程字段完整', () => {
  const fixture = readJson('tests/fixtures/schools/ytu/api-response.json');
  const expected = readJson('tests/fixtures/schools/ytu/expected-courses.json');
  assert.ok(Array.isArray(fixture.xkxx));
  assert.ok(expected.length >= 2);
  for (const course of expected) {
    for (const key of ['name', 'teacher', 'room']) assert.equal(typeof course[key], 'string');
    for (const key of ['day', 'start', 'end']) assert.equal(Number.isInteger(course[key]), true);
    assert.ok(Array.isArray(course.weeks) && course.weeks.every(Number.isInteger));
    assert.ok(course.day >= 1 && course.day <= 7 && course.start <= course.end);
  }
  assert.equal(JSON.stringify(fixture).includes('studentAccount'), true);
  assert.equal(JSON.stringify(expected).includes('FAKE-NOT-TO-KEEP'), false);
});
