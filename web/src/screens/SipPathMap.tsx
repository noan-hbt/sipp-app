import { AnimatePresence, motion, useAnimationControls } from "motion/react";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { illustration, topicOf } from "../components/SipIcon";
import { Icon, Star } from "../components/ui";
import type { LessonBrief, ModuleOut } from "../lib/api";
import { LESSON_MINUTES } from "../lib/format";
import { LANDS } from "../lib/lands";
import { haptic, play } from "../lib/sound";

const C = {
  bg: "var(--land-bg)",
  ink: "var(--ink)",
  muted: "var(--muted)",
  faint: "var(--map-faint)",
  surface: "var(--surface)",
  road: "var(--land-road)",
  label: "var(--land-label)",
  peach: "var(--primary)",
  star: "var(--map-star)",
};
const RING = `0 0 0 6px ${C.bg}`;

const MODULE_COLORS = [
  ["var(--map-mod0)", "var(--map-mod0-ink)"],
  ["var(--map-mod1)", "var(--map-mod1-ink)"],
  ["var(--map-mod2)", "var(--map-mod2-ink)"],
  ["var(--map-mod3)", "var(--map-mod3-ink)"],
  ["var(--map-mod4)", "var(--map-mod4-ink)"],
  ["var(--map-mod5)", "var(--map-mod5-ink)"],
];

const GAP = 112;
const BANNER_GAP = 96;
const TOP_PAD = 210;
const BOTTOM_PAD = 120;
const NODE = 64;
const NODE_NOW = 92;
const NODE_END = 72;
const DOCK = 104;
/** The landscape is drawn wider than the screen so its edges frame the road. */
const LAND_SCALE = 1.24;

type State = "done" | "now" | "locked";
interface Pt {
  x: number;
  y: number;
}
interface LessonNode extends Pt {
  kind: "lesson";
  lesson: LessonBrief;
  index: number;
  state: State;
}
interface EndNode extends Pt {
  kind: "end";
  module: ModuleOut;
  remaining: number;
}
interface Zone {
  module: ModuleOut;
  bannerY: number;
  reached: boolean;
  done: number;
}
type Corridor = readonly (readonly [number, number])[];

/** Landscape tiles stacked from the bottom; every other one mirrored so long Sips don't feel repeated. */
function tiles(width: number, height: number) {
  const w = width * LAND_SCALE;
  const h = w * 1.5;
  const out: { top: number; left: number; w: number; h: number; flip: boolean }[] = [];
  for (let i = 0, bottom = height; bottom > 0; i++, bottom -= h)
    out.push({ top: bottom - h, left: (width - w) / 2, w, h, flip: i % 2 === 1 });
  return out;
}

/** Centre and half width of the empty road band at a given height, in px. */
function corridorAt(land: Corridor | null, y: number, width: number, height: number) {
  if (!land) return { c: width / 2, hw: width / 2 - 40 };
  const w = width * LAND_SCALE;
  const h = w * 1.5;
  const fromBottom = height - y;
  const i = Math.max(0, Math.floor(fromBottom / h));
  const t = 1 - (fromBottom - i * h) / h;
  const f = t * (land.length - 1);
  const a = land[Math.floor(f)];
  const b = land[Math.min(land.length - 1, Math.ceil(f))];
  const k = f - Math.floor(f);
  let c = a[0] + (b[0] - a[0]) * k;
  if (i % 2 === 1) c = 1 - c;
  return { c: (width - w) / 2 + c * w, hw: Math.min(a[1], b[1]) * w };
}

function layout(modules: ModuleOut[], width: number, land: Corridor | null) {
  const nowIdx = modules
    .flatMap((m) => m.lessons)
    .findIndex((l) => !l.completed);
  // Positions are computed from the bottom, then flipped: the path climbs.
  let acc = BOTTOM_PAD;
  let li = 0;
  const raw: { node: LessonNode | EndNode; fromBottom: number }[] = [];
  const zonesRaw: { module: ModuleOut; first: number; done: number; reached: boolean }[] = [];
  for (const m of modules) {
    if (!m.lessons.length) continue;
    acc += BANNER_GAP;
    const first = acc;
    let done = 0;
    let reached = false;
    for (const l of m.lessons) {
      const state: State = l.completed ? "done" : li === nowIdx ? "now" : "locked";
      if (state === "done") done++;
      if (state !== "locked") reached = true;
      raw.push({ node: { kind: "lesson", lesson: l, index: li, state, x: 0, y: 0 }, fromBottom: acc });
      acc += GAP;
      li++;
    }
    raw.push({
      node: { kind: "end", module: m, remaining: m.lessons.length - done, x: 0, y: 0 },
      fromBottom: acc,
    });
    zonesRaw.push({ module: m, first, done, reached });
    acc += GAP;
  }
  const height = acc - GAP + TOP_PAD;
  // Each node follows the road band, swaying a little inside it.
  const points = raw.map((r, i) => {
    const y = height - r.fromBottom;
    const { c, hw } = corridorAt(land, y, width, height);
    const sway = (i % 2 ? 1 : -1) * Math.max(0, Math.min(land ? 34 : 80, hw - 52));
    const x = Math.min(width - 48, Math.max(48, c + sway));
    return { ...r.node, x, y };
  });
  const zones: Zone[] = zonesRaw.map((z) => ({
    module: z.module,
    bannerY: height - z.first + 50,
    reached: z.reached,
    done: z.done,
  }));
  const pNow = points.findIndex((p) => p.kind === "lesson" && p.state === "now");
  return { points, zones, height, pNow };
}

function pathThrough(pts: Pt[]) {
  if (!pts.length) return "";
  let d = `M${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const my = (a.y + b.y) / 2;
    d += ` C${a.x} ${my} ${b.x} ${my} ${b.x} ${b.y}`;
  }
  return d;
}

/** Room for a label beside a node, on its roomier side. */
function side(x: number, size: number, width: number, max: number) {
  const right = width - (x + size / 2 + 12) - 10;
  const left = x - size / 2 - 12 - 10;
  const onRight = right >= left;
  const w = Math.min(max, Math.max(right, left));
  return { onRight, w, left: onRight ? x + size / 2 + 12 : x - size / 2 - 12 - w };
}

export function SipPathMap({
  modules,
  title,
  theme,
  chapter,
  totalStars,
  streak,
  justCompleted,
  fresh,
  bottomPad,
  reviewDue = 0,
  onBack,
  onList,
  onOpen,
  onReview,
}: {
  modules: ModuleOut[];
  title: string;
  theme?: string | null;
  chapter?: number | null;
  totalStars: number;
  streak?: number;
  justCompleted: boolean;
  fresh: boolean;
  bottomPad: number;
  reviewDue?: number;
  onBack: () => void;
  onReview?: () => void;
  onList: () => void;
  onOpen: (lessonId: string) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(() => Math.min(window.innerWidth, 480));
  useEffect(() => {
    const onResize = () => setWidth(Math.min(window.innerWidth, 480));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const topic = topicOf(title, theme).key;
  const landKey = topic in LANDS ? topic : "general" in LANDS ? "general" : null;
  const land = landKey ? LANDS[landKey] : null;

  const { points, zones, height, pNow } = useMemo(
    () => layout(modules, width, land),
    [modules, width, land],
  );
  const lessons = points.filter((p): p is LessonNode => p.kind === "lesson");
  const now = lessons.find((n) => n.state === "now");
  const doneCount = lessons.filter((n) => n.lesson.completed).length;
  const pad = bottomPad + (now ? DOCK : 0);

  const doneUpTo = pNow === -1 ? points.length - 1 : pNow;
  const stub = points.length ? [{ x: points[0].x, y: points[0].y + 90 }] : [];
  const fullPath = pathThrough([...stub, ...points]);
  const donePath = pathThrough([...stub, ...points.slice(0, Math.max(doneUpTo, 1))]);
  const lastSeg = doneUpTo > 0 ? pathThrough([points[doneUpTo - 1], points[doneUpTo]]) : "";
  const todoPath = pNow === -1 ? "" : pathThrough(points.slice(pNow));

  // Center the current lesson on open; after a lesson, glide up from the one just finished.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || !points.length) return;
    const target = (now ?? points[points.length - 1]).y - el.clientHeight * 0.5;
    const prev = pNow > 0 ? points[pNow - 1] : undefined;
    el.scrollTop = justCompleted && prev ? prev.y - el.clientHeight * 0.5 : target;
    if (justCompleted) {
      const t = setTimeout(() => el.scrollTo({ top: target, behavior: "smooth" }), 350);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points.length, width]);

  return (
    <div
      style={{
        position: "relative",
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        background: C.bg,
        color: C.ink,
      }}
    >
      <div ref={scroller} className="scroll" style={{ position: "relative" }}>
        <div style={{ position: "relative", height: height + pad, width: "100%", overflow: "hidden" }}>
          {landKey &&
            tiles(width, height).map((t, i) => (
              <img
                key={i}
                src={illustration("land-" + landKey)}
                alt=""
                aria-hidden="true"
                draggable={false}
                className="land"
                style={{
                  position: "absolute",
                  left: t.left,
                  top: t.top,
                  width: t.w,
                  height: t.h,
                  transform: t.flip ? "scaleX(-1)" : undefined,
                  pointerEvents: "none",
                }}
              />
            ))}
          <svg width={width} height={height} style={{ position: "absolute", inset: 0 }} aria-hidden="true">
            <path d={fullPath} fill="none" stroke={C.road} strokeWidth="28" strokeLinecap="round" />
            {todoPath && (
              <path
                d={todoPath}
                fill="none"
                stroke={C.surface}
                strokeWidth="5"
                strokeLinecap="round"
                strokeDasharray="1 15"
              />
            )}
            <motion.path
              d={donePath}
              fill="none"
              stroke={C.peach}
              strokeWidth="16"
              strokeLinecap="round"
              initial={fresh ? { pathLength: 0 } : false}
              animate={{ pathLength: 1 }}
              transition={{ duration: 1.2, ease: "easeInOut" }}
            />
            {lastSeg && (
              <motion.path
                d={lastSeg}
                fill="none"
                stroke={C.peach}
                strokeWidth="16"
                strokeLinecap="round"
                initial={justCompleted ? { pathLength: 0 } : false}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.7, delay: 0.45, ease: "easeInOut" }}
              />
            )}
          </svg>

          {zones.map((z, i) => (
            <ModuleBanner key={z.module.id} zone={z} tilt={i % 2 ? 2 : -2} />
          ))}

          {points.map((p) =>
            p.kind === "end" ? (
              <EndMilestone key={`end-${p.module.id}`} node={p} width={width} />
            ) : (
              <MapNode
                key={p.lesson.id}
                node={p}
                width={width}
                appearDelay={fresh ? 0.2 + p.index * 0.05 : 0}
                unlocking={justCompleted && p.state === "now"}
                lockedHint={now?.lesson.title}
                onOpen={() => onOpen(p.lesson.id)}
              />
            ),
          )}
        </div>
      </div>

      <header
        style={{
          position: "absolute",
          zIndex: 2,
          left: 0,
          right: 0,
          top: 0,
          padding: "calc(var(--safe-top) + 14px) 16px 26px",
          display: "flex",
          flexDirection: "column",
          gap: 10,
          background: `linear-gradient(${C.bg} 62%, transparent)`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <RoundButton label="Retour" onClick={onBack}>
            {Icon.back}
          </RoundButton>
          <div
            style={{
              flex: 1,
              minWidth: 0,
              minHeight: 48,
              borderRadius: 24,
              background: C.surface,
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              gap: 5,
              padding: "6px 16px",
            }}
          >
            <span
              className="display"
              style={{
                fontSize: title.length > 24 ? 14 : 16,
                lineHeight: 1.1,
                overflow: "hidden",
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
              }}
            >
              {chapter && <span style={{ color: C.faint }}>Ch. {chapter} · </span>}
              {title}
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, fontWeight: 700, color: C.muted }}>
              <span style={{ flex: 1, height: 6, borderRadius: 3, background: "var(--line)", overflow: "hidden" }}>
                <motion.span
                  initial={{ width: 0 }}
                  animate={{ width: `${(doneCount / Math.max(1, lessons.length)) * 100}%` }}
                  transition={{ type: "spring", stiffness: 80, damping: 18, delay: 0.2 }}
                  style={{ display: "block", height: "100%", borderRadius: 3, background: C.peach }}
                />
              </span>
              {doneCount}/{lessons.length}
            </span>
          </div>
          <motion.span
            key={totalStars}
            initial={{ scale: 1.4 }}
            animate={{ scale: 1 }}
            aria-label={`${totalStars} étoiles`}
            style={{
              height: 48,
              padding: "0 14px",
              borderRadius: 24,
              background: C.surface,
              display: "flex",
              alignItems: "center",
              gap: 5,
              fontSize: 16,
              fontWeight: 800,
              flexShrink: 0,
            }}
          >
            <Star size={17} />
            {totalStars}
          </motion.span>
          <RoundButton label="Voir en liste" onClick={onList} dark>
            {Icon.list}
          </RoundButton>
        </div>
        {(!!streak || (reviewDue > 0 && onReview)) && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 4px" }}>
            {!!streak && (
              <span
                style={{
                  height: 28,
                  padding: "0 11px",
                  borderRadius: 14,
                  background: C.surface,
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  fontSize: 13,
                  fontWeight: 700,
                  whiteSpace: "nowrap",
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 2c1 4 6 6 6 12a6 6 0 01-12 0c0-3 2-5 3-6 0 2 1 3 2 3 0-4-1-6 1-9z" fill={C.peach} />
                </svg>
                {streak} {streak > 1 ? "jours" : "jour"}
              </span>
            )}
            {reviewDue > 0 && onReview && (
              <motion.button
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                whileTap={{ scale: 0.92 }}
                transition={{ type: "spring", stiffness: 400, damping: 16, delay: 0.5 }}
                onClick={() => {
                  play("tap");
                  onReview();
                }}
                aria-label={`Réviser ${reviewDue} notion${reviewDue > 1 ? "s" : ""}`}
                style={{
                  border: "none",
                  height: 28,
                  padding: "0 11px",
                  borderRadius: 14,
                  background: "var(--butter)",
                  color: "var(--butter-ink)",
                  fontSize: 13,
                  fontWeight: 700,
                  whiteSpace: "nowrap",
                }}
              >
                Révision · {reviewDue}
              </motion.button>
            )}
          </div>
        )}
      </header>

      {now && (
        <motion.button
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: "spring", stiffness: 260, damping: 24, delay: 0.3 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => {
            play("pop");
            haptic();
            onOpen(now.lesson.id);
          }}
          style={{
            position: "absolute",
            zIndex: 2,
            left: 16,
            right: 16,
            bottom: "calc(var(--safe-bottom) + 16px)",
            height: 80,
            border: "none",
            borderRadius: 30,
            background: "var(--dock)",
            color: "var(--dock-ink)",
            padding: "0 12px 0 20px",
            display: "flex",
            alignItems: "center",
            gap: 12,
            textAlign: "left",
            boxShadow: "0 14px 30px rgba(29,26,23,.22)",
          }}
        >
          <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
            <span className="kicker" style={{ color: "#ffc93d" }}>
              Leçon {now.index + 1} · {now.lesson.status !== "ready" ? "je la prépare" : `${LESSON_MINUTES} min`}
            </span>
            <span
              className="display"
              style={{ fontSize: 18, lineHeight: 1.08, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
            >
              {now.lesson.title}
            </span>
          </span>
          <span
            style={{
              height: 56,
              padding: "0 22px",
              borderRadius: 28,
              background: C.peach,
              color: "#fff",
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontWeight: 700,
              fontSize: 15,
              flexShrink: 0,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M8 5.5v13l11-6.5z" />
            </svg>
            Go
          </span>
        </motion.button>
      )}
    </div>
  );
}

function RoundButton({
  label,
  onClick,
  dark,
  children,
}: {
  label: string;
  onClick: () => void;
  dark?: boolean;
  children: ReactNode;
}) {
  return (
    <motion.button
      aria-label={label}
      whileTap={{ scale: 0.92 }}
      onClick={() => {
        play("tap");
        onClick();
      }}
      style={{
        width: 48,
        height: 48,
        borderRadius: 24,
        border: "none",
        flexShrink: 0,
        background: dark ? C.ink : C.surface,
        color: dark ? "var(--on-ink)" : C.ink,
        display: "grid",
        placeItems: "center",
      }}
    >
      {children}
    </motion.button>
  );
}

/** A small text plate so labels stay readable over the scenery. */
function Plate({
  left,
  top,
  width,
  right,
  children,
}: {
  left: number;
  top: number;
  width: number;
  right: boolean;
  children: ReactNode;
}) {
  return (
    <span
      aria-hidden="true"
      style={{
        position: "absolute",
        left: right ? left : undefined,
        right: right ? undefined : `calc(100% - ${left + width}px)`,
        top,
        maxWidth: width,
        transform: "translateY(-50%)",
        padding: "6px 10px",
        borderRadius: 14,
        background: C.label,
        display: "flex",
        flexDirection: "column",
        alignItems: right ? "flex-start" : "flex-end",
        textAlign: right ? "left" : "right",
        gap: 3,
        pointerEvents: "none",
      }}
    >
      {children}
    </span>
  );
}

function ModuleBanner({ zone, tilt }: { zone: Zone; tilt: number }) {
  const [bg, ink] = MODULE_COLORS[(zone.module.position - 1) % MODULE_COLORS.length];
  const total = zone.module.lessons.length;
  const complete = zone.done === total;
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: zone.bannerY,
        display: "flex",
        justifyContent: "center",
        pointerEvents: "none",
      }}
    >
      <span
        style={{
          maxWidth: "calc(100% - 60px)",
          height: 38,
          padding: "0 16px",
          borderRadius: 19,
          background: bg,
          color: ink,
          boxShadow: `0 0 0 5px ${C.bg}`,
          transform: `rotate(${tilt}deg)`,
          display: "flex",
          alignItems: "center",
          gap: 7,
          fontSize: 14,
          fontWeight: 700,
          whiteSpace: "nowrap",
        }}
      >
        {!zone.reached && (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="5" y="11" width="14" height="9" rx="3" />
            <path d="M8 11V8a4 4 0 018 0v3" />
          </svg>
        )}
        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
          Module {zone.module.position} · {zone.module.title}
        </span>
        {zone.reached &&
          (complete ? (
            Icon.check(14)
          ) : (
            <span style={{ fontSize: 13, opacity: 0.75 }}>
              {zone.done}/{total}
            </span>
          ))}
      </span>
    </div>
  );
}

function EndMilestone({ node, width }: { node: EndNode; width: number }) {
  const reached = node.remaining === 0;
  const label = side(node.x, NODE_END, width, 140);
  return (
    <>
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          left: node.x - NODE_END / 2,
          top: node.y - NODE_END / 2,
          width: NODE_END,
          height: NODE_END,
          borderRadius: 24,
          background: "var(--butter)",
          boxShadow: RING,
          transform: "rotate(6deg)",
          display: "grid",
          placeItems: "center",
          filter: reached ? undefined : "saturate(.55)",
        }}
      >
        <img
          src={illustration("scene-quiz")}
          alt=""
          width={NODE_END - 6}
          height={NODE_END - 6}
          draggable={false}
          style={{ transform: "rotate(-6deg)", opacity: reached ? 1 : 0.75 }}
        />
      </span>
      <Plate left={label.left} top={node.y} width={label.w} right={label.onRight}>
        <span style={{ fontSize: 14, fontWeight: 700 }}>Fin du module</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: C.muted }}>
          {reached ? "Module terminé" : `Encore ${node.remaining} ${node.remaining > 1 ? "leçons" : "leçon"}`}
        </span>
        {!!node.module.bonus_stars && (
          <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 12, fontWeight: 700, color: "var(--butter-ink)" }}>
            <Star size={12} />
            {reached ? `+${node.module.bonus_stars} gagnées` : `+${node.module.bonus_stars} à gagner`}
          </span>
        )}
      </Plate>
    </>
  );
}

function MapNode({
  node,
  width,
  appearDelay,
  unlocking,
  lockedHint,
  onOpen,
}: {
  node: LessonNode;
  width: number;
  appearDelay: number;
  unlocking: boolean;
  lockedHint?: string;
  onOpen: () => void;
}) {
  const shake = useAnimationControls();
  const [hint, setHint] = useState(false);
  const hintTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(hintTimer.current), []);
  const size = node.state === "now" ? NODE_NOW : NODE;
  const top = node.y - size / 2;
  const common = {
    position: "absolute" as const,
    left: node.x - size / 2,
    top,
    width: size,
    height: size,
    borderRadius: size / 2,
    border: "none",
    display: "grid",
    placeItems: "center",
  };

  if (node.state !== "now") {
    const done = node.state === "done";
    const label = side(node.x, size, width, 156);
    return (
      <>
        <motion.button
          aria-label={
            done
              ? `${node.lesson.title}, terminée, ${node.lesson.stars ?? 0} étoiles`
              : `${node.lesson.title} (verrouillée)`
          }
          animate={done ? { scale: 1 } : shake}
          initial={appearDelay ? { scale: 0 } : false}
          whileInView={done ? undefined : { scale: 1 }}
          viewport={{ once: true }}
          transition={{ type: "spring", stiffness: 400, damping: 16, delay: appearDelay }}
          whileTap={done ? { scale: 0.9 } : undefined}
          onClick={() => {
            if (done) {
              play("tap");
              onOpen();
              return;
            }
            play("wrong");
            haptic(20);
            setHint(true);
            void shake.start({ x: [0, -6, 6, -4, 4, 0], transition: { duration: 0.35 } });
            clearTimeout(hintTimer.current);
            hintTimer.current = setTimeout(() => setHint(false), 1800);
          }}
          style={{
            ...common,
            background: done ? C.peach : C.surface,
            color: done ? "#fff" : C.faint,
            boxShadow: RING,
          }}
        >
          {done ? Icon.check(26, "#fff") : Icon.lock}
        </motion.button>
        <Plate left={label.left} top={node.y} width={label.w} right={label.onRight}>
          <span style={{ fontSize: 13, fontWeight: done ? 700 : 600, lineHeight: 1.25, color: done ? C.ink : C.muted }}>
            {done ? node.lesson.title : `${node.index + 1} · ${node.lesson.title}`}
          </span>
          {done && (
            <span style={{ display: "flex", gap: 2 }}>
              {[0, 1, 2].map((i) => (
                <Star key={i} size={14} filled={(node.lesson.stars ?? 0) > i} />
              ))}
            </span>
          )}
        </Plate>
        <AnimatePresence>
          {hint && lockedHint && (
            <motion.div
              role="status"
              initial={{ opacity: 0, y: 8, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 4 }}
              style={{
                position: "absolute",
                zIndex: 5,
                top: top - 56,
                left: Math.min(Math.max(12, node.x - 110), width - 232),
                width: 220,
                borderRadius: 16,
                padding: "8px 12px",
                fontSize: 13,
                fontWeight: 700,
                textAlign: "center",
                background: C.ink,
                color: "var(--on-ink)",
              }}
            >
              Termine d’abord « {lockedHint} »
            </motion.div>
          )}
        </AnimatePresence>
      </>
    );
  }

  // Current lesson: a dark disc with the caramel play button, and a "you are here" tag on the roomier side.
  const tag = side(node.x, size, width, 120);
  return (
    <>
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          left: node.x - 66,
          top: node.y - 66,
          width: 132,
          height: 132,
          borderRadius: 66,
          background: "color-mix(in srgb, var(--primary) 18%, transparent)",
        }}
      />
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          left: node.x - (size + 16) / 2,
          top: node.y - (size + 16) / 2,
          width: size + 16,
          height: size + 16,
          borderRadius: "50%",
          background: C.peach,
          opacity: 0,
          animation: "halo 2s ease-out infinite",
        }}
      />
      <motion.button
        aria-label={`Commencer : ${node.lesson.title}`}
        initial={unlocking ? { scale: 0, rotate: -30 } : appearDelay ? { scale: 0 } : false}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 380, damping: 12, delay: unlocking ? 1.1 : appearDelay }}
        whileTap={{ scale: 0.92 }}
        onClick={() => {
          play("pop");
          haptic();
          onOpen();
        }}
        style={{ ...common, background: "var(--dock)" }}
      >
        <span style={{ width: 62, height: 62, borderRadius: 31, background: C.peach, display: "grid", placeItems: "center" }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="#fff" aria-hidden="true">
            <path d="M8 5.5v13l11-6.5z" />
          </svg>
        </span>
      </motion.button>
      <motion.span
        aria-hidden="true"
        initial={{ opacity: 0, x: tag.onRight ? -12 : 12 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 20, delay: unlocking ? 1.35 : 0.35 }}
        style={{
          position: "absolute",
          top: node.y - 17,
          left: tag.onRight ? node.x + size / 2 + 14 : undefined,
          right: tag.onRight ? undefined : `calc(100% - ${node.x - size / 2 - 14}px)`,
          height: 34,
          padding: "0 14px",
          borderRadius: 17,
          background: C.ink,
          color: "var(--on-ink)",
          display: "flex",
          alignItems: "center",
          fontSize: 13,
          fontWeight: 700,
          whiteSpace: "nowrap",
          pointerEvents: "none",
        }}
      >
        Tu es ici
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          aria-hidden="true"
          style={{ position: "absolute", top: 11, [tag.onRight ? "left" : "right"]: -6, transform: tag.onRight ? "scaleX(-1)" : undefined }}
        >
          <path d="M0 0 L8 6 L0 12 Z" fill="var(--ink)" />
        </svg>
      </motion.span>
    </>
  );
}
