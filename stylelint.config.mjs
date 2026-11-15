export default {
  extends: ["stylelint-config-standard"],
  rules: {
    "custom-property-pattern": "^[a-z][a-z0-9-]*$",
    "selector-class-pattern": "^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$",
    "declaration-property-value-no-unknown": true,
    "no-descending-specificity": true,
    "declaration-block-no-redundant-longhand-properties": true,
    "color-function-notation": "modern",
    "alpha-value-notation": "percentage",
    "color-hex-length": "short",
    "value-keyword-case": ["lower", { ignoreKeywords: ["optimizeLegibility"] }],
    "custom-property-empty-line-before": null,
  },
};
