import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../app/results/page.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

// Mount the actual route with isolated hooks. Unexpected API/storage dependencies
// fail instead of being silently mocked. Authentication remains in its layout.
function mount(query) {
  const destinations = [];
  const effects = [];
  const element = (type, props) => typeof type === 'function' ? type(props) : props;
  const modules = {
    react: { Suspense: ({ children }) => children, useEffect: effect => effects.push(effect) },
    'react/jsx-runtime': { jsx: element, jsxs: element },
    'next/navigation': {
      useRouter: () => ({ replace: destination => destinations.push(destination) }),
      useSearchParams: () => new URLSearchParams(query),
    },
    '../components/app-page': { AppPage: ({ children }) => children },
  };
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    require: name => { assert.ok(name in modules, `Unexpected results dependency: ${name}`); return modules[name]; },
  });
  exports.default();
  effects.forEach(effect => effect());
  return destinations;
}

test('legacy results links preserve the selected pet through the mounted redirect', () => {
  assert.deepEqual(mount('profileId=pet-123'), ['/pets/pet-123']);
  assert.deepEqual(mount(''), ['/pets']);
  assert.deepEqual(mount('profileId='), ['/pets']);
});

test('legacy results encodes untrusted pet identifiers as a single local path segment', () => {
  assert.deepEqual(mount('profileId=' + encodeURIComponent('a/b?next=https://outside.example')), [
    '/pets/a%2Fb%3Fnext%3Dhttps%3A%2F%2Foutside.example',
  ]);
});

test('legacy results retains the private layout and no-index metadata', () => {
  const layout = readFileSync(new URL('../app/results/layout.tsx', import.meta.url), 'utf8');
  assert.match(layout, /export default PrivateRouteLayout/);
  assert.match(layout, /createPrivatePageMetadata\("Results"\)/);
});
