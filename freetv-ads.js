/* FreeTV ad breaks - a self-contained VAST 2/3 client and scheduler.
 *
 * Why this exists instead of Fluid Player / video.js + IMA: the player is ES5 and supports
 * WebView 45 (2015). Every off-the-shelf VAST player is ES6+ and would blank the app on the
 * low end of the range the pre-flight check deliberately keeps alive. This is ~350 lines with
 * no dependencies, in the same dialect as the rest of the file.
 *
 * It does not touch the content <video>. The ad plays in its own element layered on top, so
 * hls.js is never torn down - re-attaching it costs 5-25s of rebuffering (see the watchdog in
 * tryStream), which is far more expensive than the ad is worth.
 *
 * Integration (once you have a VAST tag URL from the network):
 *
 *   FreeTVAds.init({ tag: "https://...", contentVideo: video });
 *   ... in play(), after the stream starts:   FreeTVAds.contentStarted();
 *   ... in stop() / channel change:           FreeTVAds.contentStopped();
 *   ... in your keydown handler:              FreeTVAds.activity();
 *
 * Nothing else is required. With no tag configured every call is a no-op, so it is safe to
 * wire in before an ad account exists.
 */
window.FreeTVAds = (function () {
  "use strict";

  var cfg = {
    tag: "",                 // VAST tag URL. Empty = module disabled, all calls no-op.
    preRoll: false,          // ad before the channel starts. Off by default - it makes the app
                             // feel broken on first launch, and channel-surfing would hit it
                             // on every zap.
    midRollMinutes: 12,      // minutes of continuous watching between breaks. Broadcast-normal
                             // is 8-15. Below ~5 is how you get uninstalled.
    maxBreaksPerHour: 4,
    idleMinutes: 30,         // no remote input for this long -> stop asking for ads entirely.
                             // People leave TV apps running in empty rooms; billing a room with
                             // nobody in it is the exact signature ad-quality vendors hunt for.
    skipAfterSeconds: 5,     // when the Skip button becomes usable
    maxAdSeconds: 45,        // hard ceiling. Ad is killed at this point no matter what.
    loadTimeoutMs: 6000,     // VAST fetch + first frame budget. Miss it and we just don't
                             // show an ad. Never make the viewer wait on our revenue.
    wrapperDepth: 5,         // VAST wrapper redirect chain limit
    contentVideo: null,
    onBreakStart: null,
    onBreakEnd: null,
    debug: false
  };

  var ready = false, suspended = false, inBreak = false;
  var watchTimer = null, lastActivity = 0, breakTimes = [];
  var layer = null, adVideo = null, skipBtn = null, countdown = null;

  function log() {
    if (!cfg.debug || !window.console) return;
    try { console.log.apply(console, ["[ads]"].concat([].slice.call(arguments))); } catch (e) {}
  }

  /* ---------- beacons ----------------------------------------------------
   * Image() rather than XHR on purpose: tracking pixels are cross-origin and
   * almost never send CORS headers, so XHR would fail on exactly the calls the
   * network uses to decide whether to pay us.
   */
  function fire(urls) {
    if (!urls) return;
    for (var i = 0; i < urls.length; i++) {
      if (!urls[i]) continue;
      try { (new Image()).src = urls[i]; log("beacon", urls[i].slice(0, 80)); } catch (e) {}
    }
  }

  /* ---------- VAST ------------------------------------------------------- */

  function text(node) {
    if (!node) return "";
    return (node.textContent || "").replace(/^\s+|\s+$/g, "");
  }

  function all(root, tag) {
    return root ? [].slice.call(root.getElementsByTagName(tag)) : [];
  }

  function durationToSeconds(s) {
    var p = String(s || "").split(":");
    if (p.length !== 3) return 0;
    return (+p[0] || 0) * 3600 + (+p[1] || 0) * 60 + (parseFloat(p[2]) || 0);
  }

  // Collects Impression + TrackingEvents from every document in a wrapper chain,
  // then the MediaFile from the InLine at the end of it.
  function loadVast(url, depth, acc, done, fail) {
    if (depth > cfg.wrapperDepth) { fail("wrapper chain too deep"); return; }

    var xhr = new XMLHttpRequest();
    var settled = false;
    var giveUp = setTimeout(function () {
      if (settled) return;
      settled = true;
      try { xhr.abort(); } catch (e) {}
      fail("vast timeout");
    }, cfg.loadTimeoutMs);

    xhr.open("GET", url, true);
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4 || settled) return;
      settled = true; clearTimeout(giveUp);
      if (xhr.status !== 200 || !xhr.responseText) { fail("vast http " + xhr.status); return; }

      var doc;
      try { doc = new DOMParser().parseFromString(xhr.responseText, "text/xml"); }
      catch (e) { fail("vast unparseable"); return; }
      if (!doc || doc.getElementsByTagName("parsererror").length) { fail("vast malformed"); return; }

      // impressions and tracking accumulate down the whole chain
      var imps = all(doc, "Impression");
      for (var i = 0; i < imps.length; i++) acc.impressions.push(text(imps[i]));

      var trk = all(doc, "Tracking");
      for (var j = 0; j < trk.length; j++) {
        var ev = trk[j].getAttribute("event");
        if (!ev) continue;
        (acc.tracking[ev] = acc.tracking[ev] || []).push(text(trk[j]));
      }

      var wrapperUri = all(doc, "VASTAdTagURI")[0];
      if (wrapperUri) { loadVast(text(wrapperUri), depth + 1, acc, done, fail); return; }

      // InLine - find a playable linear creative
      var linear = all(doc, "Linear")[0];
      if (!linear) { fail("no linear creative"); return; }

      var files = all(linear, "MediaFile"), best = null, bestScore = -1;
      for (var k = 0; k < files.length; k++) {
        var f = files[k], type = (f.getAttribute("type") || "").toLowerCase();
        // The content <video> is the only decoder we have; mp4 is the only thing an
        // Android WebView reliably plays without a media-source pipeline.
        if (type.indexOf("mp4") < 0) continue;
        var w = +(f.getAttribute("width") || 0);
        // prefer the largest file that is still <= 1280 wide - TV panels are big, but a
        // 4k creative on a cheap stick stutters worse than it impresses
        var score = w > 1280 ? 1280 - (w - 1280) : w;
        if (score > bestScore) { bestScore = score; best = f; }
      }
      if (!best) { fail("no mp4 mediafile"); return; }

      acc.url = text(best);
      acc.duration = durationToSeconds(text(all(linear, "Duration")[0]));
      acc.skipOffset = linear.getAttribute("skipoffset") || "";
      if (!acc.url) { fail("empty mediafile"); return; }
      done(acc);
    };
    try { xhr.send(); } catch (e) { clearTimeout(giveUp); settled = true; fail("vast send failed"); }
  }

  /* ---------- overlay ---------------------------------------------------- */

  function buildLayer() {
    if (layer) return;
    layer = document.createElement("div");
    layer.id = "adLayer";
    layer.setAttribute("aria-hidden", "true");
    layer.style.cssText =
      "position:fixed;inset:0;z-index:9000;background:#000;display:none;" +
      "align-items:center;justify-content:center";

    adVideo = document.createElement("video");
    adVideo.setAttribute("playsinline", "");
    adVideo.setAttribute("disableremoteplayback", "");
    adVideo.style.cssText = "width:100%;height:100%;object-fit:contain;background:#000";
    layer.appendChild(adVideo);

    countdown = document.createElement("div");
    countdown.style.cssText =
      "position:absolute;left:24px;bottom:26px;font:600 15px/1 system-ui,sans-serif;" +
      "color:#e8ecf3;background:rgba(0,0,0,.62);padding:9px 13px;border-radius:4px;" +
      "letter-spacing:.02em";
    layer.appendChild(countdown);

    // The single most important element in this file. Research on TV ad units is
    // consistent: third-party creatives ship close buttons that are not focusable, D-pad
    // traversal never reaches them, and the viewer is stranded holding a remote. Ours is a
    // real <button>, autofocused, and the only thing on the layer that can take focus.
    skipBtn = document.createElement("button");
    skipBtn.type = "button";
    skipBtn.textContent = "Skip";
    skipBtn.style.cssText =
      "position:absolute;right:24px;bottom:24px;font:600 16px/1 system-ui,sans-serif;" +
      "color:#0e1014;background:#e8ecf3;border:0;border-radius:4px;padding:13px 26px;" +
      "cursor:pointer;display:none;outline-offset:3px";
    skipBtn.addEventListener("focus", function () { skipBtn.style.outline = "3px solid #6cf"; });
    skipBtn.addEventListener("blur", function () { skipBtn.style.outline = "none"; });
    layer.appendChild(skipBtn);

    document.body.appendChild(layer);
  }

  /* ---------- the break -------------------------------------------------- */

  function playBreak() {
    if (inBreak || suspended || !cfg.tag || !cfg.contentVideo) return;

    var acc = { impressions: [], tracking: {}, url: "", duration: 0, skipOffset: "" };
    loadVast(cfg.tag, 0, acc, start, function (why) { log("no ad:", why); });

    function start(ad) {
      if (inBreak || suspended) return;
      inBreak = true;
      buildLayer();

      var content = cfg.contentVideo;
      var wasMuted = content.muted;
      var quarters = { 25: false, 50: false, 75: false };
      var finished = false;
      var hardStop = null, tick = null;

      // Pause the content but leave hls.js attached. On a live stream we will be behind
      // the live edge when we come back, so end() seeks forward to it.
      try { content.pause(); } catch (e) {}

      layer.style.display = "flex";
      countdown.textContent = "Advertisement";
      skipBtn.style.display = "none";

      function end(reason) {
        if (finished) return;
        finished = true;
        clearTimeout(hardStop); clearInterval(tick);
        log("break end:", reason);

        try { adVideo.pause(); } catch (e) {}
        adVideo.removeAttribute("src");
        try { adVideo.load(); } catch (e) {}
        layer.style.display = "none";
        skipBtn.style.display = "none";
        inBreak = false;
        breakTimes.push(nowMs());

        content.muted = wasMuted;
        // live: jump to the live edge rather than resuming 30s in the past
        try {
          var sk = content.seekable;
          if (sk && sk.length) {
            var edge = sk.end(sk.length - 1);
            if (isFinite(edge) && edge - content.currentTime > 2) content.currentTime = edge - 0.5;
          }
        } catch (e) {}
        try { content.play(); } catch (e) {}

        if (cfg.onBreakEnd) try { cfg.onBreakEnd(reason); } catch (e) {}
        schedule();
      }

      skipBtn.onclick = function () { fire(ad.tracking.skip); end("skipped"); };

      adVideo.onerror = function () { end("ad error"); };
      adVideo.onended = function () { fire(ad.tracking.complete); end("complete"); };

      adVideo.onplaying = function () {
        adVideo.onplaying = null;
        fire(ad.impressions);
        fire(ad.tracking.start);
        if (cfg.onBreakStart) try { cfg.onBreakStart(); } catch (e) {}

        tick = setInterval(function () {
          var d = adVideo.duration || ad.duration || 0;
          var t = adVideo.currentTime || 0;
          if (d > 0) {
            var pct = (t / d) * 100;
            if (!quarters[25] && pct >= 25) { quarters[25] = true; fire(ad.tracking.firstQuartile); }
            if (!quarters[50] && pct >= 50) { quarters[50] = true; fire(ad.tracking.midpoint); }
            if (!quarters[75] && pct >= 75) { quarters[75] = true; fire(ad.tracking.thirdQuartile); }
            countdown.textContent = "Advertisement · " + Math.max(0, Math.ceil(d - t)) + "s";
          }
          if (t >= cfg.skipAfterSeconds && skipBtn.style.display === "none") {
            skipBtn.style.display = "block";
            try { skipBtn.focus(); } catch (e) {}
          }
        }, 250);
      };

      // Belt and braces: if the creative stalls, never hold the viewer hostage.
      hardStop = setTimeout(function () { end("hard timeout"); },
        Math.min(cfg.maxAdSeconds, (ad.duration || cfg.maxAdSeconds) + 8) * 1000);

      adVideo.muted = wasMuted;
      adVideo.src = ad.url;
      try { adVideo.play(); } catch (e) { end("play rejected"); }
    }
  }

  /* ---------- scheduling ------------------------------------------------- */

  function nowMs() { return (new Date()).getTime(); }

  function breaksInLastHour() {
    var cut = nowMs() - 3600000, n = 0;
    for (var i = 0; i < breakTimes.length; i++) if (breakTimes[i] > cut) n++;
    return n;
  }

  function schedule() {
    clearTimeout(watchTimer);
    if (!ready || suspended || !cfg.tag) return;
    watchTimer = setTimeout(function () {
      if (suspended || inBreak) return;
      if (nowMs() - lastActivity > cfg.idleMinutes * 60000) { log("idle - no ad"); schedule(); return; }
      if (breaksInLastHour() >= cfg.maxBreaksPerHour) { log("hourly cap"); schedule(); return; }
      if (cfg.contentVideo && cfg.contentVideo.paused) { schedule(); return; }
      playBreak();
    }, cfg.midRollMinutes * 60000);
  }

  /* ---------- api -------------------------------------------------------- */

  return {
    init: function (opts) {
      for (var k in opts) if (opts.hasOwnProperty(k)) cfg[k] = opts[k];
      lastActivity = nowMs();
      ready = true;
      log("init", cfg.tag ? "tag set" : "no tag - disabled");
      return this;
    },
    // call when a channel/title actually starts playing
    contentStarted: function () {
      if (!ready || !cfg.tag) return;
      if (cfg.preRoll && !inBreak && breaksInLastHour() < cfg.maxBreaksPerHour) playBreak();
      else schedule();
    },
    contentStopped: function () { clearTimeout(watchTimer); },
    // call from the keydown handler so an empty room stops earning
    activity: function () { lastActivity = nowMs(); },
    // casting: we are a remote, not a player - never inject an ad
    suspend: function () { suspended = true; clearTimeout(watchTimer); },
    resume: function () { suspended = false; schedule(); },
    inBreak: function () { return inBreak; },
    config: cfg
  };
})();
