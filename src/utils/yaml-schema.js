'use strict';

const yaml = require('js-yaml');

// Drop implicit timestamps so date-shaped plain scalars and mapping keys stay strings; an
// explicit `!!timestamp` tag still constructs a Date
const implicit = yaml.DEFAULT_SCHEMA.implicit.filter(
  (type) => type.tag !== 'tag:yaml.org,2002:timestamp'
);

module.exports = new yaml.Schema({
  implicit,
  explicit: [...yaml.DEFAULT_SCHEMA.explicit, yaml.types.timestamp],
});
