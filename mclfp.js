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
