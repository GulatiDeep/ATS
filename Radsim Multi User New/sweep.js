//********sweep.js script file starts here**********/
// Phosphor-style rotating radar sweep — brightens the existing range rings
// within a rotating angular sector, with a fading trail behind the leading edge.
// Purely additive visual layer: does not alter or remove any existing ring/canvas logic.
//
// IMPORTANT DESIGN NOTE (why this version differs from earlier attempts):
// Earlier versions recomputed ring center/radius independently (via radarCenter,
// zoomLevel, numRings, distanceBetweenRings) and tried to keep that math in perfect
// sync with radar.js's createRangeRings(). Small discrepancies (subpixel rounding,
// rect vs. offset differences, etc.) caused a growing radial gap at mid-range rings.
// To eliminate that class of bug entirely, this version instead reads the REAL,
// already-rendered position and size of each .ring element straight from the DOM
// every frame, and draws directly on top of that measured geometry. This guarantees
// exact overlap regardless of how the rings themselves are computed or rendered.

// ===========================
// SWEEP CONFIGURATION
// ===========================
let sweepEnabled = true;              // Master on/off switch for the sweep effect
const sweepPeriodMs = 4000;           // Time for one full 360° rotation (4 seconds)
const sweepSectorDeg = 90;            // Angular width of the bright/fading sector (60-90° range)
const sweepColor = { r: 255, g: 255, b: 255 }; // White phosphor sweep

let sweepHeadingDeg = 0;              // Current leading-edge heading (0 = North/up, clockwise)
let sweepLastTimestamp = null;        // For delta-time based animation

const sweepCanvas = document.getElementById('sweepCanvas');
const sweepCtx = sweepCanvas ? sweepCanvas.getContext('2d') : null;

// ===========================
// CANVAS SIZING
// ===========================
// Size/position the canvas to match panContainer exactly, since panContainer is the
// direct CSS positioning parent of both the canvas (top:0, left:0) and — indirectly —
// the range rings themselves. No devicePixelRatio scaling, no CSS width/height
// override: plain 1:1 canvas-pixel-to-CSS-pixel space, same convention as
// #stcaCanvas / #msawCanvas.
function resizeSweepCanvas() {
    if (!sweepCanvas || !sweepCtx || !panContainer) return;
    const rect = panContainer.getBoundingClientRect();
    sweepCanvas.width = Math.max(1, Math.round(rect.width));
    sweepCanvas.height = Math.max(1, Math.round(rect.height));
}

// Convert a compass heading (0 = up, clockwise) to standard canvas angle (radians),
// consistent with the convention already used elsewhere (see aircraft.js move()).
function sweepHeadingToCanvasAngle(headingDeg) {
    return (headingDeg - 90) * Math.PI / 180;
}

function normalizeSweepHeading(deg) {
    return ((deg % 360) + 360) % 360;
}

// ===========================
// DOM-MEASURED RING GEOMETRY (the actual fix)
// ===========================
// Reads the true, currently-rendered center and radius of every .ring element,
// expressed in canvas-local coordinates (relative to panContainer's top-left corner,
// which is also the canvas's own origin). This is measured fresh every frame, so it
// stays correct through zoom, pan, resize — and through anything else that might
// affect ring rendering — with zero risk of drifting out of sync.
function getRingGeometryFromDOM() {
    if (!rangeRingsContainer || !panContainer) return [];
    const ringEls = rangeRingsContainer.querySelectorAll('.ring');
    if (!ringEls.length) return [];

    const panRect = panContainer.getBoundingClientRect();
    const geoms = [];

    ringEls.forEach(ringEl => {
        const r = ringEl.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) return; // skip any not-yet-laid-out ring
        geoms.push({
            cx: (r.left + r.right) / 2 - panRect.left,
            cy: (r.top + r.bottom) / 2 - panRect.top,
            radius: r.width / 2
        });
    });

    return geoms;
}

function drawPhosphorSweep() {
    if (!sweepCtx || !sweepCanvas) return;

    sweepCtx.clearRect(0, 0, sweepCanvas.width, sweepCanvas.height);

    if (!sweepEnabled) return;

    const ringGeoms = getRingGeometryFromDOM();
    if (!ringGeoms.length) return;

    // All rings share the same center in normal operation — use the first
    // measured ring's center as the gradient origin.
    const cx = ringGeoms[0].cx;
    const cy = ringGeoms[0].cy;

    const sectorFraction = sweepSectorDeg / 360;
    const trailingHeading = normalizeSweepHeading(sweepHeadingDeg - sweepSectorDeg);
    const startAngle = sweepHeadingToCanvasAngle(trailingHeading);

    let gradient;
    try {
        gradient = sweepCtx.createConicGradient(startAngle, cx, cy);
    } catch (e) {
        // createConicGradient not supported by this browser — skip the effect gracefully
        return;
    }

    const c = sweepColor;
    const eps = 0.0005; // tiny offset to create a sharp cutoff right after the leading edge

    gradient.addColorStop(0, `rgba(${c.r},${c.g},${c.b},0)`);
    gradient.addColorStop(Math.min(0.999, sectorFraction * 0.35), `rgba(${c.r},${c.g},${c.b},0.05)`);
    gradient.addColorStop(Math.min(0.999, sectorFraction * 0.65), `rgba(${c.r},${c.g},${c.b},0.25)`);
    gradient.addColorStop(Math.min(0.999, sectorFraction * 0.9), `rgba(${c.r},${c.g},${c.b},0.6)`);
    gradient.addColorStop(Math.min(0.999, sectorFraction), `rgba(${c.r},${c.g},${c.b},0.95)`);
    gradient.addColorStop(Math.min(0.999, sectorFraction + eps), `rgba(${c.r},${c.g},${c.b},0)`);
    gradient.addColorStop(1, `rgba(${c.r},${c.g},${c.b},0)`);

    sweepCtx.save();
    sweepCtx.globalCompositeOperation = 'lighter'; // additive glow, phosphor-like brightening
    sweepCtx.strokeStyle = gradient;
    sweepCtx.lineWidth = 1.6; // slightly thicker than the base gray ring so it reads as "bright"

    // Stroke each ring at its own precisely measured radius — guarantees overlap
    // with the actual rendered ring, regardless of how that ring was computed.
    ringGeoms.forEach(g => {
        sweepCtx.beginPath();
        sweepCtx.arc(cx, cy, g.radius, 0, Math.PI * 2);
        sweepCtx.stroke();
    });

    sweepCtx.restore();
}

function sweepAnimationFrame(timestamp) {
    if (sweepLastTimestamp === null) sweepLastTimestamp = timestamp;
    const deltaMs = timestamp - sweepLastTimestamp;
    sweepLastTimestamp = timestamp;

    // Freeze rotation while the exercise is paused (same convention as aircraft movement)
    if (typeof isPaused === 'undefined' || !isPaused) {
        const degPerMs = 360 / sweepPeriodMs;
        sweepHeadingDeg = normalizeSweepHeading(sweepHeadingDeg + degPerMs * deltaMs);
    }

    drawPhosphorSweep();

    requestAnimationFrame(sweepAnimationFrame);
}

if (sweepCanvas && sweepCtx) {
    resizeSweepCanvas();
    window.addEventListener('resize', () => {
        window.requestAnimationFrame(resizeSweepCanvas);
    });
    requestAnimationFrame(sweepAnimationFrame);
}

//********sweep.js script file ends here**********/