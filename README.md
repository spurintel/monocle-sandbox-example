# Monocle Frame Proxy Shim Integration Guide

## Introduction

This repository provides guidance for integrating Monocle, Spur’s proxy detection tool, using a self-hosted frame proxy shim (mclfp.js).

By using the shim, the Monocle script loaded from https://mcl.spur.us runs inside a sandboxed iframe, ensuring it cannot access the DOM, cookies, or storage on your page.

This is designed for developers integrating Monocle on sensitive pages such as login or account creation forms.

## Why Use the Shim?

Monocle can normally be added directly to your page:

<script async src="https://mcl.spur.us/d/mcl.js?tk=YOUR_TOKEN"></script>

This is the simplest integration method but allows the Monocle script to run in the same environment as your page.

If you want additional isolation—for example, to protect your forms and cookies—you can host and load the Frame Proxy Shim.

The shim:
	•	Creates a sandboxed iframe.
	•	Loads Monocle into that iframe.
	•	Uses a cryptographic nonce to verify all messages.
	•	Passes Monocle’s assessment back to your page by inserting a hidden input into marked forms.

## Full Shim Example (mclfp.js)

[View the shim script hosted in this repo](mclfp.js)

Here is a complete, production-ready shim script you can host:
```js
(function() {
  function init() {
    // Generate a cryptographic nonce for message verification
    const nonceArray = new Uint8Array(32);
    crypto.getRandomValues(nonceArray);
    const nonce = Array.from(nonceArray, b => b.toString(16).padStart(2, '0')).join('');

    // Extract tk (token) and optional cpd param from this script's URL
    let tk = null, cpd = null;
    document.querySelectorAll('script[src]').forEach(script => {
      if (script.src.includes('mclfp.js')) {
        const url = new URL(script.src);
        tk = url.searchParams.get('tk');
        cpd = url.searchParams.get('cpd');
      }
    });
    if (!tk) return;

    // Build Monocle URL
    let monocleUrl = `https://mcl.spur.us/d/mcl.js?tk=${tk}`;
    if (cpd) monocleUrl += `&cpd=${cpd}`;

    // Create sandboxed iframe
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.sandbox = 'allow-scripts';
    iframe.id = 'mcl-frame';
    iframe.dataset.nonce = nonce;

    // Inline HTML for iframe using srcdoc
    iframe.srcdoc = `
      <!DOCTYPE html>
      <html>
      <body>
        <script async src="${monocleUrl}" id="_mcl"></script>
        <script>
          const IFRAME_NONCE = '${nonce}';
          function sendResult(bundle) {
            parent.postMessage({ type: 'mcl_result', nonce: IFRAME_NONCE, bundle: bundle || null, timestamp: Date.now() }, '*');
          }
          const check = setInterval(() => {
            if (typeof window.MCL === "object" && typeof window.MCL.getAssessment === "function") {
              clearInterval(check);
              sendResult(window.MCL.getAssessment());
            }
          }, 100);
        <\/script>
      </body>
      </html>
    `;

    document.body.appendChild(iframe);

    // Listen for messages from Monocle iframe
    window.addEventListener('message', function(event) {
      if (!event.data || event.data.type !== 'mcl_result') return;
      const i = document.getElementById('mcl-frame');
      if (!i || i.dataset.nonce !== event.data.nonce) {
        console.warn('Monocle nonce mismatch.');
        return;
      }
      const bundle = event.data.bundle;
      document.querySelectorAll('form.monocle-enriched').forEach(form => {
        const existing = form.querySelector('input[name="monocle"]');
        if (existing) existing.remove();
        const hidden = document.createElement('input');
        hidden.type = 'hidden';
        hidden.name = 'monocle';
        hidden.value = bundle || '';
        form.appendChild(hidden);
      });
      if (!window.MCL) window.MCL = {};
      window.MCL.getAssessment = function() { return bundle; };
      i.remove();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
```

## Hosting and Using the Shim
	1.	Host this file on your server or CDN (e.g., https://example.com/mclfp.js).
	2.	Add the script to your webpage:

<script
  async
  src="/mclfp.js?tk=YOUR_TOKEN"
  integrity="sha384-<your_generated_hash>"
  id="_mcl">
</script>

	•	The tk parameter is your Monocle token.
	•	The integrity attribute provides tamper detection.

###  Generating and Applying an Integrity Hash

If you host the shim yourself, you should use Subresource Integrity (SRI) to verify it hasn’t been altered.

Run this command:

openssl dgst -sha384 -binary mclfp.js | openssl base64 -A

This outputs a base64 hash. Prefix it with sha384- and include it in your <script> tag:

```html
<script src="/mclfp.js?tk=YOUR_TOKEN"
        integrity="sha384-<your_generated_hash>"
        async></script>
```

If you later modify the shim, regenerate the hash.


## Marking Forms for Monocle

Add class="monocle-enriched" to any form you want Monocle-protected:

```html
<form class="monocle-enriched" method="POST" action="/login">
  <input type="text" name="username" required>
  <input type="password" name="password" required>
  <button type="submit">Login</button>
</form>
```

When Monocle completes its assessment, the shim will inject a hidden input:

```html
<input type="hidden" name="monocle" value="...assessment bundle...">
```
Your backend should validate this monocle value using Spur’s API.

## Summary

The Frame Proxy Shim allows you to integrate Monocle while ensuring the Monocle code cannot execute in your page’s context.

By hosting and loading this shim, you gain an additional layer of isolation for your login or account creation forms without losing Monocle’s security assessment benefits.
