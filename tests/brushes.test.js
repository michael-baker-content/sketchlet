import test from 'node:test';
import assert from 'node:assert/strict';
import { BRUSH_SHAPES, BRUSH_STYLES, strokeSamples, createStrokeSampler, sprayParticles, pencilParticles, insideShape, createBrushRenderer } from '../src/brushes.js';
import { validDocument, restoreDraft, History } from '../src/model.js';

const stroke = { tool: 'brush', color: '#343044', size: 14, points: [[20, 20], [100, 20]] };
test('stronger pencil and spray preserve old strokes and survive draft restoration', () => {
  const alphas = [], dots = [];
  const context = { save() {}, restore() {}, beginPath() {}, moveTo() {}, clip() {}, fill() {},
    arc(...args) { dots.push(args); }, fillRect() { alphas.push(this.globalAlpha); } };
  const draw = createBrushRenderer(() => {});
  const pencil = { ...stroke, shape: 'circle', style: 'pencil', seed: 7 };
  draw(context, pencil);
  const old = [...alphas]; alphas.length = 0;
  draw(context, { ...pencil, pencilVersion: 2 });
  assert.deepEqual(alphas, old.map(alpha => alpha * 1.35));
  const spray = { ...stroke, shape: 'circle', style: 'spray', points: [[20,20]], sprayVersion: 4 };
  dots.length = 0; draw(context, spray); assert.equal(dots.length, 4);
  assert.equal(context.globalAlpha, .2);
  const opaqueSpray = { ...spray, sprayVersion: 5 };
  dots.length = 0; draw(context, opaqueSpray); assert.equal(dots.length, 4);
  assert.equal(context.globalAlpha, .4);
  dots.length = 0; draw(context, { ...spray, sprayVersion: 3 }); assert.equal(dots.length, 3);
  const doc = { background: '#FFFFFF', strokes: [{ ...pencil, pencilVersion: 2 }, spray, opaqueSpray] };
  assert.deepEqual(restoreDraft(JSON.parse(JSON.stringify({ day: '2026-10-07', document: doc })), '2026-10-07'), doc);
});
test('live sampling processes each segment once and matches complete-stroke sampling', () => {
  const points = [[20,20], [20,20], [20.1,20.2], [100,70], [20,20], [300,140]];
  for (const spacing of [.75, 1.68, 3.84]) {
    const sample = createStrokeSampler(spacing), live = [], result = [];
    for (const point of points) {
      live.push(point);
      result.push(...sample(live));
      assert.deepEqual([...sample(live)], [], 'unchanged frames produce no new samples');
    }
    assert.deepEqual(result, [...strokeSamples(points, spacing)]);
  }
});
test('pencil grain changes with each pass and stroke but survives draft reload', () => {
  const sample = { x: 30, y: 30, index: 0 };
  const first = pencilParticles(sample, 'circle', 14, 123);
  assert.deepEqual(first, pencilParticles(sample, 'circle', 14, 123));
  assert.notDeepEqual(first, pencilParticles({ ...sample, index: 1 }, 'circle', 14, 123));
  assert.notDeepEqual(first, pencilParticles(sample, 'circle', 14, 456));
  const doc = { background: '#FFFFFF', strokes: [{ ...stroke, shape: 'circle', style: 'pencil', seed: 123 }] };
  const restored = restoreDraft(JSON.parse(JSON.stringify({ day: '2026-10-04', document: doc })), '2026-10-04');
  assert.deepEqual(restored, doc);
  assert.deepEqual(first, pencilParticles(sample, 'circle', 14, restored.strokes[0].seed));
  assert.equal(validDocument({ ...doc, strokes: [{ ...doc.strokes[0], seed: -1 }] }), false);
});

test('pencil deposits translucent grain cumulatively, including retracing within a stroke', () => {
  const deposits = [];
  const context = { save() {}, restore() {}, beginPath() {}, moveTo() {}, arc() {}, clip() {},
    fillRect(x, y, width) { deposits.push([x, y, width, this.globalAlpha]); } };
  const draw = createBrushRenderer(() => { throw new Error('new pencil must not use a repeating tile'); });
  const pencil = { ...stroke, shape: 'circle', style: 'pencil', seed: 7 };
  draw(context, pencil);
  const first = [...deposits];
  assert.ok(first.length > 0);
  assert.ok(first.every(grain => grain[3] > 0 && grain[3] < 1));
  deposits.length = 0;
  draw(context, { ...pencil, points: [...pencil.points, pencil.points[0]] });
  assert.ok(deposits.length > first.length);
  assert.deepEqual(deposits.slice(0, first.length), first);
});
test('all shape and style combinations survive draft restoration and undo', () => {
  const strokes = BRUSH_SHAPES.flatMap(shape => BRUSH_STYLES.map(style => ({ ...stroke, shape, style })));
  const doc = { background: '#FFFFFF', strokes };
  assert.equal(validDocument(doc), true);
  const restored = restoreDraft(JSON.parse(JSON.stringify({ day: '2026-10-04', document: doc })), '2026-10-04');
  assert.deepEqual(restored, doc);
  const history = new History(restored);
  history.commit({ ...doc, strokes: [] }); history.undo();
  assert.deepEqual(history.document, doc);
  for (const legacy of [undefined, 'solid', 'dashed', 'rough']) {
    const old = { background: '#FFFFFF', strokes: [{ ...stroke, style: legacy }] };
    assert.equal(restoreDraft({ day: '2026-10-04', document: old }, '2026-10-04'), old);
  }
  assert.equal(validDocument({ ...doc, strokes: [{ ...stroke, shape: 'triangle', style: 'brush' }] }), false);
  assert.equal(validDocument({ ...doc, strokes: [{ ...stroke, shape: 'circle', style: 'unknown' }] }), false);
});

test('stamp spacing does not depend on the number of pointer events', () => {
  const sparse = [...strokeSamples([[0, 0], [100, 0]], 5)];
  const dense = [...strokeSamples([[0, 0], [20, 0], [20, 0], [65, 0], [100, 0]], 5)];
  assert.equal(sparse.length, dense.length);
  sparse.forEach((sample, index) => {
    assert.ok(Math.abs(sample.x - dense[index].x) < 1e-9);
    assert.equal(sample.y, dense[index].y);
    assert.equal(sample.distance, dense[index].distance);
  });
});

test('spray is repeatable and its particle centers stay inside the selected footprint', () => {
  for (const shape of BRUSH_SHAPES) for (let index = 0; index < 50; index++) {
    const sample = { x: 100, y: 100, index };
    const particles = sprayParticles(sample, shape, 32);
    assert.deepEqual(particles, sprayParticles(sample, shape, 32));
    assert.equal(particles.length, 10);
    for (const [x, y] of particles) assert.equal(insideShape(shape, (x - 100) / 16, (y - 100) / 16), true);
  }
});

test('new spray uses small size-dependent dots and the selected particle shape', () => {
  const arcs = [], rectangles = [], lines = [];
  const context = { save() {}, restore() {}, beginPath() {}, closePath() {}, moveTo() {}, fill() {},
    arc(...args) { arcs.push(args); }, rect(...args) { rectangles.push(args); }, lineTo(...args) { lines.push(args); } };
  const draw = createBrushRenderer(() => {});
  const widths = [];
  for (const size of [5, 14, 32]) {
    arcs.length = 0;
    draw(context, { ...stroke, size, shape: 'circle', style: 'spray', sprayVersion: 2, points: [[50,50]] });
    assert.equal(arcs.length, 10);
    widths.push(arcs[0][2] * 2);
    assert.ok(widths.at(-1) < size);
  }
  assert.ok(widths[0] < widths[1] && widths[1] < widths[2]);
  assert.ok(widths[2] <= 5);
  for (const shape of ['square', 'rough']) {
    arcs.length = rectangles.length = lines.length = 0;
    const spray = { ...stroke, shape, style: 'spray', sprayVersion: 2, points: [[50,50]] };
    draw(context, spray);
    assert.equal(arcs.length, 0);
    if (shape === 'square') assert.equal(rectangles.length, 10);
    else assert.ok(lines.length > 0);
    const document = { background: '#FFFFFF', strokes: [spray] };
    assert.deepEqual(restoreDraft({ day: '2026-10-04', document }, '2026-10-04'), document);
  }
  arcs.length = 0;
  draw(context, { ...stroke, shape: 'square', style: 'spray', points: [[50,50]] });
  assert.equal(arcs.length, 10, 'older spray strokes retain their original round particles');
});

test('lighter spray reduces opacity and particle density while retaining dot size', () => {
  const marks = [], fills = [];
  const context = { save() {}, restore() {}, beginPath() {}, moveTo() {},
    arc(...args) { marks.push(args); }, fill() { fills.push(this.globalAlpha); } };
  const draw = createBrushRenderer(() => {});
  for (const size of [5, 14, 32]) {
    marks.length = fills.length = 0;
    draw(context, { ...stroke, size, shape: 'circle', style: 'spray', sprayVersion: 2 });
    const oldCount = marks.length, oldRadius = marks[0][2], oldOpacity = fills[0];
    marks.length = fills.length = 0;
    const updated = { ...stroke, size, shape: 'circle', style: 'spray', sprayVersion: 3 };
    draw(context, updated);
    assert.ok(marks.length < oldCount / 3);
    assert.equal(marks[0][2], oldRadius);
    assert.ok(fills[0] < oldOpacity / 2);
    assert.equal(validDocument({ background: '#FFFFFF', strokes: [updated] }), true);
  }
});

test('marker composites once per stroke and erasing ignores drawing style', () => {
  const fills = [], geometry = [];
  const context = {
    save() {}, restore() {}, beginPath() {}, closePath() {},
    moveTo(...args) { geometry.push(['move', ...args]); },
    lineTo(...args) { geometry.push(['line', ...args]); },
    arc(...args) { geometry.push(['arc', ...args]); },
    rect(...args) { geometry.push(['rect', ...args]); },
    fill() { fills.push([this.globalAlpha, this.globalCompositeOperation]); },
  };
  const draw = createBrushRenderer(() => { throw new Error('eraser must not create a pencil texture'); });
  draw(context, { ...stroke, shape: 'circle', style: 'marker', points: [[20,20], [100,20], [20,20]] });
  assert.deepEqual(fills, [[.32, 'source-over']]);
  for (const shape of BRUSH_SHAPES) {
    let expected;
    for (const style of BRUSH_STYLES) {
      geometry.length = fills.length = 0;
      draw(context, { ...stroke, tool: 'eraser', shape, style });
      assert.deepEqual(fills, [[1, 'destination-out']]);
      if (expected) assert.deepEqual(geometry, expected);
      else expected = structuredClone(geometry);
    }
  }
});
