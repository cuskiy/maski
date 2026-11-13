export default {
  extends: ["stylelint-config-standard"],
  rules: {
    // The token table is copied from blog/ and grouped by role, so a blank line before a
    // group is the grouping, and its hex and keyword spelling is the blog's.
    "color-hex-length": null,
    "custom-property-empty-line-before": null,
    "value-keyword-case": null,
    "custom-property-pattern": null,
    "selector-class-pattern": null,
    "no-descending-specificity": null,
    "declaration-block-no-redundant-longhand-properties": null,
    "color-function-notation": null,
    "alpha-value-notation": null,
  },
};
