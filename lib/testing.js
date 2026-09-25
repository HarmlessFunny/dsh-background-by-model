import { c as DSH_FLOOR, d as reportToMarkdown, f as symptomOf, i as resolveHostRoots, l as HOST_CONTRACTS, o as versionOf, p as verdictOf, r as meetsFloor, s as CONTRACT_GROUPS, t as checkHostOnDisk, u as labelOf } from "./host-scan-C6rdxkf8.js";
const UI_CSS = `
/* The section is rendered INLINE inside the host settings dialog's content
 * column: the host provides the modal chrome (backdrop, centering, closing).
 * These classes style only the embedded shell; transient fixed layers (toast,
 * color picker, background editor) escape through Portals on <html>. */
.dab-root{position:relative;color:var(--dsw-alias-label-primary);animation:dab-fade-in .35s ease both;container-type:inline-size;display:flex;flex-direction:column;align-items:center;width:100%;min-width:0;--dab-mono:ui-monospace,"Cascadia Mono","SF Mono",Consolas,"Courier New",monospace}
.dab-root *,.dab-root *::before,.dab-root *::after{box-sizing:border-box}
.dab-root button{font-family:inherit}

/* ── shell: nav rail + page body ─────────────────────────────────────────── */
.dab-shell{display:grid;grid-template-columns:158px minmax(0,1fr);gap:26px;align-items:start;padding-bottom:8px;width:100%;max-width:980px;margin:0 auto}
.dab-nav{position:sticky;top:0;display:flex;flex-direction:column;gap:18px}
.dab-brand{display:flex;align-items:center;gap:10px;padding:2px 6px}
.dab-brand-tile{width:30px;height:30px;flex:none;border-radius:9px;display:grid;place-items:center;color:var(--dsw-alias-brand-text);background:var(--dsw-alias-brand-primary);box-shadow:0 4px 14px -4px var(--dsw-alias-brand-primary)}
.dab-brand-name{font-size:13px;font-weight:650;letter-spacing:.01em;line-height:1.25}
.dab-brand-tag{font-size:9px;letter-spacing:.16em;font-weight:600;color:var(--dsw-alias-label-quaternary,var(--dsw-alias-label-tertiary));text-transform:uppercase}
.dab-nav-list{position:relative;display:flex;flex-direction:column;gap:4px}
.dab-nav-ind{position:absolute;left:0;right:0;top:0;height:38px;border-radius:11px;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2);background:color-mix(in srgb,var(--dsw-alias-brand-primary) 13%,transparent);border-color:color-mix(in srgb,var(--dsw-alias-brand-primary) 25%,transparent);transition:transform .38s cubic-bezier(.22,1,.36,1)}
.dab-nav-item{position:relative;z-index:1;display:flex;align-items:center;gap:10px;height:38px;padding:0 12px;border:0;background:none;border-radius:11px;color:var(--dsw-alias-label-tertiary);font-size:13px;cursor:pointer;text-align:left;transition:color .22s ease}
.dab-nav-item:hover{color:var(--dsw-alias-label-primary)}
.dab-nav-item.is-active{color:var(--dsw-alias-brand-primary);font-weight:600}
.dab-nav-item svg{flex:none;transition:transform .3s cubic-bezier(.34,1.56,.64,1)}
.dab-nav-item:hover svg{transform:scale(1.14) rotate(-5deg)}

/* ── page chrome ─────────────────────────────────────────────────────────── */
.dab-page{animation:dab-page-in .4s cubic-bezier(.22,1,.36,1) both;min-width:0;display:flex;flex-direction:column;gap:13px}
.dab-head{margin:2px 0 5px}
.dab-overline{font-size:10.5px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:var(--dsw-alias-brand-primary);opacity:.9}
.dab-h1{margin:4px 0 0;font-size:21px;font-weight:700;letter-spacing:-.01em}
.dab-desc{margin:6px 0 0;font-size:12.5px;line-height:1.55;color:var(--dsw-alias-label-tertiary);max-width:56ch}
.dab-card{background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2);border-radius:16px;padding:18px}
.dab-card-hover{transition:transform .28s ease,box-shadow .28s ease,border-color .28s ease}
.dab-card-hover:hover{transform:translateY(-2px);box-shadow:0 10px 28px -12px rgba(0,0,0,.28)}
.dab-rise{animation:dab-rise-in .55s cubic-bezier(.22,1,.36,1) both;animation-delay:calc(var(--d,0) * 62ms)}

/* ── accent hero (color orb) ─────────────────────────────────────────────── */
.dab-hero-accent{display:flex;align-items:center;gap:24px;flex-wrap:wrap}
.dab-orb-wrap{position:relative;width:118px;height:118px;flex:none}
.dab-orb{position:absolute;inset:11px;border-radius:50%;background:radial-gradient(circle at 32% 28%,rgba(255,255,255,.5),rgba(255,255,255,0) 44%),var(--c,#888);box-shadow:0 16px 36px -10px var(--c-soft,transparent),inset 0 -10px 20px rgba(0,0,0,.16);animation:dab-orb-in .7s cubic-bezier(.22,1,.36,1) both}
.dab-orb-ring{position:absolute;inset:0;border-radius:50%;background:conic-gradient(from 0deg,transparent 0 30%,var(--c,#888) 46%,transparent 62%,transparent 76%,var(--c,#888) 90%,transparent 100%);-webkit-mask:radial-gradient(farthest-side,transparent calc(100% - 3.5px),#000 calc(100% - 2.5px));mask:radial-gradient(farthest-side,transparent calc(100% - 3.5px),#000 calc(100% - 2.5px));animation:dab-spin 7s linear infinite;opacity:.9}
.dab-hex-caption{font-size:11px;color:var(--dsw-alias-label-tertiary);letter-spacing:.04em}
.dab-hex{font-family:var(--dab-mono);font-size:24px;font-weight:600;letter-spacing:.02em;line-height:1.2;margin-top:2px}
.dab-hsl-row{display:flex;gap:16px;margin-top:7px;font-family:var(--dab-mono);font-size:11px;color:var(--dsw-alias-label-tertiary)}
.dab-hsl-row b{font-weight:600;color:var(--dsw-alias-label-secondary,var(--dsw-alias-label-tertiary))}

/* ── swatches ────────────────────────────────────────────────────────────── */
.dab-swatch-title{font-size:12px;font-weight:600;margin-bottom:10px;color:var(--dsw-alias-label-secondary,var(--dsw-alias-label-tertiary))}
.dab-swatches{display:flex;flex-wrap:wrap;gap:9px}
.dab-swatch{width:25px;height:25px;border-radius:50%;border:0;padding:0;cursor:pointer;box-shadow:inset 0 0 0 1px rgba(0,0,0,.1);transition:transform .22s cubic-bezier(.34,1.56,.64,1),box-shadow .22s ease}
.dab-swatch:hover{transform:scale(1.2)}
.dab-swatch.is-on{box-shadow:0 0 0 2px var(--dsw-alias-bg-layer-1),0 0 0 4px var(--dsw-alias-brand-primary)}

/* ── wheel card ──────────────────────────────────────────────────────────── */
.dab-wheel-card{position:relative;display:flex;align-items:center;justify-content:center;gap:28px;flex-wrap:wrap;padding:24px 18px}
.dab-wheel-glow{position:absolute;width:230px;height:230px;border-radius:50%;filter:blur(48px);opacity:.2;background:var(--c,#888);pointer-events:none;transition:background .4s ease}
.dab-wheel{position:relative;cursor:crosshair;border-radius:50%;box-shadow:0 12px 32px -14px rgba(0,0,0,.4)}
.dab-hint{font-size:11.5px;line-height:1.55;color:var(--dsw-alias-label-tertiary);padding:0 4px}

/* ── precise color inputs ────────────────────────────────────────────────── */
.dab-inputs{display:flex;flex-direction:column;gap:10px;min-width:172px}
.dab-field{display:flex;align-items:center;gap:8px}
.dab-field-label{width:14px;text-align:center;font-family:var(--dab-mono);font-size:11px;font-weight:600;color:var(--dsw-alias-label-tertiary)}
.dab-num{flex:1;min-width:0;height:30px;padding:0 10px;border-radius:9px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-family:var(--dab-mono);font-size:12px;outline:none;transition:border-color .2s,box-shadow .2s}
.dab-num:focus{border-color:var(--dsw-alias-brand-primary);box-shadow:0 0 0 3px color-mix(in srgb,var(--dsw-alias-brand-primary) 18%,transparent)}
.dab-num::-webkit-outer-spin-button,.dab-num::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}
.dab-num{-moz-appearance:textfield;appearance:textfield}
.dab-urlinput{flex:1;min-width:180px;height:34px;padding:0 12px;border-radius:10px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-size:12.5px;outline:none;transition:border-color .2s}
.dab-urlinput::placeholder{color:var(--dsw-alias-label-quaternary)}
.dab-urlinput:focus{border-color:var(--dsw-alias-brand-primary);box-shadow:0 0 0 3px color-mix(in srgb,var(--dsw-alias-brand-primary) 18%,transparent)}
.dab-swatch-lg{height:38px;border-radius:10px;border:1px solid var(--dsw-alias-border-l2);box-shadow:inset 0 0 14px rgba(0,0,0,.1);transition:transform .3s ease}
.dab-swatch-lg:hover{transform:scale(1.02)}

/* ── buttons & chips ─────────────────────────────────────────────────────── */
.dab-btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;height:34px;padding:0 14px;border-radius:10px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-button-elevated-fill);color:var(--dsw-alias-label-primary);font-size:12.5px;font-weight:550;cursor:pointer;transition:transform .18s ease,box-shadow .18s ease,border-color .18s ease,opacity .18s ease,background .18s ease}
.dab-btn:hover:not(:disabled){transform:translateY(-1px);box-shadow:0 5px 14px -6px rgba(0,0,0,.32)}
.dab-btn:active:not(:disabled){transform:translateY(0) scale(.97);box-shadow:none}
.dab-btn:disabled{opacity:.5;cursor:not-allowed}
.dab-btn-primary{background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-text);border-color:transparent}
.dab-btn-danger{color:var(--dsw-alias-state-error-primary)}
.dab-btn-ghost{background:transparent;border-color:transparent;color:var(--dsw-alias-label-secondary,var(--dsw-alias-label-tertiary))}
.dab-btn-ghost:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2);box-shadow:none}
.dab-btn:focus-visible,.dab-nav-item:focus-visible,.dab-seg-item:focus-visible,.dab-swatch:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
.dab-chip-row{display:flex;flex-wrap:wrap;gap:8px}
.dab-chip{height:30px;padding:0 14px;border-radius:99px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary,var(--dsw-alias-label-tertiary));font-size:12px;cursor:pointer;display:inline-flex;align-items:center;gap:6px;transition:all .22s ease}
.dab-chip:hover{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-label-primary)}
.dab-chip.is-active{background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-text);border-color:transparent}

/* ── sliders ─────────────────────────────────────────────────────────────── */
.dab-slider-block{display:flex;flex-direction:column;gap:6px}
.dab-slider-block + .dab-slider-block{margin-top:13px}
.dab-slider-label{font-size:12px;font-weight:550;color:var(--dsw-alias-label-secondary,var(--dsw-alias-label-tertiary))}
.dab-slider-val{font-family:var(--dab-mono);font-size:11px;color:var(--dsw-alias-label-tertiary);min-width:44px;text-align:right}
.dab-slider{-webkit-appearance:none;appearance:none;flex:1;min-width:0;height:4px;border-radius:99px;outline:none;cursor:pointer;margin:5px 0;background:linear-gradient(to right,var(--dsw-alias-brand-primary) calc(var(--pct,50) * 1%),var(--dsw-alias-border-l2) calc(var(--pct,50) * 1%));transition:height .15s ease}
.dab-slider:hover{height:5px}
.dab-slider::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:15px;height:15px;border-radius:50%;background:var(--dsw-alias-button-elevated-fill,#fff);border:2px solid var(--dsw-alias-brand-primary);box-shadow:0 1px 5px rgba(0,0,0,.28);transition:transform .16s cubic-bezier(.34,1.56,.64,1)}
.dab-slider:hover::-webkit-slider-thumb,.dab-slider:focus-visible::-webkit-slider-thumb{transform:scale(1.22)}
.dab-slider:active::-webkit-slider-thumb{transform:scale(1.34)}
.dab-slider::-moz-range-thumb{width:13px;height:13px;border-radius:50%;background:var(--dsw-alias-button-elevated-fill,#fff);border:2px solid var(--dsw-alias-brand-primary)}

/* ── interface part cards ────────────────────────────────────────────────── */
.dab-grid-parts{display:grid;grid-template-columns:repeat(auto-fill,minmax(256px,1fr));gap:13px}
.dab-part-head{display:flex;align-items:center;gap:11px;margin-bottom:14px}
.dab-part-ico{width:32px;height:32px;flex:none;border-radius:10px;display:grid;place-items:center;color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-layer-2);background:color-mix(in srgb,var(--dsw-alias-brand-primary) 12%,transparent)}
.dab-part-name{font-size:13.5px;font-weight:600}
.dab-part-badge{margin-left:auto;font-family:var(--dab-mono);font-size:11px;color:var(--dsw-alias-label-tertiary);background:var(--dsw-alias-bg-layer-2);border-radius:99px;padding:3px 9px}

/* ── segmented control ───────────────────────────────────────────────────── */
.dab-seg{position:relative;display:inline-flex;padding:3px;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2);border-radius:11px}
.dab-seg-thumb{position:absolute;top:3px;bottom:3px;left:3px;width:var(--w,96px);border-radius:8px;background:var(--dsw-alias-button-elevated-fill);box-shadow:0 2px 8px -2px rgba(0,0,0,.28);transition:transform .32s cubic-bezier(.22,1,.36,1)}
.dab-seg-item{position:relative;z-index:1;display:inline-flex;align-items:center;justify-content:center;gap:6px;width:var(--w,96px);height:30px;border:0;background:none;border-radius:8px;color:var(--dsw-alias-label-tertiary);font-size:12.5px;cursor:pointer;transition:color .25s ease}
.dab-seg-item.is-active{color:var(--dsw-alias-label-primary);font-weight:600}

/* ── toggle switch ───────────────────────────────────────────────────────── */
.dab-toggle{position:relative;width:42px;height:24px;flex:none;border-radius:99px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);cursor:pointer;padding:0;transition:background .28s ease,border-color .28s ease}
.dab-toggle-knob{position:absolute;top:2.5px;left:2.5px;width:17px;height:17px;border-radius:50%;background:var(--dsw-alias-label-secondary,#999);box-shadow:0 1px 3px rgba(0,0,0,.3);transition:transform .28s cubic-bezier(.22,1,.36,1),background .28s ease}
.dab-toggle.is-on{background:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary)}
.dab-toggle.is-on .dab-toggle-knob{transform:translateX(18px);background:#fff}

/* ── background preview hero ─────────────────────────────────────────────── */
.dab-hero{position:relative;border-radius:16px;overflow:hidden;aspect-ratio:16/9;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2)}
.dab-hero-img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transition:transform .5s cubic-bezier(.22,1,.36,1)}
.dab-hero:hover .dab-hero-img{transform:scale(1.03)}
.dab-hero-empty{position:absolute;inset:6px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;color:var(--dsw-alias-label-tertiary);font-size:12.5px;border:1.5px dashed var(--dsw-alias-border-l2);border-radius:12px;cursor:pointer;background:transparent;transition:border-color .25s,color .25s,background .25s;width:auto;height:auto}
.dab-hero-empty:hover{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}
.dab-hero-empty.is-over{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary);background:color-mix(in srgb,var(--dsw-alias-brand-primary) 8%,transparent)}
.dab-hero-badge{position:absolute;top:10px;left:10px;display:inline-flex;align-items:center;gap:5px;height:24px;padding:0 11px;border-radius:99px;background:rgba(0,0,0,.45);color:#fff;font-size:11px;backdrop-filter:blur(6px);pointer-events:none}
.dab-hero-veil{position:absolute;left:0;right:0;bottom:0;padding:34px 12px 12px;display:flex;align-items:flex-end;justify-content:flex-end;gap:8px;background:linear-gradient(to top,rgba(0,0,0,.55),rgba(0,0,0,0));opacity:0;transform:translateY(6px);transition:opacity .3s ease,transform .3s ease}
.dab-hero:hover .dab-hero-veil{opacity:1;transform:none}
.dab-hero-veil .dab-btn{background:rgba(255,255,255,.94);color:#14161a;border-color:transparent;height:30px;font-size:12px}
.dab-hero-veil .dab-btn-danger{color:#dc2626}

/* ── profile page ────────────────────────────────────────────────────────── */
.dab-profile-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(238px,1fr));gap:13px}
.dab-profile-ico{width:38px;height:38px;border-radius:11px;display:grid;place-items:center;margin-bottom:13px;color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-layer-2);background:color-mix(in srgb,var(--dsw-alias-brand-primary) 12%,transparent)}
.dab-profile-title{font-size:14px;font-weight:650}
.dab-profile-desc{font-size:12px;color:var(--dsw-alias-label-tertiary);line-height:1.55;margin:5px 0 15px}
.dab-footer{margin-top:6px;padding:14px 4px 0;border-top:1px solid var(--dsw-alias-border-l2);display:flex;align-items:center;justify-content:space-between;font-size:11px;color:var(--dsw-alias-label-tertiary)}
.dab-footer-mono{font-family:var(--dab-mono);letter-spacing:.02em}

/* ── toast ───────────────────────────────────────────────────────────────── */
.dab-toast{position:fixed;left:50%;bottom:30px;transform:translateX(-50%);display:flex;align-items:center;gap:8px;height:38px;padding:0 16px;border-radius:99px;background:var(--dsw-alias-bg-layer-3,var(--dsw-alias-bg-layer-2));border:1px solid var(--dsw-alias-border-l2);box-shadow:0 10px 30px -8px rgba(0,0,0,.38);font-size:12.5px;z-index:10001;animation:dab-toast-in .32s cubic-bezier(.22,1,.36,1) both}
.dab-toast-ok{color:var(--dsw-alias-brand-primary);display:grid;place-items:center}
.dab-toast-err{color:var(--dsw-alias-state-error-primary);display:grid;place-items:center}

/* ── modals (editor / eyedropper / crash) ────────────────────────────────── */
/* Pin to the viewport explicitly with vw/vh so ancestor padding/margins on
 * body cannot shift or clip the overlay; keep it above host sidebar chrome.
 * pointer-events:auto re-enables interaction: these overlays render inside a
 * Portal root that is pointer-events:none so it never blocks the page alone. */
.dab-overlay{position:fixed;left:0;top:0;width:100vw;height:100vh;z-index:999999;background:rgba(8,10,14,.62);backdrop-filter:blur(8px);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;animation:dab-fade-in .25s ease both;pointer-events:auto}
.dab-overlay-title{color:#fff;font-size:15px;font-weight:600}
.dab-overlay-hint{color:rgba(255,255,255,.62);font-size:12px}
.dab-modal-card{animation:dab-zoom-in .3s cubic-bezier(.22,1,.36,1) both;max-width:calc(100vw - 40px);max-height:calc(100vh - 120px);overflow:auto}
.dab-overlay .dab-btn{background:rgba(255,255,255,.94);color:#14161a;border-color:transparent}
.dab-overlay .dab-btn-primary{background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-text)}
.dab-crash{display:flex;flex-direction:column;gap:10px;align-items:center;padding:28px 18px;border:1px solid var(--dsw-alias-border-l2);border-radius:16px}
.dab-crash-title{font-size:15px;font-weight:650}
.dab-crash-desc{font-size:12px;color:var(--dsw-alias-label-tertiary);text-align:center;line-height:1.5}

/* ── model rules ─────────────────────────────────────────────────────────── */
.dab-rules{display:flex;flex-direction:column;gap:12px}
.dab-rule{background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2);border-radius:16px;padding:14px;transition:border-color .25s,box-shadow .25s,opacity .25s}
.dab-rule.is-active{border-color:var(--dsw-alias-brand-primary);box-shadow:0 0 0 3px color-mix(in srgb,var(--dsw-alias-brand-primary) 16%,transparent)}
.dab-rule.is-off{opacity:.55}
.dab-rule-head{display:flex;align-items:center;gap:9px;flex-wrap:wrap}
.dab-rule-num{font-family:var(--dab-mono);font-size:11px;font-weight:700;color:var(--dsw-alias-label-tertiary);min-width:16px}
.dab-rule-badge{font-size:10px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--dsw-alias-brand-primary);background:color-mix(in srgb,var(--dsw-alias-brand-primary) 14%,transparent);border-radius:99px;padding:2px 8px}
.dab-rule-match{flex:1;min-width:150px;height:32px;padding:0 11px;border-radius:9px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-family:var(--dab-mono);font-size:12.5px;outline:none;transition:border-color .2s,box-shadow .2s}
.dab-rule-match::placeholder{color:var(--dsw-alias-label-quaternary)}
.dab-rule-match:focus{border-color:var(--dsw-alias-brand-primary);box-shadow:0 0 0 3px color-mix(in srgb,var(--dsw-alias-brand-primary) 18%,transparent)}
.dab-icon-btn{width:28px;height:28px;flex:none;display:grid;place-items:center;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer;transition:color .2s,border-color .2s,background .2s}
.dab-icon-btn:hover:not(:disabled){color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-brand-primary)}
.dab-icon-btn:disabled{opacity:.35;cursor:not-allowed}
.dab-icon-btn-danger:hover:not(:disabled){color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary)}
.dab-rule-body{margin-top:13px;display:flex;flex-direction:column;gap:13px}
.dab-rule-thumb{position:relative;border-radius:12px;overflow:hidden;aspect-ratio:16/9;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2);cursor:pointer}
.dab-rule-thumb img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.dab-rule-thumb-empty{position:absolute;inset:5px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;border:1.5px dashed var(--dsw-alias-border-l2);border-radius:9px;color:var(--dsw-alias-label-tertiary);font-size:12px;text-align:center;padding:0 10px}
.dab-rule-thumb.is-over .dab-rule-thumb-empty{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}
.dab-rule-cols{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,1fr);gap:18px;align-items:start}
.dab-rule-section-title{font-size:12px;font-weight:600;margin-bottom:9px;color:var(--dsw-alias-label-secondary,var(--dsw-alias-label-tertiary))}
@container (max-width:760px){.dab-rule-cols{grid-template-columns:1fr}}

/* ── host self-check ─────────────────────────────────────────────────────── */
.dab-verdict{display:flex;flex-direction:column;gap:14px;position:relative;overflow:hidden}
.dab-verdict::after{content:'';position:absolute;inset:0;pointer-events:none;opacity:.5;background:linear-gradient(120deg,transparent 55%,color-mix(in srgb,var(--dab-verdict-tone,transparent) 26%,transparent))}
.dab-verdict-ok{--dab-verdict-tone:var(--dsw-alias-state-success-primary,var(--dsw-alias-brand-primary));border-color:color-mix(in srgb,var(--dsw-alias-state-success-primary,var(--dsw-alias-brand-primary)) 38%,var(--dsw-alias-border-l2))}
.dab-verdict-partial,.dab-verdict-broken{--dab-verdict-tone:var(--dsw-alias-state-error-primary);border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary) 40%,var(--dsw-alias-border-l2))}
.dab-verdict-unknown{--dab-verdict-tone:var(--dsw-alias-label-tertiary)}
.dab-verdict-head{display:flex;align-items:center;gap:13px;flex-wrap:wrap}
.dab-verdict-ico{width:34px;height:34px;flex:none;border-radius:11px;display:grid;place-items:center;color:var(--dsw-alias-label-tertiary);background:var(--dsw-alias-bg-layer-2)}
.dab-verdict-ico-ok{color:var(--dsw-alias-state-success-primary,var(--dsw-alias-brand-primary));background:color-mix(in srgb,var(--dsw-alias-state-success-primary,var(--dsw-alias-brand-primary)) 14%,transparent)}
.dab-verdict-ico-partial,.dab-verdict-ico-broken{color:var(--dsw-alias-state-error-primary);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 14%,transparent)}
.dab-verdict-text{flex:1;min-width:170px}
.dab-verdict-title{font-size:14.5px;font-weight:650}
.dab-verdict-sub{margin-top:4px;font-size:12px;color:var(--dsw-alias-label-tertiary)}
.dab-verdict-actions{display:flex;gap:8px;flex-wrap:wrap;margin-left:auto}
.dab-facts{display:flex;flex-wrap:wrap;gap:8px;position:relative;z-index:1}
.dab-fact{display:inline-flex;align-items:center;gap:7px;height:27px;padding:0 11px;border-radius:99px;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2);max-width:100%}
.dab-fact.is-bad{border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary) 45%,transparent);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 10%,transparent)}
.dab-fact-k{font-size:10.5px;font-weight:650;letter-spacing:.06em;text-transform:uppercase;color:var(--dsw-alias-label-tertiary);white-space:nowrap}
.dab-fact-v{font-family:var(--dab-mono);font-size:11.5px;color:var(--dsw-alias-label-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:32ch}
.dab-check-group-title{display:flex;align-items:center;gap:9px;font-size:12.5px;font-weight:650;margin-bottom:11px}
.dab-check-group-count{margin-left:auto;font-family:var(--dab-mono);font-size:11px;font-weight:500;color:var(--dsw-alias-label-tertiary);background:var(--dsw-alias-bg-layer-2);border-radius:99px;padding:3px 9px}
.dab-checks{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:2px}
.dab-check{display:flex;gap:10px;padding:9px 10px;border-radius:11px;transition:background .2s ease}
.dab-check:hover{background:var(--dsw-alias-bg-layer-2)}
.dab-check-ico{width:19px;height:19px;flex:none;margin-top:1px;border-radius:50%;display:grid;place-items:center;color:var(--dsw-alias-label-tertiary);background:var(--dsw-alias-bg-layer-2)}
.dab-check-ico-pass{color:var(--dsw-alias-state-success-primary,var(--dsw-alias-brand-primary));background:color-mix(in srgb,var(--dsw-alias-state-success-primary,var(--dsw-alias-brand-primary)) 15%,transparent)}
.dab-check-ico-fail{color:var(--dsw-alias-state-error-primary);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 15%,transparent)}
.dab-check-dot{width:5px;height:5px;border-radius:50%;background:currentColor;opacity:.65}
.dab-check-body{min-width:0;flex:1;display:flex;flex-direction:column;gap:3px}
.dab-check-head{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}
.dab-check-label{font-size:12.5px;font-weight:600}
.dab-check-status{font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;padding:1px 7px;border-radius:99px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-tertiary)}
.dab-check-status-pass{color:var(--dsw-alias-state-success-primary,var(--dsw-alias-brand-primary));background:color-mix(in srgb,var(--dsw-alias-state-success-primary,var(--dsw-alias-brand-primary)) 14%,transparent)}
.dab-check-status-fail{color:var(--dsw-alias-state-error-primary);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 14%,transparent)}
.dab-check-target{font-family:var(--dab-mono);font-size:10.5px;color:var(--dsw-alias-label-tertiary);background:var(--dsw-alias-bg-layer-2);border-radius:6px;padding:1px 6px;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dab-check-detail{font-family:var(--dab-mono);font-size:11px;color:var(--dsw-alias-label-tertiary);line-height:1.5;overflow-wrap:anywhere}
.dab-check-reason{display:flex;flex-direction:column;gap:5px;font-size:12px;line-height:1.55;color:var(--dsw-alias-label-secondary,var(--dsw-alias-label-tertiary))}
.dab-check-symptom{color:var(--dsw-alias-state-error-primary)}
.dab-check-where{display:flex;gap:7px;align-items:baseline;flex-wrap:wrap;font-size:11px;color:var(--dsw-alias-label-tertiary)}
.dab-check-where code{font-family:var(--dab-mono);font-size:10.5px;overflow-wrap:anywhere}
.dab-check-note{margin:12px 0 0;font-size:11.5px;line-height:1.55;color:var(--dsw-alias-label-tertiary);position:relative;z-index:1}

/* ── keyframes ───────────────────────────────────────────────────────────── */
@keyframes dab-fade-in{from{opacity:0}to{opacity:1}}
@keyframes dab-page-in{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
@keyframes dab-rise-in{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
@keyframes dab-orb-in{from{opacity:0;transform:scale(.82)}to{opacity:1;transform:none}}
@keyframes dab-spin{to{transform:rotate(360deg)}}
@keyframes dab-rotate{to{transform:rotate(360deg)}}
@keyframes dab-toast-in{from{opacity:0;transform:translate(-50%,10px)}to{opacity:1;transform:translate(-50%,0)}}
@keyframes dab-zoom-in{from{opacity:0;transform:scale(.94) translateY(8px)}to{opacity:1;transform:none}}
@keyframes dab-flow{to{background-position:300% 50%}}

/* ── responsive & motion preferences ─────────────────────────────────────── */
@container (max-width:620px){
  .dab-shell{grid-template-columns:1fr;gap:14px}
  .dab-nav{position:static;flex-direction:row;align-items:center;justify-content:space-between;gap:10px}
  .dab-nav-list{flex-direction:row;overflow-x:auto;scrollbar-width:none}
  .dab-nav-list::-webkit-scrollbar{display:none}
  .dab-nav-ind{display:none}
  .dab-nav-item{flex:none;padding:0 10px}
  .dab-nav-item.is-active{background:var(--dsw-alias-bg-layer-2)}
  .dab-types{grid-template-columns:1fr}
  .dab-verdict-actions{margin-left:0;width:100%}
  .dab-verdict-actions .dab-btn{flex:1}
}
@container (min-width:621px){
  .dab-shell{grid-template-columns:158px minmax(0,1fr);gap:26px}
}
@media (prefers-reduced-motion:reduce){
  .dab-root *,.dab-root *::before,.dab-root *::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}
}
`;
/**
* The attribute that marks a `<style>` element as OURS.
*
* The host's own CSS modules also set `data-plugin` on their `<style>` elements
* (every one of them), so `data-plugin` cannot distinguish this plugin's sheets
* from the host's — and the host-contract probe has to make exactly that
* distinction: a token this plugin re-emits must never be allowed to make a
* *host* check pass. This attribute is the honest marker, and it is set on every
* stylesheet this plugin injects.
*/
const OWN_SHEET_ATTR = "data-dab-side";
/** Mark a stylesheet this plugin injected, so the host probe can tell it apart. */
function markOwnSheet(el) {
	el.setAttribute(OWN_SHEET_ATTR, "own");
	return el;
}
//#endregion
//#region src/client/judge.ts
/** The real browser environment. */
function browserEnv(ctx) {
	const tokenRoot = () => {
		if (typeof document === "undefined") return null;
		return document.body ?? document.documentElement ?? null;
	};
	return {
		querySelector: (selector) => document.querySelector(selector),
		tokenRoot,
		computedValue: (token, on) => {
			if (typeof document === "undefined") return "";
			const host = on ?? tokenRoot();
			if (host === null) return "";
			return getComputedStyle(host).getPropertyValue(token).trim();
		},
		visible: (el) => {
			if (el === null || typeof getComputedStyle !== "function") return true;
			try {
				return getComputedStyle(el).visibility !== "hidden";
			} catch {
				return true;
			}
		},
		styleSheets: () => typeof document === "undefined" ? [] : Array.from(document.styleSheets),
		ctx
	};
}
const ANCHORS = {
	chatHasMessages: "[data-chat-turn]",
	trajectoryMounted: "[data-conversation-composer-overlay]",
	rightPanelMounted: "div[data-sidebar-right-panel],[data-dockkit-strip],[data-dockkit-pane]",
	cordisMounted: "[data-cordis-panel]",
	dockHasTab: "[data-dockkit-tab]",
	dockHasNoTab: "[data-dockkit-empty],[data-dockkit-add-tab]",
	paneFloated: "[data-dockkit-float],[data-sidebar-right-mode=\"float\"]",
	settingsOpen: "div[role=\"dialog\"][aria-modal=\"true\"][aria-labelledby]"
};
/**
* Whether an anchor's surface is on screen.
*
* `optionalWhen: X` skips the check while this is FALSE — "the feature is not
* observable right now", which is what the field name promises. Every anchor is
* therefore written as a POSITIVE predicate (`dockHasTab`, `chatHasMessages`), and
* an anchor whose name reads as an absence would silently invert its check.
*/
function anchorMounted(env, anchorId) {
	const sel = ANCHORS[anchorId];
	if (sel === void 0) return true;
	try {
		return env.querySelector(sel) !== null;
	} catch {
		return true;
	}
}
/** Walk a dotted path off a root object, tolerating a missing first hop. */
function walkPath(root, path) {
	let cur = root;
	for (const key of path.split(".")) {
		if (cur === null || cur === void 0) return void 0;
		cur = cur[key];
	}
	return cur;
}
function looksObservable(v) {
	return typeof v === "object" && v !== null && typeof v.subscribe === "function" && typeof v.getSnapshot === "function";
}
/** The camel-cased key `data-dab-side` becomes on a real element's `dataset`. */
const OWN_SHEET_DATASET = "dabSide";
/**
* Whether a stylesheet belongs to THIS plugin.
*
* `data-plugin` cannot answer this: the host's own CSS modules set it on every
* `<style>` they inject (`@deepseek-ai/dsh-client-ui-theme` and its peers). Only
* the marker written by this plugin's `markOwnSheet` can, and getting this wrong
* in the "skip our own sheets" direction skips the host's whole theme.
*
* Read via `getAttribute` (the browser's own spelling) and fall back to the
* camel-cased `dataset` key, which is what a plain-object test fixture exposes.
*/
function isOwnSheet(sheet) {
	const owner = sheet.ownerNode;
	if (owner === null || owner === void 0) return false;
	if (typeof owner.getAttribute === "function") return owner.getAttribute(OWN_SHEET_ATTR) !== null;
	const ds = owner.dataset;
	return ds !== void 0 && (ds["data-dab-side"] !== void 0 || ds["dabSide"] !== void 0);
}
/**
* A stylesheet mention of a literal, on the requested side.
*
* The host's rules are the only place a renamed token still answers honestly:
* a token can be *declared* by this plugin while the host's rule that gave it a
* value is gone. Cross-origin sheets (none on a local dsh, but the probe must
* not throw if one ever appears) are skipped.
*/
function ruleMentioned(env, literal, side) {
	for (const sheet of env.styleSheets()) {
		if (isOwnSheet(sheet) !== (side === "own")) continue;
		let rules = null;
		try {
			rules = sheet.cssRules;
		} catch {
			continue;
		}
		if (rules === null) continue;
		for (const rule of Array.from(rules)) {
			const text = rule.cssText;
			if (typeof text === "string" && text.includes(literal)) return true;
			const inner = rule.cssRules;
			if (inner === void 0 || inner === null) continue;
			for (const child of Array.from(inner)) {
				const childText = child.cssText;
				if (typeof childText === "string" && childText.includes(literal)) return true;
			}
		}
	}
	return false;
}
/**
* Which sides of stylesheet the probe can actually read (a blind check must not fail).
*/
function readability(env) {
	const out = {
		host: false,
		own: false
	};
	for (const sheet of env.styleSheets()) try {
		if (sheet.cssRules !== null) {
			if (isOwnSheet(sheet)) out.own = true;
			else out.host = true;
		}
	} catch {}
	return out;
}
function evaluate(env, check) {
	switch (check.kind) {
		case "service": {
			let svc;
			try {
				svc = env.ctx.get(check.id);
			} catch {
				svc = void 0;
			}
			return svc === void 0 || svc === null ? {
				status: "fail",
				name: `ctx.get('${check.id}')`,
				detail: "service not published",
				reason: `the host does not publish the "${check.id}" service`
			} : {
				status: "pass",
				name: `ctx.get('${check.id}')`,
				detail: "service present"
			};
		}
		case "path": {
			let svc;
			try {
				svc = env.ctx.get(check.service);
			} catch {
				svc = void 0;
			}
			if (svc === void 0 || svc === null) return {
				status: "skip",
				name: `${check.service}.${check.path}`,
				detail: "service not published yet"
			};
			const value = walkPath(svc, check.path);
			const name = `${check.service}.${check.path}`;
			if (check.expect === "function") return typeof value === "function" ? {
				status: "pass",
				name,
				detail: "is a function"
			} : {
				status: "fail",
				name,
				detail: `expected a function, got ${typeof value}`,
				reason: `"${name}" is not a function on this host`
			};
			if (check.expect === "observable") return looksObservable(value) ? {
				status: "pass",
				name,
				detail: "is an observable face"
			} : {
				status: "fail",
				name,
				detail: "not an observable face",
				reason: `"${name}" no longer exposes subscribe()/getSnapshot()`
			};
			return value === void 0 ? {
				status: "fail",
				name,
				detail: "undefined",
				reason: `"${name}" is gone`
			} : {
				status: "pass",
				name,
				detail: typeof value
			};
		}
		case "selector": {
			const el = env.querySelector(check.selector);
			const name = `querySelector(${JSON.stringify(check.selector)})`;
			if (el !== null && (check.visible !== true || env.visible(el))) return {
				status: "pass",
				name,
				detail: "element found"
			};
			if (check.optionalWhen !== void 0 && !anchorMounted(env, check.optionalWhen)) return {
				status: "skip",
				name,
				detail: "not on screen right now"
			};
			return {
				status: "fail",
				name,
				detail: el === null ? "no element matches" : "the element is hidden",
				reason: el === null ? `no element matches ${check.selector} while its surface is on screen` : `${check.selector} is in the DOM but hidden while its surface is on screen`
			};
		}
		case "attr": {
			const present = env.querySelector(`[${check.attr}]`) !== null;
			const name = `querySelector([${check.attr}])`;
			if (present) return {
				status: "pass",
				name,
				detail: "attribute found"
			};
			if (check.optionalWhen !== void 0 && !anchorMounted(env, check.optionalWhen)) return {
				status: "skip",
				name,
				detail: "not on screen right now"
			};
			return {
				status: "fail",
				name,
				detail: "no element carries it",
				reason: `nothing in the DOM carries ${check.attr} while its surface is on screen`
			};
		}
		case "computed": {
			const host = check.on !== void 0 ? env.querySelector(check.on) : null;
			const name = `computed(${check.token}${check.on !== void 0 ? ` on ${check.on}` : ""})`;
			if (check.on !== void 0 && host === null) return {
				status: "skip",
				name,
				detail: `${check.on} not mounted`
			};
			const value = env.computedValue(check.token, host);
			return value !== "" ? {
				status: "pass",
				name,
				detail: value
			} : {
				status: "fail",
				name,
				detail: "resolves to nothing",
				reason: `${check.token} resolves to an empty value`
			};
		}
		case "rule": {
			const side = check.side ?? "host";
			const name = `${side === "host" ? "host" : "plugin"} stylesheet includes ${JSON.stringify(check.match)}`;
			if (!readability(env)[side]) return {
				status: "skip",
				name,
				detail: side === "host" ? "no host stylesheet is readable" : "this plugin's sheet is not mounted"
			};
			return ruleMentioned(env, check.match, side) ? {
				status: "pass",
				name,
				detail: side === "host" ? "declared by a host rule" : "declared by this plugin's own sheet"
			} : {
				status: "fail",
				name,
				detail: "no rule mentions it",
				reason: side === "host" ? `no host stylesheet declares ${check.match}` : `this plugin's own stylesheet does not declare ${check.match} — it was not injected`
			};
		}
		default: return {
			status: "fail",
			name: "unknown check",
			detail: String(check)
		};
	}
}
/** A contract with no checks is documentation only (a legacy alias we still accept). */
function noChecks(c, lang) {
	return {
		id: c.id,
		label: labelOf(c, lang),
		symptom: symptomOf(c, lang),
		status: "info",
		detail: lang === "zh" ? "无需运行时检查 —— 仅记录兼容用法" : "no runtime check — accepted for compatibility",
		target: c.target,
		sources: c.sources,
		usedBy: c.usedBy,
		checks: []
	};
}
/**
* Run every contract against a probe environment.
*
* Only the FIRST failing check of a contract is reported: the later ones usually
* depend on it (no service ⇒ no methods on it), so listing them all would turn
* one rename into five red lines.
*/
function probeContracts(env, lang) {
	return HOST_CONTRACTS.map((c) => {
		const result = {
			id: c.id,
			label: labelOf(c, lang),
			symptom: symptomOf(c, lang),
			status: "pass",
			detail: "",
			target: c.target,
			sources: c.sources,
			usedBy: c.usedBy,
			checks: []
		};
		if (c.checks.length === 0) return noChecks(c, lang);
		const outcomes = [];
		let firstFail;
		for (const check of c.checks) {
			let outcome;
			try {
				outcome = evaluate(env, check);
			} catch (e) {
				outcome = {
					status: "fail",
					name: check.kind,
					detail: String(e),
					reason: `${check.kind} check threw`
				};
			}
			outcomes.push(outcome);
			if (outcome.status === "fail" && firstFail === void 0) firstFail = outcome;
		}
		result.checks = outcomes.map((o) => `${o.status} · ${o.name} — ${o.detail}`);
		if (firstFail !== void 0) {
			result.status = "fail";
			result.detail = `${firstFail.name} — ${firstFail.detail}`;
			result.reason = firstFail.reason;
			return result;
		}
		const ran = outcomes.filter((o) => o.status !== "skip");
		if (ran.length === 0) {
			result.status = "skip";
			result.detail = outcomes.map((o) => `${o.name} — ${o.detail}`).join("; ");
			return result;
		}
		result.status = ran.some((o) => o.status === "info") && ran.every((o) => o.status === "info") ? "info" : "pass";
		const last = ran[ran.length - 1];
		result.detail = `${last.name} — ${last.detail}`;
		return result;
	});
}
//#endregion
export { CONTRACT_GROUPS, DSH_FLOOR, HOST_CONTRACTS, OWN_SHEET_ATTR, OWN_SHEET_DATASET, UI_CSS, browserEnv, checkHostOnDisk, labelOf, markOwnSheet, meetsFloor, probeContracts, reportToMarkdown, resolveHostRoots, symptomOf, verdictOf, versionOf };
