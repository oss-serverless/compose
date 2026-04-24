'use strict';

const expect = require('chai').expect;

const {
  createRegistry,
  getOwnByPath,
  hasOwn,
  isReservedComponentId,
  safeSet,
  safeShallowAssign,
} = require('../../../../src/utils/safe-object');

describe('test/unit/src/utils/safe-object.test.js', () => {
  afterEach(() => {
    delete Object.prototype.polluted;
  });

  it('creates null-prototype registries', () => {
    expect(Object.getPrototypeOf(createRegistry())).to.equal(null);
  });

  it('detects reserved component ids', () => {
    expect(isReservedComponentId('__proto__')).to.equal(true);
    expect(isReservedComponentId('constructor')).to.equal(true);
    expect(isReservedComponentId('prototype')).to.equal(true);
    expect(isReservedComponentId('service')).to.equal(false);
  });

  it('distinguishes own and inherited properties with hasOwn', () => {
    expect(hasOwn(null, 'value')).to.equal(false);
    expect(hasOwn(undefined, 'value')).to.equal(false);
    expect(hasOwn({}, 'toString')).to.equal(false);
    expect(hasOwn({ toString: 'own' }, 'toString')).to.equal(true);
    expect(hasOwn([1, 2], 'length')).to.equal(true);
    expect(hasOwn('ab', 'length')).to.equal(true);
  });

  it('preserves unsafe keys as own data when setting and assigning values', () => {
    const target = {};

    safeSet(target, '__proto__', { polluted: 'no' });
    safeSet(target, 'constructor', 'ctor');
    safeSet(target, 'prototype', 'proto');

    expect(Object.getPrototypeOf(target)).to.equal(Object.prototype);
    expect(Object.getOwnPropertyDescriptor(target, '__proto__').value).to.deep.equal({
      polluted: 'no',
    });
    expect(Object.getOwnPropertyDescriptor(target, 'constructor').value).to.equal('ctor');
    expect(Object.getOwnPropertyDescriptor(target, 'prototype').value).to.equal('proto');
    expect({}.polluted).to.equal(undefined);

    const source = safeShallowAssign(
      {},
      {
        nested: safeShallowAssign({}, JSON.parse('{"__proto__":{"value":"ok"}}')),
      }
    );

    expect(getOwnByPath(source, ['nested', '__proto__', 'value'])).to.equal('ok');
  });

  it('ignores nullish sources when shallow assigning', () => {
    const target = safeShallowAssign({}, null, { value: 'first' }, undefined, { value: 'second' });

    expect(target).to.deep.equal({ value: 'second' });
  });

  it('reads only own properties while supporting array and string own properties', () => {
    const source = safeShallowAssign(
      {},
      {
        list: ['one', 'two'],
        nested: safeShallowAssign({}, JSON.parse('{"__proto__":{"value":"ok"}}')),
        text: 'ab',
      }
    );

    expect(getOwnByPath(source, 'list.length')).to.equal(2);
    expect(getOwnByPath(source, ['list', '1'])).to.equal('two');
    expect(getOwnByPath(source, ['text', 'length'])).to.equal(2);
    expect(getOwnByPath(source, ['nested', '__proto__', 'value'])).to.equal('ok');
    expect(getOwnByPath({ nested: {} }, ['nested', 'constructor', 'name'])).to.equal(undefined);
    expect(getOwnByPath({ nested: null }, 'nested.value')).to.equal(undefined);
    expect(getOwnByPath({ nested: 5 }, 'nested.value')).to.equal(undefined);
  });
});
