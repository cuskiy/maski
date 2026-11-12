# Security

## Threat model

The account database holds decrypted text, so a copy of this origin's IndexedDB is enough
to read history. That matches the device: the session token and the crypto store live in
the same origin, and both are needed to sync more. The design does not pretend otherwise.

## Tokens and keys

- The access token is stored in the account database inside the worker and never reaches
  the main thread. The interface receives a session summary: id, device, name, avatar.
- The secret storage key is cached in worker memory only for the duration of an unlock or
  a reset, and cleared afterwards.
- A recovery key is shown once after a reset and never persisted or logged.
- Logging out clears the account database and the SDK's crypto store.

## Rendering untrusted content

`ui/sanitize.ts` is the only path from received HTML to the DOM:

- allowed: paragraphs, line breaks, bold, italic, underline, strike, code, pre, blockquote,
  lists, links, rules, and `img` carrying `data-mx-emoticon` with an `mxc://` source;
- dropped with their contents: `mx-reply` (a reply fallback would otherwise duplicate the
  quote), script, style, iframe, object, embed, form, input, headings;
- every other attribute is dropped, including `style`, `class`, `id` and handlers;
- a link keeps `href` only for `http`, `https` and `matrix.to`, and gains
  `rel="noopener noreferrer"` and `target="_blank"`.

Custom emoji images are resolved to object URLs after sanitizing, never by rewriting the
markup before it.

## Content security policy

```
default-src 'self';
script-src 'self' 'wasm-unsafe-eval';
style-src 'self';
img-src 'self' blob: data:;
media-src 'self' blob:;
worker-src 'self' blob:;
object-src 'none'; base-uri 'none'; form-action 'self';
connect-src *
```

No inline script, so no hash or nonce. `connect-src *` because the homeserver is chosen by
the user; everything else is same-origin. `wasm-unsafe-eval` is required by the Rust crypto
module.

## Media

Media is fetched with the access token in the worker, decrypted there, and handed to the
main thread as a blob. A URL never carries a token. Encryption uses
`Attachment.encrypt` / `Attachment.decrypt` from the SDK's own wasm module, so an encrypted
room never receives a plaintext upload.

## Privacy

No analytics, no third-party request, no font or icon package. Notifications are local to
an open page; the preview text can be turned off. Search runs against the local database.
