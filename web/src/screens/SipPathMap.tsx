import "@fontsource/nunito/700.css";
import "@fontsource/nunito/800.css";
import "@fontsource/nunito/900.css";
import { AnimatePresence, motion, useAnimationControls } from "motion/react";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Mascot } from "../components/Mascot";
import { Icon, Star } from "../components/ui";
import type { LessonBrief, ModuleOut } from "../lib/api";
import { LESSON_MINUTES } from "../lib/format";
import { haptic, play } from "../lib/sound";

// The map keeps the soft, raised look of the original Sipp map (its own palette and Nunito).
const C = {
  bg: "#f1ede7",
  bgDeep: "#e7e1d8",
  ink: "#2b2620",
  muted: "#5e574e",
  faint: "#766f65",
  shadow: "#d9d2c7",
  surface: "#f8f6f2",
  track: "#e2dcd2",
  dots: "#d3ccc1",
  peach: "#f4a574",
  peachLip: "#d27a45",
  peachSoft: "#fbe1cc",
  peachInk: "#b5582a",
  mint: "#bfe3cc",
  mintLip: "#6fae88",
  mintInk: "#2f7a52",
  leaf: "#7fc59b",
  butter: "#f6e7b0",
  butterLip: "#d9c27a",
  butterInk: "#6e5410",
  star: "#f2c14e",
};
const RAISED = `6px 8px 16px ${C.shadow}, -6px -6px 14px #fff`;
const RAISED_SM = `4px 4px 10px ${C.shadow}, -4px -4px 10px #fff`;
const FONT = "'Nunito', ui-rounded, system-ui, sans-serif";

const MODULE_COLORS = [
  ["#dcd3f4", "#4a3790"],
  ["#bfe3cc", "#245e40"],
  ["#cfe2f3", "#24527d"],
  ["#f6e7b0", "#6e5410"],
  ["#f5cfd6", "#8c2e45"],
  ["#fbe1cc", "#8f431c"],
];

const GAP = 104;
const BANNER_GAP = 92;
const TOP_PAD = 230;
const BOTTOM_PAD = 110;
const NODE = 64;
const NODE_NOW = 86;
const NODE_END = 60;
const MASCOT = 50;

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
  top: number;
  bottom: number;
  reached: boolean;
  done: number;
}

function layout(modules: ModuleOut[], width: number) {
  const amp = Math.min(92, (width - 140) / 2);
  const cx = width / 2;
  const nowIdx = modules
    .flatMap((m) => m.lessons)
    .findIndex((l) => !l.completed);
  // Positions are computed from the bottom, then flipped: the path climbs.
  let acc = BOTTOM_PAD;
  let k = 0;
  let li = 0;
  const raw: { node: LessonNode | EndNode; fromBottom: number }[] = [];
  const zonesRaw: {
    module: ModuleOut;
    first: number;
    last: number;
    done: number;
    reached: boolean;
    pad: number;
  }[] = [];
  for (const m of modules) {
    if (!m.lessons.length) continue;
    // The current lesson's bubble hangs below its node: keep it clear of the banner.
    const pad = li === nowIdx ? 40 : 0;
    acc += BANNER_GAP + pad;
    const first = acc;
    let done = 0;
    let reached = false;
    for (const l of m.lessons) {
      const state: State =
        nowIdx === -1 || li < nowIdx
          ? "done"
          : li === nowIdx
            ? "now"
            : "locked";
      if (state === "done") done++;
      if (state !== "locked") reached = true;
      raw.push({
        node: {
          kind: "lesson",
          lesson: l,
          index: li,
          state,
          x: cx + amp * Math.sin(k * 1.05 + 0.4),
          y: 0,
        },
        fromBottom: acc,
      });
      acc += GAP;
      k++;
      li++;
    }
    raw.push({
      node: {
        kind: "end",
        module: m,
        remaining: m.lessons.length - done,
        x: cx + amp * Math.sin(k * 1.05 + 0.4),
        y: 0,
      },
      fromBottom: acc,
    });
    zonesRaw.push({ module: m, first, last: acc, done, reached, pad });
    acc += GAP;
    k++;
  }
  const height = acc - GAP + TOP_PAD;
  const points = raw.map((r) => ({ ...r.node, y: height - r.fromBottom }));
  const zones: Zone[] = zonesRaw.map((z) => ({
    module: z.module,
    bannerY: height - z.first + 58 + z.pad,
    top: height - z.last - 70,
    bottom: height - z.first + 100 + z.pad,
    reached: z.reached,
    done: z.done,
  }));
  const pNow = points.findIndex(
    (p) => p.kind === "lesson" && p.state === "now",
  );
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
  const right = width - (x + size / 2 + 14) - 12;
  const left = x - size / 2 - 14 - 12;
  const onRight = right >= left;
  const w = Math.min(max, Math.max(right, left));
  return {
    onRight,
    w,
    left: onRight ? x + size / 2 + 14 : x - size / 2 - 14 - w,
  };
}

export function SipPathMap({
  modules,
  title,
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

  const { points, zones, height, pNow } = useMemo(
    () => layout(modules, width),
    [modules, width],
  );
  const lessons = points.filter((p): p is LessonNode => p.kind === "lesson");
  const now = lessons.find((n) => n.state === "now");
  const doneCount = lessons.filter((n) => n.state === "done").length;

  const doneUpTo = pNow === -1 ? points.length - 1 : pNow;
  const stub = points.length ? [{ x: points[0].x, y: points[0].y + 76 }] : [];
  const fullPath = pathThrough([...stub, ...points]);
  const donePath = pathThrough([
    ...stub,
    ...points.slice(0, Math.max(doneUpTo, 1)),
  ]);
  const lastSeg =
    doneUpTo > 0 ? pathThrough([points[doneUpTo - 1], points[doneUpTo]]) : "";
  const todoPath = pNow === -1 ? "" : pathThrough(points.slice(pNow));

  // Center the current lesson on open; after a lesson, glide up from the one just finished.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || !points.length) return;
    const target =
      (now ?? points[points.length - 1]).y - el.clientHeight * 0.55;
    const prev = pNow > 0 ? points[pNow - 1] : undefined;
    el.scrollTop =
      justCompleted && prev ? prev.y - el.clientHeight * 0.55 : target;
    if (justCompleted) {
      const t = setTimeout(
        () => el.scrollTo({ top: target, behavior: "smooth" }),
        350,
      );
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
        fontFamily: FONT,
      }}
    >
      <div ref={scroller} className="scroll" style={{ position: "relative" }}>
        <div
          style={{
            position: "relative",
            height: height + bottomPad,
            width: "100%",
            overflow: "hidden",
          }}
        >
          <svg
            width={width}
            height={height}
            style={{ position: "absolute", inset: 0 }}
            aria-hidden="true"
          >
            {zones.map((z) => (
              <ellipse
                key={z.module.id}
                cx={width / 2}
                cy={(z.top + z.bottom) / 2}
                rx={width * 0.62}
                ry={(z.bottom - z.top) / 2}
                fill={
                  MODULE_COLORS[
                    (z.module.position - 1) % MODULE_COLORS.length
                  ][0]
                }
                opacity={z.reached ? 0.26 : 0.12}
              />
            ))}
            <Decor width={width} height={height} />
            <path
              d={fullPath}
              fill="none"
              stroke={C.track}
              strokeWidth="24"
              strokeLinecap="round"
            />
            {todoPath && (
              <path
                d={todoPath}
                fill="none"
                stroke={C.dots}
                strokeWidth="7"
                strokeLinecap="round"
                strokeDasharray="1 16"
              />
            )}
            <motion.path
              d={donePath}
              fill="none"
              stroke={C.peach}
              strokeWidth="8"
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
                strokeWidth="8"
                strokeLinecap="round"
                initial={justCompleted ? { pathLength: 0 } : false}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.7, delay: 0.45, ease: "easeInOut" }}
              />
            )}
          </svg>

          {zones.map((z) => (
            <ModuleBanner key={z.module.id} zone={z} width={width} />
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
          padding: "calc(var(--safe-top) + 14px) 16px 22px",
          display: "flex",
          flexDirection: "column",
          gap: 12,
          background: `linear-gradient(${C.bg} 78%, rgba(241,237,231,0))`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <RoundButton label="Retour" onClick={onBack}>
            {Icon.back}
          </RoundButton>
          <div
            style={{
              flex: 1,
              minWidth: 0,
              height: 48,
              borderRadius: 24,
              background: C.surface,
              boxShadow: RAISED_SM,
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "0 16px",
            }}
          >
            <span
              style={{
                flex: 1,
                fontSize: 16,
                fontWeight: 900,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {chapter && (
                <span style={{ color: C.faint }}>Ch. {chapter} · </span>
              )}
              {title}
            </span>
            <motion.span
              key={totalStars}
              initial={{ scale: 1.5 }}
              animate={{ scale: 1 }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                fontSize: 16,
                fontWeight: 900,
              }}
            >
              <Star size={18} />
              {totalStars}
            </motion.span>
          </div>
          <RoundButton label="Voir en liste" onClick={onList}>
            {Icon.list}
          </RoundButton>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "0 6px",
          }}
        >
          <span
            style={{
              fontSize: 13,
              fontWeight: 800,
              color: C.muted,
              whiteSpace: "nowrap",
            }}
          >
            {doneCount}/{lessons.length} leçons
          </span>
          <div
            style={{
              flex: 1,
              height: 8,
              borderRadius: 4,
              background: C.track,
              boxShadow: `inset 1px 1px 3px ${C.dots}`,
              overflow: "hidden",
            }}
          >
            <motion.div
              initial={{ width: 0 }}
              animate={{
                width: `${(doneCount / Math.max(1, lessons.length)) * 100}%`,
              }}
              transition={{
                type: "spring",
                stiffness: 80,
                damping: 18,
                delay: 0.2,
              }}
              style={{ height: "100%", borderRadius: 4, background: C.peach }}
            />
          </div>
          {!!streak && (
            <span
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                fontSize: 13,
                fontWeight: 800,
                color: "#8f431c",
                whiteSpace: "nowrap",
              }}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  d="M12 2c1 4 6 6 6 12a6 6 0 01-12 0c0-3 2-5 3-6 0 2 1 3 2 3 0-4-1-6 1-9z"
                  fill={C.peach}
                />
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
                background: C.butter,
                color: C.butterInk,
                boxShadow: `0 3px 0 ${C.butterLip}`,
                fontFamily: FONT,
                fontSize: 13,
                fontWeight: 900,
                whiteSpace: "nowrap",
              }}
            >
              Révision · {reviewDue}
            </motion.button>
          )}
        </div>
      </header>
    </div>
  );
}

function RoundButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
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
        background: C.bg,
        color: C.ink,
        boxShadow: RAISED_SM,
        display: "grid",
        placeItems: "center",
      }}
    >
      {children}
    </motion.button>
  );
}

/** Small leaves, dots and sparkles in the margins, the same for a given map height. */
function Decor({ width, height }: { width: number; height: number }) {
  const items: ReactNode[] = [];
  const tints = ["#f2c14e", "#f4a574", "#a897e0", "#cfe2f3"];
  for (let y = height - 140, i = 0; y > 200; y -= 150, i++) {
    const left = i % 2 === 0;
    const x = left ? 30 : width - 32;
    if (i % 3 === 2) {
      items.push(
        <path
          key={`s${i}`}
          d={`M${x} ${y - 10} l3 8 8 3 -8 3 -3 8 -3 -8 -8 -3 8 -3z`}
          fill={C.star}
          opacity=".75"
        />,
      );
    } else {
      items.push(
        <g
          key={`l${i}`}
          transform={`translate(${x} ${y})${left ? "" : " scale(-1 1)"}`}
        >
          <path
            d="M0 26 q-5 -22 5 -40"
            stroke={C.leaf}
            strokeWidth="3"
            fill="none"
            strokeLinecap="round"
          />
          <path d="M2 2 q12 -6 16 -18 q-12 2 -16 18z" fill={C.mint} />
          <path d="M1 14 q-13 -4 -18 -15 q13 0 18 15z" fill={C.mint} />
        </g>,
      );
    }
    items.push(
      <circle
        key={`d${i}`}
        cx={left ? width - 40 - (i % 3) * 8 : 36 + (i % 3) * 8}
        cy={y - 70}
        r={4 + (i % 3)}
        fill={tints[i % tints.length]}
        opacity=".4"
      />,
    );
  }
  return <g>{items}</g>;
}

function ModuleBanner({ zone, width }: { zone: Zone; width: number }) {
  const [bg, ink] =
    MODULE_COLORS[(zone.module.position - 1) % MODULE_COLORS.length];
  const total = zone.module.lessons.length;
  const complete = zone.done === total;
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        width,
        top: zone.bannerY,
        display: "flex",
        justifyContent: "center",
        pointerEvents: "none",
      }}
    >
      <span
        style={{
          maxWidth: width - 60,
          height: 32,
          padding: "0 16px",
          borderRadius: 16,
          background: zone.reached ? bg : C.bgDeep,
          color: zone.reached ? ink : C.faint,
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 14,
          fontWeight: 900,
          whiteSpace: "nowrap",
        }}
      >
        {!zone.reached && (
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
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
            <span style={{ fontSize: 13, fontWeight: 800, opacity: 0.8 }}>
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
          borderRadius: NODE_END / 2,
          background: reached ? C.butter : C.bg,
          boxShadow: reached ? `0 6px 0 ${C.butterLip}, ${RAISED}` : RAISED,
          display: "grid",
          placeItems: "center",
        }}
      >
        <svg
          width="26"
          height="26"
          viewBox="0 0 24 24"
          fill="none"
          stroke={reached ? C.butterInk : "#a39a90"}
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3.5" y="9" width="17" height="11" rx="2.5" />
          <path d="M3.5 13h17M12 9v11" />
          <path d="M12 9c-2-4-6-4-6-1.5S10 9 12 9zM12 9c2-4 6-4 6-1.5S14 9 12 9z" />
        </svg>
      </span>
      <span
        style={{
          position: "absolute",
          left: label.left,
          width: label.w,
          top: node.y,
          transform: "translateY(-50%)",
          textAlign: label.onRight ? "left" : "right",
          display: "flex",
          flexDirection: "column",
          fontSize: 13,
          fontWeight: 800,
          lineHeight: 1.3,
        }}
      >
        <span style={{ color: reached ? C.butterInk : C.faint }}>
          Fin du module
        </span>
        <span style={{ color: C.faint }}>
          {reached
            ? "Module terminé"
            : `Encore ${node.remaining} ${node.remaining > 1 ? "leçons" : "leçon"}`}
        </span>
        {!!node.module.bonus_stars && (
          <span
            style={{
              display: "flex",
              alignItems: "center",
              gap: 3,
              justifyContent: label.onRight ? "flex-start" : "flex-end",
              color: reached ? C.butterInk : C.faint,
            }}
          >
            <Star size={13} />
            {reached ? `+${node.module.bonus_stars} gagnées` : `+${node.module.bonus_stars} à gagner`}
          </span>
        )}
      </span>
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
    const label = side(node.x, size, width, 150);
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
          transition={{
            type: "spring",
            stiffness: 400,
            damping: 16,
            delay: appearDelay,
          }}
          whileTap={done ? { scale: 0.9, y: 4 } : undefined}
          onClick={() => {
            if (done) {
              play("tap");
              onOpen();
              return;
            }
            play("wrong");
            haptic(20);
            setHint(true);
            void shake.start({
              x: [0, -6, 6, -4, 4, 0],
              transition: { duration: 0.35 },
            });
            setTimeout(() => setHint(false), 1800);
          }}
          style={
            done
              ? {
                  ...common,
                  background: C.mint,
                  boxShadow: `0 6px 0 ${C.mintLip}, ${RAISED}`,
                }
              : { ...common, background: C.bg, boxShadow: RAISED }
          }
        >
          {done ? Icon.check(26, C.mintInk) : Icon.lock}
        </motion.button>
        {done && (
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              left: node.x - 30,
              top: top + size + 6,
              width: 60,
              display: "flex",
              justifyContent: "center",
              gap: 2,
            }}
          >
            {[0, 1, 2].map((i) => (
              <Star key={i} size={15} filled={(node.lesson.stars ?? 0) > i} />
            ))}
          </div>
        )}
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            left: label.left,
            width: label.w,
            top: node.y,
            transform: "translateY(-50%)",
            textAlign: label.onRight ? "left" : "right",
            fontSize: 13,
            fontWeight: 800,
            lineHeight: 1.3,
            color: done ? C.muted : C.faint,
            pointerEvents: "none",
          }}
        >
          {done
            ? node.lesson.title
            : `${node.index + 1} · ${node.lesson.title}`}
        </span>
        <AnimatePresence>
          {hint && lockedHint && (
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 4 }}
              style={{
                position: "absolute",
                zIndex: 5,
                top: top - 54,
                left: Math.min(Math.max(12, node.x - 110), width - 232),
                width: 220,
                borderRadius: 16,
                padding: "8px 12px",
                fontSize: 13,
                fontWeight: 800,
                textAlign: "center",
                background: C.surface,
                boxShadow: RAISED_SM,
              }}
            >
              Termine d’abord « {lockedHint} »
            </motion.div>
          )}
        </AnimatePresence>
      </>
    );
  }

  // Current lesson: bubble on the roomier side, the mug on the other.
  const preparing = node.lesson.status !== "ready";
  const bubble = side(node.x, size, width, 180);
  const mascotLeft = Math.min(
    Math.max(
      4,
      bubble.onRight ? node.x - size / 2 - MASCOT - 6 : node.x + size / 2 + 6,
    ),
    width - MASCOT - 4,
  );
  return (
    <>
      <motion.div
        aria-hidden="true"
        style={{
          position: "absolute",
          left: mascotLeft,
          top: node.y - 34,
          pointerEvents: "none",
        }}
        initial={{ opacity: 0, x: bubble.onRight ? 12 : -12, scale: 0.6 }}
        animate={{ opacity: 1, x: 0, scale: 1 }}
        transition={{
          type: "spring",
          stiffness: 320,
          damping: 16,
          delay: unlocking ? 1.25 : 0.3,
        }}
      >
        <Mascot mood={unlocking ? "bravo" : "hello"} size={MASCOT} />
      </motion.div>
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          left: node.x - 56,
          top: node.y - 56,
          width: 112,
          height: 112,
          borderRadius: 56,
          background: C.peachSoft,
          opacity: 0.7,
        }}
      />
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          left: node.x - (size + 16) / 2,
          top: node.y + 3.5 - (size + 16) / 2,
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
        initial={
          unlocking
            ? { scale: 0, rotate: -30 }
            : appearDelay
              ? { scale: 0 }
              : false
        }
        animate={{ scale: 1, rotate: 0 }}
        transition={{
          type: "spring",
          stiffness: 380,
          damping: 12,
          delay: unlocking ? 1.1 : appearDelay,
        }}
        whileTap={{ scale: 0.92, y: 6 }}
        onClick={() => {
          play("pop");
          haptic();
          onOpen();
        }}
        style={{
          ...common,
          background: C.peach,
          boxShadow: `0 7px 0 ${C.peachLip}, 8px 14px 22px #d3cbbf, -6px -6px 14px #fff`,
        }}
      >
        {Icon.play}
      </motion.button>
      <motion.button
        onClick={() => {
          play("tap");
          onOpen();
        }}
        initial={{ opacity: 0, x: bubble.onRight ? -14 : 14, scale: 0.9 }}
        animate={{ opacity: 1, x: 0, scale: 1 }}
        transition={{
          type: "spring",
          stiffness: 300,
          damping: 20,
          delay: unlocking ? 1.35 : 0.35,
        }}
        style={{
          position: "absolute",
          top: node.y - 46,
          left: bubble.left,
          width: bubble.w,
          border: "none",
          borderRadius: 20,
          padding: "11px 13px",
          textAlign: "left",
          display: "flex",
          flexDirection: "column",
          gap: 3,
          background: C.surface,
          color: C.ink,
          fontFamily: FONT,
          boxShadow: RAISED,
        }}
      >
        <span
          style={{
            fontSize: 12,
            fontWeight: 900,
            color: C.peachInk,
            textTransform: "uppercase",
            letterSpacing: ".04em",
          }}
        >
          Leçon {node.index + 1} ·{" "}
          {preparing ? "je la prépare" : `${LESSON_MINUTES} min`}
        </span>
        <span style={{ fontSize: 15, fontWeight: 900, lineHeight: 1.22 }}>
          {node.lesson.title}
        </span>
        <span
          style={{
            marginTop: 2,
            display: "flex",
            alignItems: "center",
            gap: 2,
          }}
        >
          {[0, 1, 2].map((i) => (
            <svg
              key={i}
              width="13"
              height="13"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                d="M12 2.5l2.9 6 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.2 1.3-6.6L2.5 9.3l6.6-.8z"
                fill="none"
                stroke={C.dots}
                strokeWidth="2.2"
              />
            </svg>
          ))}
          <span
            style={{
              marginLeft: 3,
              fontSize: 12,
              fontWeight: 800,
              color: C.faint,
            }}
          >
            à gagner
          </span>
        </span>
      </motion.button>
    </>
  );
}
