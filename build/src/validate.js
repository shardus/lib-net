"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// validate opts
const validate = (opts) => {
    if (!opts)
        throw new Error('snq: must supply options');
    if (!opts.port || typeof opts.port !== 'number')
        throw new Error('snq: must supply port');
};
exports.default = validate;
//# sourceMappingURL=validate.js.map