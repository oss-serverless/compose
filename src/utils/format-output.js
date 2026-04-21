'use strict';

const colors = require('../cli/colors');

const DEFAULT_OPTIONS = {
  indentation: '  ',
  maxDepth: 3,
  colors: {
    keys: 'gray',
    dash: 'gray',
    number: 'white',
    string: null,
    true: 'white',
    false: 'white',
    null: 'gray',
    undefined: 'gray',
  },
};

const colorHandlers = {
  gray: colors.gray,
  white: colors.foreground,
  red: colors.red,
};

const colorize = (value, colorName) => {
  const text = String(value);
  if (!colorName || !colorHandlers[colorName]) {
    return text;
  }
  return colorHandlers[colorName](text);
};

const isEmptyArray = (value) => Array.isArray(value) && value.length === 0;
const isSingleLineString = (value) => typeof value === 'string' && !value.includes('\n');

const isSerializable = (value) => {
  return (
    typeof value === 'boolean' ||
    typeof value === 'number' ||
    value === null ||
    value === undefined ||
    value instanceof Date ||
    isSingleLineString(value) ||
    isEmptyArray(value)
  );
};

const getValueColor = (value, outputColors) => {
  if (typeof value === 'string') return outputColors.string;
  if (value === true) return outputColors.true;
  if (value === false) return outputColors.false;
  if (value === null) return outputColors.null;
  if (value === undefined) return outputColors.undefined;
  if (typeof value === 'number') return outputColors.number;
  return null;
};

const renderSerializable = (value, options, indentation = '') => {
  if (Array.isArray(value)) {
    return `${indentation}(empty array)\n`;
  }

  return `${indentation}${colorize(value, getValueColor(value, options.colors))}\n`;
};

const renderMultilineString = (value, options, indentation) => {
  const nestedIndentation = `${indentation}${options.indentation}`;
  const lines = value.split('\n').map((line) => `${nestedIndentation}${line}`);
  return `${indentation}"""\n${lines.join('\n')}\n${indentation}"""\n`;
};

const renderObjectKey = (key, options, indentation) => {
  return colorize(`${indentation}${key}: `, options.colors.keys);
};

const renderDash = (options, indentation) => {
  return colorize(`${indentation}- `, options.colors.dash);
};

const renderValue = (value, options, indentation, depth) => {
  if (depth > options.maxDepth) {
    return `${indentation}(max depth reached)\n`;
  }

  if (isSerializable(value)) {
    return renderSerializable(value, options, indentation);
  }

  if (typeof value === 'string') {
    return renderMultilineString(value, options, indentation);
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (isSerializable(item)) {
          return `${renderDash(options, indentation)}${renderSerializable(item, options, '')}`;
        }

        if (depth + 1 > options.maxDepth) {
          return `${renderDash(options, indentation)}(max depth reached)\n`;
        }

        return `${renderDash(options, indentation)}\n${renderValue(
          item,
          options,
          `${indentation}${options.indentation}`,
          depth + 1
        )}`;
      })
      .join('');
  }

  return Object.getOwnPropertyNames(value)
    .map((key) => {
      const childValue = value[key];
      if (isSerializable(childValue)) {
        return `${renderObjectKey(key, options, indentation)}${renderSerializable(
          childValue,
          options,
          ''
        )}`;
      }

      if (depth + 1 > options.maxDepth) {
        return `${renderObjectKey(key, options, indentation)}(max depth reached)\n`;
      }

      return `${renderObjectKey(key, options, indentation)}\n${renderValue(
        childValue,
        options,
        `${indentation}${options.indentation}`,
        depth + 1
      )}`;
    })
    .join('');
};

module.exports = (value, options = {}) => {
  return renderValue(
    value,
    {
      ...DEFAULT_OPTIONS,
      ...options,
      colors: {
        ...DEFAULT_OPTIONS.colors,
        ...(options.colors || {}),
      },
    },
    '',
    0
  );
};
