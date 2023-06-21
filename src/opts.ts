import { SnOpts } from '.'

// validate opts
const validate = (opts: SnOpts) => {
  if (!opts) throw new Error('snq: must supply options')

  if (!opts.port || typeof opts.port !== 'number') throw new Error('snq: must supply port')

  if (opts.senderOpts && opts.senderOpts.useLruCache && !opts.senderOpts.lruSize)
    throw new Error('snq: must supply lruSize when using lruCache')
}

export default validate
