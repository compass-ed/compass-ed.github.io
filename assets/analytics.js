/* Vercel Web Analytics integration for Compass Ed */
(function() {
  // Inline the Vercel Analytics inject function
  // This is adapted from @vercel/analytics for use without a build step
  
  const mode = location.hostname === 'localhost' || location.hostname === '127.0.0.1' || location.hostname === '[::1]' 
    ? 'development' 
    : 'production';
  
  // Only track in production
  if (mode !== 'production') {
    console.log('[Analytics] Running in development mode - tracking disabled');
    return;
  }
  
  const endpoint = 'https://va.vercel-scripts.com/v1';
  
  function getConnectionSpeed() {
    return 'connection' in navigator && navigator.connection && 'effectiveType' in navigator.connection
      ? navigator.connection.effectiveType
      : '';
  }
  
  function sendEvent(path) {
    const data = {
      o: location.origin,
      sv: '1.0.0',
      ts: Date.now(),
      r: document.referrer,
      p: path || location.pathname,
      cs: getConnectionSpeed()
    };
    
    const url = endpoint + '/page';
    
    if (navigator.sendBeacon) {
      navigator.sendBeacon(url, JSON.stringify(data));
    } else {
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        keepalive: true
      }).catch(function() {
        // Silently fail - analytics should not break the app
      });
    }
  }
  
  // Track initial page view
  sendEvent();
  
  // Track hash changes (for single-page app routing)
  var lastHash = location.hash;
  setInterval(function() {
    if (location.hash !== lastHash) {
      lastHash = location.hash;
      sendEvent(location.pathname + location.hash);
    }
  }, 100);
  
  // Track history API navigation
  var pushState = history.pushState;
  var replaceState = history.replaceState;
  
  history.pushState = function() {
    pushState.apply(history, arguments);
    sendEvent();
  };
  
  history.replaceState = function() {
    replaceState.apply(history, arguments);
    sendEvent();
  };
  
  window.addEventListener('popstate', function() {
    sendEvent();
  });
})();
